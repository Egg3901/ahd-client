module.exports = {
  projects: [
    {
      displayName: 'unit',
      testMatch: [
        '<rootDir>/tests/unit/**/*.test.js',
        '<rootDir>/tests/integration/**/*.test.js',
      ],
      // Restrict Jest's file scanner to src + tests only.
      // Without this, jest-haste-map scans .worktrees/ and picks up duplicate
      // __mocks__ files, causing the wrong (stale) mock to be loaded.
      roots: ['<rootDir>/src', '<rootDir>/tests'],
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
