import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    ignores: [
      '**/.*',
      'jupyter_ruff',
      'node_modules',
      'dist',
      'coverage',
      '**/*.d.ts',
      'tests',
      '**/__tests__',
      'ui-tests'
    ]
  },
  {
    extends: [
      (await import('@eslint/js')).default.configs.recommended,
      (await import('typescript-eslint')).default.configs.recommended,
      (await import('eslint-config-prettier/flat')).default
    ],

    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'interface',
          format: ['PascalCase'],

          custom: {
            regex: '^I[A-Z]',
            match: true
          }
        }
      ],

      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'none'
        }
      ],

      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-use-before-define': 'off',

      quotes: [
        'error',
        'single',
        {
          avoidEscape: true,
          allowTemplateLiterals: false
        }
      ],

      curly: ['error', 'all'],
      eqeqeq: 'error',
      'prefer-arrow-callback': 'error'
    }
  }
]);
