import eslint from '@eslint/js';
import ts from 'typescript-eslint';

export default [
  { ignores: ['dist/'] },
  eslint.configs.recommended,
  ...ts.configs.recommended,
];
