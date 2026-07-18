import base from '@hr/config/eslint';
import hr from '@hr/config/eslint-plugin';

export default [
  ...base,
  {
    plugins: { hr },
    rules: {
      'hr/rtl-safe-classes': 'error',
    },
  },
];
