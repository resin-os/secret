import { DeviceInfo, groupTagsData } from '../lib/balena';

test('groupTagsData', () => {
	const res = groupTagsData([
		{
			device: { __id: 1 },
			id: 42,
			tag_key: 'DUT',
			value: 'dtype1',
		},
		{
			device: { __id: 2 },
			id: 42,
			tag_key: 'DUT',
			value: 'dtype2',
		},
		{
			device: { __id: 1 },
			id: 42,
			tag_key: 'model',
			value: 'model1',
		},
	]);

	expect(res).toHaveLength(2);
	expect(res[0].deviceId).toStrictEqual(1);
	expect(res[0].tags['DUT']).toStrictEqual('dtype1');
	expect(res[0].tags['model']).toStrictEqual('model1');
	expect(res[1].deviceId).toStrictEqual(2);
	expect(res[1].tags['DUT']).toStrictEqual('dtype2');
	expect(res[1].tags['model']).toBeUndefined();
});

describe('DeviceInfo', () => {
	const device = new DeviceInfo(3, {
		DUT: 'raspberrypi3',
		model: 'RPi0, wireless',
		other: 'data',
	}, null);

	it('generates a file name prefix', () => {
		expect(device.fileNamePrefix()).toStrictEqual('raspberrypi3-RPi0_wireless');
	});
});
