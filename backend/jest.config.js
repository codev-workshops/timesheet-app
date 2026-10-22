module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js', // Exclude server startup file
    '!**/node_modules/**'
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: ['**/__tests__/**/*.test.js'],
  // Stryker copies the project into .stryker-tmp/ sandboxes; keep them out of normal runs.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.stryker-tmp/'],
  modulePathIgnorePatterns: ['<rootDir>/.stryker-tmp/'],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 65,
      lines: 60,
      statements: 60
    }
  },
  verbose: true,
  testTimeout: 10000
};
