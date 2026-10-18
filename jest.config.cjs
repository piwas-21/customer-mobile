module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  collectCoverageFrom: ['src/core/**/*.ts', 'src/domain/**/*.ts'],
  coverageThreshold: { global: { branches: 80, functions: 85, lines: 85, statements: 85 } },
  clearMocks: true,
};
