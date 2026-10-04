import type { RequestStatus } from '@hr/contracts';

// Bilingual notification content for a request status change (REQ-03). Notifications
// owns "how people are told"; the producer (Requests) supplies only the fact. The
// request `title` is user-entered free text (shown verbatim); the status is
// labelled ar/en here.
const STATUS_LABELS: Record<RequestStatus, { ar: string; en: string }> = {
  open: { ar: 'مفتوح', en: 'Open' },
  in_progress: { ar: 'قيد المعالجة', en: 'In progress' },
  resolved: { ar: 'تم الحل', en: 'Resolved' },
  closed: { ar: 'مغلق', en: 'Closed' },
  cancelled: { ar: 'ملغى', en: 'Cancelled' },
};

export interface RequestContent {
  title: { ar: string; en: string };
  body: { ar: string; en: string };
}

export function buildRequestStatusContent(args: {
  title: string;
  status: RequestStatus;
}): RequestContent {
  const label = STATUS_LABELS[args.status];
  return {
    title: { ar: `تحديث حالة الطلب: ${label.ar}`, en: `Request updated: ${label.en}` },
    body: {
      ar: `تم تحديث حالة طلبك «${args.title}» إلى «${label.ar}».`,
      en: `Your request "${args.title}" is now "${label.en}".`,
    },
  };
}

// A new comment on a request's thread (ADR-016, THREAD-01). The comment text is
// NOT copied into the notification (it is free text the reader opens in the
// thread itself); the request title is shown verbatim, as for status changes.
export function buildRequestCommentContent(args: { title: string }): RequestContent {
  return {
    title: { ar: 'تعليق جديد على طلب', en: 'New comment on a request' },
    body: {
      ar: `أُضيف تعليق جديد على طلبك «${args.title}».`,
      en: `There's a new comment on "${args.title}".`,
    },
  };
}
