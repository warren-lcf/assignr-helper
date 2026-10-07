// @ts-check
import eslint from '@eslint/js';
import angular from 'angular-eslint';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

/**
 * Lint rules encode the repository conventions: snake_case members and
 * variables, PascalCase types, `I`-prefixed interfaces, UPPER_SNAKE_CASE enum
 * members, explicit accessibility, no `any`, standalone OnPush components and
 * control-flow blocks instead of legacy structural directives.
 */
const naming_convention = [
  'error',
  { selector: 'default', format: ['snake_case'], leadingUnderscore: 'allow' },
  { selector: 'import', format: null },
  { selector: 'typeLike', format: ['PascalCase'] },
  { selector: 'interface', format: ['PascalCase'], custom: { regex: '^I[A-Z]', match: true } },
  { selector: 'enumMember', format: ['UPPER_CASE'] },
  { selector: 'variable', modifiers: ['const'], format: ['snake_case', 'UPPER_CASE'] },
  { selector: 'objectLiteralProperty', format: null },
  { selector: 'typeProperty', format: null },
  { selector: 'objectLiteralMethod', format: null },
];

const shared_ts_rules = {
  '@typescript-eslint/naming-convention': naming_convention,
  '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'explicit' }],
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
};

export default defineConfig([
  {
    files: ['src/**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      ...shared_ts_rules,
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/prefer-standalone': 'error',
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      '@angular-eslint/no-inputs-metadata-property': 'error',
      '@angular-eslint/no-outputs-metadata-property': 'error',
    },
  },
  {
    files: ['functions/src/**/*.ts', 'e2e/**/*.ts'],
    extends: [eslint.configs.recommended, tseslint.configs.recommended, tseslint.configs.stylistic],
    rules: shared_ts_rules,
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/naming-convention': 'off',
    },
  },
  {
    files: ['src/**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {
      '@angular-eslint/template/prefer-control-flow': 'error',
    },
  },
]);
