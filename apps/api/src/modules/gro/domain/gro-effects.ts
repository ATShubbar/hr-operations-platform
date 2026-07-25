import type { DocumentCategory } from '@hr/contracts';
import type { GroProcessStatus, GroProcessType } from '../../../generated/prisma/client';

// Which employee govdata expiry field a completed GRO process writes back (GRO-03).
// Only document-expiry-establishing types map; the rest (final_exit,
// profession_change, sponsorship_transfer, other) write nothing on completion.
export type ExpiryField = 'iqamaExpiry' | 'exitReentryExpiry' | 'workPermitExpiry';

const EXPIRY_FIELD: Partial<Record<GroProcessType, ExpiryField>> = {
  iqama_issue: 'iqamaExpiry',
  iqama_renewal: 'iqamaExpiry',
  exit_reentry: 'exitReentryExpiry',
  work_permit_renewal: 'workPermitExpiry',
};

export function expiryFieldFor(type: GroProcessType): ExpiryField | null {
  return EXPIRY_FIELD[type] ?? null;
}

// Which GRO process an expiring document category should auto-spawn (GRO-05).
// Conservative — only the categories that map to a clear renewal procedure. Other
// categories (passport, contract, gosi, national_id, cv, other) spawn nothing.
const SPAWN_TYPE: Partial<Record<DocumentCategory, GroProcessType>> = {
  iqama: 'iqama_renewal',
  visa: 'work_permit_renewal',
};

export function spawnTypeFor(category: DocumentCategory): GroProcessType | null {
  return SPAWN_TYPE[category] ?? null;
}

// Bilingual labels for the status-change notification (GRO-03).
const TYPE_LABEL: Record<GroProcessType, { ar: string; en: string }> = {
  iqama_issue: { ar: 'إصدار إقامة', en: 'Iqama issue' },
  iqama_renewal: { ar: 'تجديد إقامة', en: 'Iqama renewal' },
  exit_reentry: { ar: 'تأشيرة خروج وعودة', en: 'Exit/re-entry visa' },
  final_exit: { ar: 'خروج نهائي', en: 'Final exit' },
  profession_change: { ar: 'تغيير مهنة', en: 'Profession change' },
  sponsorship_transfer: { ar: 'نقل كفالة', en: 'Sponsorship transfer' },
  work_permit_renewal: { ar: 'تجديد رخصة عمل', en: 'Work permit renewal' },
  other: { ar: 'معاملة حكومية', en: 'Government process' },
};

const STATUS_LABEL: Record<GroProcessStatus, { ar: string; en: string }> = {
  not_started: { ar: 'لم تبدأ', en: 'not started' },
  in_progress: { ar: 'قيد التنفيذ', en: 'in progress' },
  submitted: { ar: 'مُقدَّمة', en: 'submitted' },
  approved: { ar: 'مُعتمدة', en: 'approved' },
  rejected: { ar: 'مرفوضة', en: 'rejected' },
  completed: { ar: 'مكتملة', en: 'completed' },
  cancelled: { ar: 'ملغاة', en: 'cancelled' },
};

export function buildGroStatusContent(
  type: GroProcessType,
  status: GroProcessStatus,
): { title: { ar: string; en: string }; body: { ar: string; en: string } } {
  const tl = TYPE_LABEL[type];
  const sl = STATUS_LABEL[status];
  return {
    title: { ar: 'تحديث معاملة حكومية', en: 'Government process update' },
    body: {
      ar: `المعاملة «${tl.ar}» أصبحت ${sl.ar}.`,
      en: `The "${tl.en}" process is now ${sl.en}.`,
    },
  };
}
