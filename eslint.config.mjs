import tseslint from 'typescript-eslint';

export default tseslint.config({
  ignores: ['**/dist/**', '**/node_modules/**'],
}, {
  files: ['packages/**/*.ts', 'tests/**/*.ts', 'examples/**/*.ts'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  },
  rules: {
    'no-debugger': 'error',
    'no-constant-binary-expression': 'error',
  },
});
