/*
 * Copyright 2018 balena
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const Bluebird = require('bluebird');
const retry = require('bluebird-retry');
const utils = require('../common/utils');
const config = require('config');
const isNumber = require('lodash/isNumber');
const { fs } = require('mz');
const once = require('lodash/once');
const pipeline = Bluebird.promisify(require('stream').pipeline);
const request = require('request');
const rp = require('request-promise');

const exec = Bluebird.promisify(require('child_process').exec);

module.exports = class Worker {
	constructor(
		deviceType,
		logger = { log: console.log, status: console.log, info: console.log },
	) {
		this.deviceType = deviceType;
		this.url = `${config.get('worker.url')}:${config.get('worker.port')}`;
		this.logger = logger;
	}

	async flash(imagePath) {
		this.logger.log('Preparing to flash');

		await new Promise(async (resolve, reject) => {
			const req = rp.post({ uri: `${this.url}/dut/flash` });

			req.catch(error => {
				reject(error);
			});
			req.finally(() => {
				if (lastStatus !== 'done') {
					reject(new Error('Unexpected end of TCP connection'));
				}

				resolve();
			});

			let lastStatus;
			req.on('data', data => {
				const computedLine = RegExp('(.+?): (.*)').exec(data.toString());

				if (computedLine) {
					if (computedLine[1] === 'error') {
						req.cancel();
						reject(new Error(computedLine[2]));
					}

					if (computedLine[1] === 'progress') {
						once(() => {
							this.logger.log('Flashing');
						});
						// Hide any errors as the lines we get can be half written
						const state = JSON.parse(computedLine[2]);
						if (state != null && isNumber(state.percentage)) {
							this.logger.status({
								message: 'Flashing',
								percentage: state.percentage,
							});
						}
					}

					if (computedLine[1] === 'status') {
						lastStatus = computedLine[2];
					}
				}
			});

			pipeline(fs.createReadStream(imagePath), req);
		});
		this.logger.log('Flash completed');
	}

	async on() {
		this.logger.log('Powering on DUT');
		await rp.post(`${this.url}/dut/on`);
		this.logger.log('DUT powered on');
	}

	async off() {
		this.logger.log('Powering off DUT');
		await rp.post(`${this.url}/dut/off`);
	}

	async network(network) {
		await rp.post({
			uri: `${this.url}/dut/network`,
			body: network,
			json: true,
		});
	}

	proxy(proxy) {
		return rp.post({ uri: `${this.url}/proxy`, body: proxy, json: true });
	}

	ip(
		target,
		timeout = {
			interval: 10000,
			tries: 60,
		},
	) {
		return /.*\.local/.test(target)
			? retry(
					() => {
						return rp.get({
							uri: `${this.url}/dut/ip`,
							body: { target },
							json: true,
						});
					},
					{
						max_tries: timeout.tries,
						interval: timeout.interval,
						throw_original: true,
					},
			  )
			: target;
	}

	async teardown() {
		await rp.post({ uri: `${this.url}/teardown`, json: true });
	}

	capture(action) {
		switch (action) {
			case 'start':
				return rp.post({ uri: `${this.url}/dut/capture`, json: true });
			case 'stop':
				return request.get({ uri: `${this.url}/dut/capture` });
		}
	}

	async executeCommandInHostOS(
		command,
		target,
		timeout = {
			interval: 10000,
			tries: 10,
		},
	) {
		let ip = /.*\.local/.test(target) ? await this.ip(target) : target;

		return retry(
			async () => {
				const result = await utils.executeCommandOverSSH(
					`source /etc/profile ; ${command}`,
					{
						host: ip,
						port: '22222',
						username: 'root',
					},
				);

				if (typeof result.code === 'number' && result.code !== 0) {
					throw new Error(
						`"${command}" failed. stderr: ${result.stderr}, stdout: ${result.stdout}, code: ${result.code}`,
					);
				}

				return result.stdout;
			},
			{
				max_tries: timeout.tries,
				interval: timeout.interval,
				throw_original: true,
			},
		);
	}

	async pushContainerToDUT(target, source, containerName){
		// use cli to push container 
		await retry(
			async () => {
				await exec(
					`balena push ${target} --source ${source} --nolive --detached`,
				);
			},
			{
				max_tries: 10,
				interval: 5000,
			},
		);

		// now wait for new container to be available
		await utils.waitUntil(async () => {
			const state = await rp({
				method: 'GET',
				uri: `http://${target}:48484/v2/containerId`,
				json: true,
			});

			return state.services[containerName] != null;
		});

		const state = await rp({
			method: 'GET',
			uri: `http://${target}:48484/v2/containerId`,
			json: true,
		});
		
		return state
	}

	async executeCommandInContainer(command, containerName, target){
		// get container ID
		const state = await rp({
			method: 'GET',
			uri: `http://${target}:48484/v2/containerId`,
			json: true,
		});

		const stdout = await this.executeCommandInHostOS(
				`balena exec ${state.services[containerName]} ${command}`,
				target,
		);
		return stdout;
	}

	async pushFileToDUT(localPath, remotePath, target, sshKeyPath) {
		this.logger.log(`Sending ${localPath} to DUT`);
		const config = {
			host: await this.ip(target),
			port: '22222',
			username: 'root',
			identity: sshKeyPath,
		};
		return new Promise((resolve, reject) => {
			const p = require('child_process').spawn('scp', [
				'-B',
				'-P', `${config.port}`,
				'-o', `User=${config.username}`,
				"-o", `Compression=yes`,
				'-o', `StrictHostKeyChecking=no`,
				'-o', `UserKnownHostsFile=/dev/null`,
				`${localPath}`,
				`${config.host}:${remotePath}`,
			], {
				stdio: 'inherit',
				// stdio: ['ignore', 'inherit', 'inherit'],
			});
			p.on('error', reject);
			p.on('exit', (code, signal) => {
				if (code !== 0) {
					reject(new Error(`Process exited with exit code ${code}: ${p.stdout}`))
				} else {
					resolve(remotePath)
				}
			});
		});
	}
};
