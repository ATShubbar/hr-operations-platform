import base from '@hr/config/eslint';
import hr from '@hr/config/eslint-plugin';

export default [
  ...base,
  {
    plugins: { hr },
    rules: {
      'hr/rtl-safe-classes': 'error',
      // The brand gold may not carry status meaning (UX-01). Applies to files
      // whose path says "status"; Badge keeps its brand-filled variant because
      // its colour is decorative metadata, not workflow state.
      'hr/no-brand-in-status': 'error',
      // A bare <SelectValue /> shows the raw enum key in the trigger (UX-09).
      'hr/no-bare-select-value': 'error',
    },
  },
  {
    // UX-21: every date and time shown goes through src/lib/dates.ts, which ties
    // an Arabic date's leading number to the words after it. Formatted directly,
    // "3 أكتوبر 2026" is drawn day, then year, then month under the left-to-right
    // layout (ADR-012).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/dates.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "NewExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat']",
          message:
            'Use dateFormat() from @/lib/dates: an Arabic date formatted directly is drawn out of order (UX-21).',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@hr/dates',
              importNames: ['formatHijri', 'formatGregorian'],
              message:
                'Use hijriDate() / gregorianDate() from @/lib/dates: an Arabic date formatted directly is drawn out of order (UX-21).',
            },
          ],
        },
      ],
    },
  },
];
