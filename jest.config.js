/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/shared', '<rootDir>/services'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'shared/src/**/*.ts',
    'services/*/src/**/*.ts',
    '!**/*.d.ts',
  ],
};
