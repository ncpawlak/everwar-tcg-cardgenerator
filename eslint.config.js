// ESLint flat config for the TypeScript app. Lints ONLY `src/` and `test/`.
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  // Global ignore: everything except the app source/tests (harness tooling,
  // spike, build output, and config files are out of scope for the app linter).
  {
    ignores: ['dist/**', 'node_modules/**', 'spike/**', '.agent/**', '*.config.ts', '*.config.js'],
  },
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    ...js.configs.recommended,
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      // TypeScript's own checker handles undefined identifiers and browser/node
      // globals; the base `no-undef` rule is redundant and noisy here.
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-unused-vars': 'off',
    },
  },
];
