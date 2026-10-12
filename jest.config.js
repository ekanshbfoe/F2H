/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  resolver: '<rootDir>/jest.resolver.js',
  // Edge Functions import supabase-js with the Deno npm specifier; map it to node_modules here.
  moduleNameMapper: {
    '^npm:@supabase/supabase-js@2$': '@supabase/supabase-js',
    '^npm:@noble/(curves|hashes|ciphers)@[^/]+/(.*)$': '@noble/$1/$2',
  },
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/supabase/tests/', '/scripts/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@noble/.*|@scure/.*|standard-navigation)',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/app/**', '!src/types/**', '!**/*.d.ts'],
};
