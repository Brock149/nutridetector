module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Required for Reanimated v4 on RN 0.81+ (Expo SDK 54)
      "react-native-worklets/plugin",
    ],
  };
};



