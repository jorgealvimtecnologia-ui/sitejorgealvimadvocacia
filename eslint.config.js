import js from '@eslint/js';
import globals from 'globals';

/**
 * Config "flat" do ESLint 9.
 *
 * O sistema nasceu como um monólito grande e legado; por isso adotamos uma linha
 * de base pragmática: pegamos erros reais (recomendados) mas rebaixamos para aviso
 * o que é ruído neste código (variáveis não usadas, catch vazio proposital). A CI
 * falha em ERROS, não em avisos — assim o lint agrega valor sem travar o time.
 */
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'public/**',
      'storage/**',
      'backups/**',
      '**/*.min.js',
      'painel.html',
      'sw.js',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-constant-condition': ['warn', { checkLoops: false }],
      'no-control-regex': 'off',
      'no-useless-escape': 'warn',
      'no-cond-assign': ['error', 'except-parens'],
    },
  },
  {
    // Código que roda no NAVEGADOR (front-end) ou avaliado no contexto do browser (e2e): usa globais do browser.
    files: ['src/js/**/*.js', 'public/js/**/*.js', 'e2e/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
];
