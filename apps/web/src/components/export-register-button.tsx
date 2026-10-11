'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { toastError, toastSuccess } from '@/components/ui/toast';
import { useCan } from '@/lib/session';

// "Export register" (SOON-01): the People list as a CSV file.
//
// `ids` is what the screen is showing — sent so the file matches the list. No
// `ids` means everyone this person may see. It is a FILTER: the server reads
// through the caller's own access and ignores an id they could not read, and it
// decides the columns (no pay or identifier numbers for someone who does not
// see them). Every export is written to the audit trail by the server.
//
// Shown only to someone who holds `employee.export`; the Auditor, who reads but
// does not carry data away, gets no button.

/** The server refuses more (employeeExportRequestSchema, EXPORT_MAX_IDS). */
const MAX_IDS = 2000;

export function ExportRegisterButton({
  path,
  ids,
  label,
  disabled = false,
}: {
  path: '/employees/export' | '/portal/employees/export';
  /** The rows on screen, in order. Leave out to export everyone. */
  ids?: string[];
  label: string;
  disabled?: boolean;
}) {
  const t = useTranslations('exportRegister');
  const router = useRouter();
  const allowed = useCan('employee.export');
  const [busy, setBusy] = useState(false);
  if (!allowed) return null;

  async function run() {
    if (ids && ids.length > MAX_IDS) {
      toastError(t('tooMany', { max: MAX_IDS }));
      return;
    }
    setBusy(true);
    try {
      // A file, not JSON — fetched directly so the bytes (BOM and all) reach the
      // browser untouched.
      const res = await fetch(`/api${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ids ? { ids } : {}),
      });
      if (res.status === 401) return void router.replace('/login');
      if (res.status === 403) return void toastError(t('notAllowed'));
      if (!res.ok) return void toastError(t('error'));
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1];
      const url = URL.createObjectURL(await res.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name ?? 'employee-register.csv';
      anchor.click();
      URL.revokeObjectURL(url);
      toastSuccess(t('done', { count: Number(res.headers.get('X-Export-Rows') ?? 0) }));
    } catch {
      toastError(t('error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" disabled={disabled || busy} onClick={() => void run()}>
      {busy ? t('exporting') : label}
    </Button>
  );
}
