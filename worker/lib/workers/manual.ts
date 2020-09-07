import { EventEmitter } from 'events';
import * as etcher from 'etcher-sdk';
import * as readline from 'readline';
import * as Stream from 'stream';

export class ManualWorker extends EventEmitter implements Leviathan.Worker {
	readonly state: Leviathan.WorkerState = { network: {} };

	private readonly rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	async captureScreen() {
		throw new Error('unsupported operation: captureScreen');
	}

	async network() {
		throw new Error('unsupported operation: network');
	}

	async setup() {
		console.log('Manual worker is initialized');
	}

	private async prompt(text: string): Promise<string> {
		return await new Promise(resolve => this.rl.question(text, resolve));
	}

	private async getDrive(
		device: string,
	): Promise<etcher.sourceDestination.BlockDevice> {
		// Do not include system drives in our search
		const adapter = new etcher.scanner.adapters.BlockDeviceAdapter(() => false);
		const scanner = new etcher.scanner.Scanner([adapter]);

		await scanner.start();

		let drive;

		try {
			drive = scanner.getBy('device', device);
		} finally {
			scanner.stop();
		}
		if (!(drive instanceof etcher.sourceDestination.BlockDevice)) {
			throw new Error(`Cannot find ${device}`);
		}

		return drive;
	}

	private async flashToDisk(
		dst: etcher.sourceDestination.BlockDevice,
		src: Stream.Readable,
	) {
		const sdkSource = new etcher.sourceDestination.SingleUseStreamSource(src);

		const result = await etcher.multiWrite.pipeSourceToDestinations(
			sdkSource,
			// @ts-ignore
			[dst],
			(_: any, error: Error) =>
				console.log(`Failure during flashing: ${error}`),
			(progress: etcher.multiWrite.MultiDestinationProgress) => {
				this.emit('progress', progress);
			},
			true,
		);
		if (result.failures.size > 0) {
			const errorsMessage = new Array(...result.failures.values())
				.map(e => e.message)
				.join('\n');
			throw new Error(
				`Flashing failed with the following errors: ${errorsMessage}`,
			);
		}
	}

	async flash(stream: Stream.Readable) {
		const devicePath = await this.prompt(
			'Please plug the disk to this machine and enter the path to the device:',
		);
		console.log(`Flash destination path is ${devicePath}`);

		const drive = await this.getDrive(devicePath);
		console.log(`Start flashing the image`);
		await this.flashToDisk(drive, stream);
		console.log('Flashing completed');
	}

	async powerOff() {
		await this.prompt("Please power off the DUT. Press ENTER once it's done.");
	}

	async powerOn() {
		await this.prompt(
			"Please plug the flashed disk to the device and power on the DUT. Press ENTER once it's done.",
		);
	}

	async teardown() {
		this.rl.close();
		console.log('Manual worker is stopped');
	}
}
