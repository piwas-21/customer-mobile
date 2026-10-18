import { defineConfig } from 'eslint/config';
import expo from 'eslint-config-expo/flat.js';
export default defineConfig([
  expo,
  { ignores: ['dist/**', 'coverage/**', 'src/api/generated.ts'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      'no-console': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
]);
