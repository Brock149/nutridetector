module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Reanimated v4 Babel plugin (works without New Architecture)
      "react-native-reanimated/plugin",
    ],
  };
};



