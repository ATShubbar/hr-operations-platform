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
];
