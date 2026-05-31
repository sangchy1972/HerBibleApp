module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // @formatjs/intl-locale's polyfill (loaded in index.ts for Hermes date
      // localization) uses ES2022 `static {}` class blocks, which
      // babel-preset-expo doesn't transform by default → bundle SyntaxError.
      '@babel/plugin-transform-class-static-block',
      // Reanimated's Babel plugin MUST stay last.
      'react-native-reanimated/plugin',
    ],
  };
};
