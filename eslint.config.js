// @ts-check
const ionic = require('@ionic/eslint-config/recommended');
const angular = require('angular-eslint');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  {
    ignores: ['www/**', 'dist/**', 'coverage/**', '.angular/**', 'android/**', 'ios/**'],
  },
  ionic,
  {
    files: ['**/*.ts'],
    extends: [angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      '@angular-eslint/component-class-suffix': [
        'error',
        {
          suffixes: ['Page', 'Component'],
        },
      ],
    },
  },
  {
    // Ionic's cached pages and outlet shell use eager checks for shared plain fields.
    files: ['src/app/app.component.ts', 'src/app/**/*.page.ts'],
    rules: {
      '@angular-eslint/prefer-on-push-component-change-detection': 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
