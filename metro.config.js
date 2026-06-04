const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const exclusionList = require('metro-config/src/defaults/exclusionList');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // Gradle/CMake outputs under node_modules — watching them causes ENOENT when
    // folders are created/deleted during `npm run android` / `./gradlew clean`.
    blockList: exclusionList([
      new RegExp(
        `${path.resolve(__dirname, 'node_modules')}/.+/android/build/.*`,
      ),
      new RegExp(
        `${path.resolve(__dirname, 'node_modules')}/.+/ios/build/.*`,
      ),
      new RegExp(`${path.resolve(__dirname, 'node_modules')}/.+/\\.cxx/.*`),
    ]),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
