// Chains react-native-worklets' Jest resolver (drops the ".native" extensions so the
// worklets JS fallbacks load under Jest) in front of React Native's preset resolver.
const rnResolver = require('@react-native/jest-preset/jest/resolver.js');

module.exports = (request, options) => {
  if (
    options.basedir.includes('react-native-worklets') ||
    request.includes('react-native-worklets')
  ) {
    options = {
      ...options,
      extensions: options.extensions?.filter((ext) => !ext.includes('native')),
    };
  }
  return rnResolver(request, options);
};
