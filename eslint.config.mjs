// Configuration ESLint (flat config). Style du projet : 2 espaces, quotes simples, points-virgules.
// Pour un nouveau fichier : public/js/** = navigateur (modules ES), le reste = Node.
import js from '@eslint/js';
import globals from 'globals';
import stylistic from '@stylistic/eslint-plugin';

export default [
  { ignores: ['node_modules/**'] },
  js.configs.recommended,
  {
    plugins: { '@stylistic': stylistic },
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'prefer-const': 'warn',
      eqeqeq: ['error', 'smart'],
      '@stylistic/indent': ['warn', 2, { SwitchCase: 1, flatTernaryExpressions: true }],
      '@stylistic/quotes': ['warn', 'single', { avoidEscape: true }],
      '@stylistic/semi': ['warn', 'always'],
      '@stylistic/comma-dangle': ['warn', 'always-multiline'],
      '@stylistic/no-trailing-spaces': 'warn',
      '@stylistic/eol-last': 'warn',
      '@stylistic/no-multiple-empty-lines': ['warn', { max: 2 }],
    },
  },
  {
    // Code du jeu : navigateur
    files: ['public/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    // Serveur (CommonJS) et scripts Node
    files: ['server.js', 'server/**/*.js', '*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['tests/**/*.{js,mjs}', '*.mjs'],
    languageOptions: { globals: { ...globals.node, WebSocket: 'readonly' } },
  },
];
