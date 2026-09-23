const js = require('@eslint/js');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  { ignores: ['node_modules/**'] },
  js.configs.recommended,
  {
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        __dirname: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
  prettierConfig,
];
