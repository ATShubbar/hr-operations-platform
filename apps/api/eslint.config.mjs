import base from '@hr/config/eslint';
import hr from '@hr/config/eslint-plugin';

export default [
  ...base,
  {
    plugins: { hr },
    rules: {
      'hr/module-boundaries': 'error',
    },
  },
  {
    // NestJS constructor injection resolves providers from emitted decorator
    // metadata, which requires VALUE imports of injected classes. The
    // consistent-type-imports rule would rewrite them to `import type`,
    // erasing the metadata and silently breaking DI — so it's off for the API.
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
