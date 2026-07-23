import type { DocumentCategory } from '@hr/contracts';

// Bilingual notification content for a document-expiry alert (NOTIF-05; moved
// here from the document-expiry module when NOTIF-05 accepted ADR-004 —
// Notifications owns "how people are told", the producer owns the fact). Titles/
// bodies are stored ar+en (NOTIF-02) so each recipient reads their own language;
// the email channel (NOTIF-03) renders the same content.
const CATEGORY_LABELS: Record<DocumentCategory, { ar: string; en: string }> = {
  iqama: { ar: 'الإقامة', en: 'Iqama' },
  passport: { ar: 'جواز السفر', en: 'Passport' },
  visa: { ar: 'التأشيرة', en: 'Visa' },
  contract: { ar: 'العقد', en: 'Contract' },
  gosi: { ar: 'التأمينات الاجتماعية', en: 'GOSI' },
  national_id: { ar: 'الهوية الوطنية', en: 'National ID' },
  cv: { ar: 'السيرة الذاتية', en: 'CV' },
  other: { ar: 'المستند', en: 'Document' },
};

export interface ExpiryContent {
  title: { ar: string; en: string };
  body: { ar: string; en: string };
}

// `days` ≤ 0 means the document is already due/expired (tier 0); otherwise it is
// the whole days remaining. `expiryDate` is the Gregorian ISO date (YYYY-MM-DD).
export function buildExpiryContent(args: {
  category: DocumentCategory;
  title: string;
  expiryDate: string;
  days: number;
}): ExpiryContent {
  const label = CATEGORY_LABELS[args.category];
  if (args.days <= 0) {
    return {
      title: { ar: `انتهت صلاحية ${label.ar}`, en: `${label.en} has expired` },
      body: {
        ar: `انتهت صلاحية المستند «${args.title}» بتاريخ ${args.expiryDate}. يلزم اتخاذ إجراء.`,
        en: `The document "${args.title}" expired on ${args.expiryDate}. Action is required.`,
      },
    };
  }
  return {
    title: { ar: `قرب انتهاء صلاحية ${label.ar}`, en: `${label.en} expiring soon` },
    body: {
      ar: `تنتهي صلاحية المستند «${args.title}» خلال ${args.days} يوم (بتاريخ ${args.expiryDate}).`,
      en: `The document "${args.title}" expires in ${args.days} day(s) on ${args.expiryDate}.`,
    },
  };
}
