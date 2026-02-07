/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      '$0': 'jest',
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 120000,
    },
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/DerivedDataDetox/Build/Products/Debug-iphonesimulator/OpenInvite.app',
      build: 'xcodebuild -workspace ios/OpenInvite.xcworkspace -scheme OpenInvite -configuration Debug -sdk iphonesimulator -derivedDataPath ios/DerivedDataDetox',
    },
    'ios.release': {
      type: 'ios.app',
      binaryPath: 'ios/DerivedDataDetox/Build/Products/Release-iphonesimulator/OpenInvite.app',
      build: 'xcodebuild -workspace ios/OpenInvite.xcworkspace -scheme OpenInvite -configuration Release -sdk iphonesimulator -derivedDataPath ios/DerivedDataDetox',
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: {
        type: 'iPhone 16 Pro',
      },
    },
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
    },
    'ios.sim.release': {
      device: 'simulator',
      app: 'ios.release',
    },
  },
};
