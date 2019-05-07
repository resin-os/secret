/*
 * Copyright 2018 balena
 *
 * @license Apache-2.0
 */

'use strict';

const noop = require('lodash/noop');
const Bluebird = require('bluebird');
const fse = require('fs-extra');
const { join } = require('path');
const { homedir } = require('os');

module.exports = [
  {
    setup: async function() {
      const Worker = require(join(this.frameworkPath, 'workers', this.options.worker.type));
      const BalenaOS = require(join(this.frameworkPath, 'components', 'os', 'balenaos'));
      const Balena = require(join(this.frameworkPath, 'components', 'balena', 'sdk'));
      const CLI = require(join(this.frameworkPath, 'components', 'balena', 'cli'));
      const DeviceApplication = require(join(this.frameworkPath, 'components', 'balena', 'utils'));

      this.context = { utils: require(join(this.frameworkPath, 'common', 'utils')) };

      fse.ensureDirSync(this.options.tmpdir);
      this.context = {
        deviceType: require(join(
          this.frameworkPath,
          '..',
          'contracts',
          'contracts',
          'hw.device-type',
          this.options.deviceType,
          'contract.json'
        ))
      };

      this.context = { sshKeyPath: join(homedir(), 'id') };

      this.context = { balena: { sdk: new Balena(this.options.balena.apiUrl) } };

      await this.context.balena.sdk.loginWithToken(this.options.balena.apiKey);
      this.teardown.register(() => {
        return this.context.balena.sdk.logout().catch(
          {
            code: 'BalenaNotLoggedIn'
          },
          noop
        );
      });

      this.context = { balena: { application: this.options.balena.application } };

      await this.context.balena.sdk.createApplication(
        this.context.balena.application.name,
        this.context.deviceType.slug,
        {
          delta: this.context.balena.application.env.delta
        }
      );
      this.teardown.register(() => {
        return this.context.balena.sdk
          .removeApplication(this.context.balena.application.name)
          .catch(
            {
              code: 'BalenaNotLoggedIn'
            },
            noop
          )
          .catch(
            {
              code: 'BalenaApplicationNotFound'
            },
            noop
          );
      });

      await this.context.balena.sdk.addSSHKey(
        this.options.balena.sshKeyLabel,
        await this.context.utils.createSSHKey(this.context.sshKeyPath)
      );
      this.teardown.register(() => {
        return Bluebird.resolve(
          this.context.balena.sdk.removeSSHKey(this.options.balena.sshKeyLabel)
        ).catch(
          {
            code: 'BalenaNotLoggedIn'
          },
          noop
        );
      });

      this.context = {
        worker: new Worker('main worker', this.context.deviceType.slug, {
          devicePath: this.options.worker.device
        })
      };

      this.context = {
        os: new BalenaOS({
          deviceType: this.context.deviceType.slug,
          network: this.options.balenaOS.network
        })
      };

      // Device Provision with preloaded application
      await this.context.os.fetch(this.options.tmpdir, {
        type: this.options.balenaOS.download.type,
        version: this.options.balenaOS.download.version,
        source: this.options.balenaOS.download.source
      });

      // Preload image
      this.context = { balena: { deviceApplicationChain: new DeviceApplication().getChain() } };

      await this.context.balena.deviceApplicationChain
        .init({
          url: 'https://github.com/balena-io-projects/balena-cpp-hello-world.git',
          sdk: this.context.balena.sdk,
          path: this.options.tmpdir
        })
        .then(chain => {
          return chain.clone();
        })
        .then(async chain => {
          return chain.push(
            {
              name: 'master'
            },
            {
              name: 'balena',
              url: await this.context.balena.sdk.getApplicationGitRemote(
                this.context.balena.application.name
              )
            }
          );
        })
        .then(chain => {
          this.context = { preload: { hash: chain.getPushedCommit() } };
          return chain.emptyCommit();
        })
        .then(chain => {
          return chain.push({ name: 'master' });
        });

      await new CLI().preload(this.context.os.image.path, {
        app: this.context.balena.application.name,
        commit: this.context.preload.hash,
        pin: true
      });

      this.context = { balena: { uuid: await this.context.balena.sdk.generateUUID() } };
      this.context.os.addCloudConfig(
        await this.context.balena.sdk.getDeviceOSConfiguration(
          this.context.balena.uuid,
          await this.context.balena.sdk.register(
            this.context.balena.application.name,
            this.context.balena.uuid
          ),
          this.context.os.image.version
        )
      );

      await this.context.worker.ready();
      await this.context.worker.flash(this.context.os);
      await this.context.worker.on();
      this.teardown.register(() => {
        return this.context.worker.off();
      });

      // Checking if device is reachable
      console.log('Waiting for device to be online');
      await this.context.utils.waitUntil(() => {
        return this.context.balena.sdk.isDeviceOnline(this.context.balena.uuid);
      });
    },
    tests: ['register', 'preload', 'move', 'hostapp']
  }
];