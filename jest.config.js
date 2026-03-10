module.exports = {
  projects: [
    {
      displayName: 'unit',
      testMatch: [
        '<rootDir>/tests/unit/**/*.test.js',
        '<rootDir>/tests/integration/**/*.test.js',
      ],
      testEnvironment: 'node',
      moduleNameMapper: {
        '^electron$': '<rootDir>/tests/__mocks__/electron.js',
        '^electron-store$': '<rootDir>/tests/__mocks__/electron-store.js',
        '^electron-updater$': '<rootDir>/tests/__mocks__/electron-updater.js',
      },
      clearMocks: true,
      coverageDirectory: 'coverage',
      coveragePathIgnorePatterns: ['/node_modules/', '/tests/'],
      coverageThreshold: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  ],
};
