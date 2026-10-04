import type { LeaveStatus, LeaveType } from '@hr/contracts';

// Bilingual notification content for a leave decision (ADR-014, LEAVE-02).
// Notifications owns "how people are told"; Leave supplies only the fact.
const TYPE_LABELS: Record<LeaveType, { ar: string; en: string }> = {
  annual: { ar: 'إجازة سنوية', en: 'Annual leave' },
  sick: { ar: 'إجازة مرضية', en: 'Sick leave' },
  maternity: { ar: 'إجازة أمومة', en: 'Maternity leave' },
  paternity: { ar: 'إجازة أبوة', en: 'Paternity leave' },
  marriage: { ar: 'إجازة زواج', en: 'Marriage leave' },
  bereavement: { ar: 'إجازة وفاة', en: 'Bereavement leave' },
  hajj: { ar: 'إجازة حج', en: 'Hajj leave' },
  emergency: { ar: 'إجازة طارئة', en: 'Emergency leave' },
  unpaid: { ar: 'إجازة بدون راتب', en: 'Unpaid leave' },
};

// Only the statuses a notification is sent for (a decision or the filing).
const STATUS_LABELS: Partial<Record<LeaveStatus, { ar: string; en: string }>> = {
  approved: { ar: 'تمت الموافقة عليها', en: 'approved' },
  declined: { ar: 'رُفضت', en: 'declined' },
  filed: { ar: 'سُجّلت في الملف', en: 'filed' },
};

export function buildLeaveStatusContent(args: {
  ref: string;
  type: LeaveType;
  startDate: string;
  days: number;
  status: LeaveStatus;
}): { title: { ar: string; en: string }; body: { ar: string; en: string } } {
  const type = TYPE_LABELS[args.type];
  const status = STATUS_LABELS[args.status] ?? { ar: args.status, en: args.status };
  return {
    title: { ar: `${type.ar} ${args.ref}: ${status.ar}`, en: `${type.en} ${args.ref}: ${status.en}` },
    body: {
      ar: `طلب ${type.ar} (${args.days} يوم من ${args.startDate}) ${status.ar}.`,
      en: `The ${type.en.toLowerCase()} request (${args.days} days from ${args.startDate}) was ${status.en}.`,
    },
  };
}
