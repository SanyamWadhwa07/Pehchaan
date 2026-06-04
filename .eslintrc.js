module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    'react-native/no-inline-styles': 'warn',
    // @react-native re-enables `quotes` after eslint-config-prettier; Prettier owns style.
    quotes: 'off',
  },
};
