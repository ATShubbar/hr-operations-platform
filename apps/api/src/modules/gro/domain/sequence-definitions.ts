// Onboarding and final-exit sequences (ADR-018, MOB-01) — the prototype's two
// RUNBOOKS, word for word. A sequence is not a pile of unrelated tasks: each step
// names the steps it waits on, so a stuck file can say why.
//
// Fixed in code on purpose (ADR-018): editable step lists are a later decision.
// `day` is the target, counted from the sequence's start; `fee` is the standard
// government fee in SAR, SHOWN for information — recording what was paid is the
// Billing epic's (ADR-018, like the dependant fee in ADR-017).

export type SequenceKind = 'onboarding' | 'final_exit';

export interface SequenceStepDefinition {
  key: string;
  title: string;
  portal: string;
  day: number;
  needs: readonly string[];
  fee: number;
  note: string;
}

export interface SequenceDefinition {
  kind: SequenceKind;
  label: string;
  description: string;
  steps: readonly SequenceStepDefinition[];
}

export const SEQUENCES: Readonly<Record<SequenceKind, SequenceDefinition>> = {
  onboarding: {
    kind: 'onboarding',
    label: 'Onboarding',
    description: 'From block visa to first payroll.',
    steps: [
      { key: 'block-visa', title: 'Block visa requested', portal: 'Qiwa', day: 0, needs: [], fee: 2000, note: 'One visa drawn against the establishment quota.' },
      { key: 'visa-auth', title: 'Visa authorisation issued', portal: 'MOFA', day: 7, needs: ['block-visa'], fee: 0, note: 'Authorisation number sent to the embassy.' },
      { key: 'gamca', title: 'GAMCA medical cleared', portal: 'GAMCA', day: 14, needs: ['visa-auth'], fee: 0, note: 'Paid by the candidate at an approved centre.' },
      { key: 'enjaz', title: 'Visa stamped', portal: 'Enjaz', day: 21, needs: ['gamca'], fee: 200, note: 'Stamped in the passport at the consulate.' },
      { key: 'travel', title: 'Ticket booked and arrival logged', portal: 'Internal', day: 28, needs: ['enjaz'], fee: 0, note: 'Arrival date drives every deadline below.' },
      { key: 'medical-ksa', title: 'Medical inside the Kingdom', portal: 'Seha', day: 32, needs: ['travel'], fee: 300, note: 'Required before the iqama can be issued.' },
      { key: 'iqama', title: 'Iqama issued', portal: 'Muqeem', day: 40, needs: ['medical-ksa'], fee: 650, note: 'Ninety days from arrival is the statutory limit.' },
      { key: 'insurance', title: 'Medical insurance activated', portal: 'CCHI', day: 42, needs: ['iqama'], fee: 1800, note: 'Class B cover, dependants added separately.' },
      { key: 'gosi', title: 'GOSI registration filed', portal: 'GOSI', day: 44, needs: ['iqama'], fee: 0, note: 'Contributions start the month of registration.' },
      { key: 'contract', title: 'Contract authenticated', portal: 'Qiwa', day: 46, needs: ['iqama'], fee: 100, note: 'Arabic contract uploaded and countersigned.' },
      { key: 'bank', title: 'Salary account and WPS', portal: 'Internal', day: 50, needs: ['iqama', 'contract'], fee: 0, note: 'IBAN registered so the first pay run clears.' },
    ],
  },
  final_exit: {
    kind: 'final_exit',
    label: 'Final exit',
    description: 'From notice to departure and cancellation.',
    steps: [
      { key: 'notice', title: 'Notice recorded', portal: 'Qiwa', day: 0, needs: [], fee: 0, note: 'Resignation or termination logged with its reason.' },
      { key: 'clearance', title: 'Company clearance and handover', portal: 'Internal', day: 7, needs: ['notice'], fee: 0, note: 'Tools, accommodation and access returned.' },
      { key: 'settlement', title: 'Final settlement calculated', portal: 'Internal', day: 14, needs: ['clearance'], fee: 0, note: 'End-of-service, unused leave and any deductions.' },
      { key: 'gosi-close', title: 'GOSI deregistration', portal: 'GOSI', day: 18, needs: ['settlement'], fee: 0, note: 'Contributions stop the month of deregistration.' },
      { key: 'contract-close', title: 'Contract closed on Qiwa', portal: 'Qiwa', day: 18, needs: ['settlement'], fee: 0, note: 'Closure reason must match the notice.' },
      { key: 'exit-visa', title: 'Final exit visa issued', portal: 'Muqeem', day: 24, needs: ['gosi-close', 'contract-close'], fee: 100, note: 'Sixty days to travel once issued.' },
      { key: 'ticket', title: 'Repatriation ticket booked', portal: 'Internal', day: 28, needs: ['exit-visa'], fee: 0, note: 'To the point of hire, as the contract requires.' },
      { key: 'depart', title: 'Departure confirmed, iqama cancelled', portal: 'Muqeem', day: 32, needs: ['ticket'], fee: 0, note: 'Failure to confirm leaves the file open with fines.' },
    ],
  },
};

export const SEQUENCE_KINDS: readonly SequenceKind[] = ['onboarding', 'final_exit'];
