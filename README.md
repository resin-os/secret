# Leviathan

[![GitHub Issues](https://img.shields.io/github/issues/balena-os/leviathan.svg)](https://github.com/balena-os/leviathan/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/balena-os/leviathan.svg)](https://github.com/balena-os/leviathan/pulls)
[![node](https://img.shields.io/badge/node-v9.0.0-green.svg)](https://nodejs.org/download/release/v9.0.0/)
[![License](https://img.shields.io/badge/license-APACHE%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

> A distributed "remote" testing framework 

## Getting Started

To set up Leviathan both hardware and software need to be configured. If you are setting up your standalone testbot, then please follow the instructions given below carefully before running tests on the Device Under Test (DUT). 


### Clone the repository

- Clone this repository with `git clone --recursive` or   
- Run `git clone` and then `git submodule update --init --recursive` to install submodules.


### Prerequisites needed

- Download the image you want to test on your DUT from [balena.io/os](balena.io/os)


### Configuration needed

- Start building your standalone testbot by [following the guide](https://github.com/balena-io/testbot/blob/master/documentation/getting-started.md#quick-start-guide-for-testbot). 
- Create your test configuration, by creating a `config.json` file in the `workspace` directory, following instructions mentioned in the [testbot docs](https://github.com/balena-io/testbot/blob/master/documentation/getting-started.md#run-your-first-test).
- Move the image zip file you want to test with inside the `workspace` directory in Leviathan.
- Extract the image, rename it to balena.img, and recompress the image into the `.gz` format. The final file would look like `balena.img.gz` file and has to be in the `./leviathan/workspace` directory. 


### Run first tests 

Navigate to the `workspace` directory and run 

```
./run-tests.sh
```

For more instruction on getting started with Leviathan Testing, refer to the [getting started](./documentation/Getting-started.md) guide. 

## [rig-owners] Deployment Instructions  

**To push a new release to balenaCloud application**

- Run the command with the <appname> as the name of your application.

```
balena push <appname>
```

To monitior leviathan tests connected to its pipeline for the rigs, you would need to request Jenkins access.

## Support

If you're having any problem, please [raise an issue][newissue] on GitHub and the balena team will be happy to help.

## Contribute

- Issue Tracker: [github.com/balena-os/leviathan/issues][issues]
- Source Code: [github.com/balena-os/leviathan][source]

## License

The project is licensed under the Apache 2.0 license.

[issues]: https://github.com/balena-os/leviathan/issues
[newissue]: https://github.com/balena-os/leviathan/issues/new
[source]: https://github.com/balena-os/leviathan
