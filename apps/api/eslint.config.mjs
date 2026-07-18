import base from '@hr/config/eslint';

export default [
  ...base,
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
