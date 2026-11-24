import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'public/**/*', 'workspace/**/*']
  },
  firebaseRulesPlugin.configs['flat/recommended']
];
