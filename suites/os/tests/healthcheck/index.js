/* Copyright 2019 balena
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

const { delay } = require('bluebird');
const retry = require('bluebird-retry');
const rp = require('request-promise');

module.exports = {
	title: 'Container healthcheck test',
	os: {
		type: 'object',
		required: ['variant'],
		properties: {
			variant: {
				type: 'string',
				const: 'Development',
			},
		},
	},
	run: async function(test) {
		const ip = await this.context.get().worker.ip(this.context.get().link);
		await retry(
			async () => {
				await this.context.get().balena.cli.push(ip, {
					source: __dirname,
				});
			},
			{
				max_tries: 20,
				interval: 1000,
			},
		);
		await this.context.get().utils.waitUntil(async () => {
			const state = await rp({
				method: 'GET',
				uri: `http://${ip}:48484/v2/containerId`,
				json: true,
			});
			return state.services.healthcheck != null;
		});
		const state = await rp({
			method: 'GET',
			uri: `http://${ip}:48484/v2/containerId`,
			json: true,
		});

		// Change health
		await this.context
			.get()
			.worker.executeCommandInHostOS(
				`balena exec ${state.services.healthcheck} rm /tmp/health`,
				ip,
			);
		await delay(4000);

		const events = JSON.parse(
			await this.context
				.get()
				.worker.executeCommandInHostOS(
					`printf '["null"'; balena events --filter container=${state.services.healthcheck} --filter event=health_status --since 1 --until "$(date +%Y-%m-%dT%H:%M:%S.%NZ)" --format '{{json .}}' | while read LINE; do printf ",$LINE"; done; printf ']'`,
					ip,
				),
		);

		test.same(
			events.reduce(function(result, element) {
				if (element.status != null) {
					result.push(element.status);
				}
				return result;
			}, []),
			['health_status: healthy', 'health_status: unhealthy'],
			'Container should go from healthy to unhealthy',
		);
	},
};
