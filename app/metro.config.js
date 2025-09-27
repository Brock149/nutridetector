// Minimal Metro config to recognize binary model assets
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ensure .tflite files are treated as assets
config.resolver.assetExts.push('tflite');

module.exports = config;


