/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/scorers', '<rootDir>/examples'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', 'scorers/**/*.ts', '!**/*.test.ts'],
};
