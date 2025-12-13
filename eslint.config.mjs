// ESLint flat config for TypeScript, ported from .eslintrc.json
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    ignores: ['out', 'dist', '**/*.d.ts'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 6,
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'import',
          format: ['camelCase', 'PascalCase'],
        },
      ],
      curly: 'warn',
      eqeqeq: 'warn',
      'no-throw-literal': 'warn',
      semi: 'off',
    },
  },
]; 
