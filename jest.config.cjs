module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'app/**/*.tsx',
    '!src/api/generated.ts',
    '!src/test/**',
    '!**/*.test.*',
  ],
  coverageThreshold: { global: { branches: 80, functions: 85, lines: 85, statements: 85 } },
  coverageDirectory: 'coverage/native',
  clearMocks: true,
};
