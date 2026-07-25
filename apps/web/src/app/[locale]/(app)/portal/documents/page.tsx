'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { DocumentListResponse, DocumentResponse, DownloadResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { dualDate, type Locale } from '@/lib/employee-format';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadError } from '@/components/ui/load-state';

const CATEGORIES = [
  'iqama',
  'passport',
  'visa',
  'contract',
  'gosi',
  'national_id',
  'cv',
  'other',
] as const;
type Category = (typeof CATEGORIES)[number];

// Client portal — documents (PORTAL-04) over GET /portal/documents. The rep sees
// only their OWN AVAILABLE documents; download opens a short-lived presigned URL
// (GET /portal/documents/:id/download) in a new tab — the blob never passes
// through this app. 403 → self-service not enabled.
export default function PortalDocumentsPage() {
  const t = useTranslations('portal');
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState('');

  // Callable so the error state can retry in place (UX-06).
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<DocumentListResponse>('/portal/documents');
      setDocuments(res.documents);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return;
      }
      // 403 = self-service off for this client. A state, not a failure: no retry.
      if (err instanceof ApiError && err.status === 403) setDisabled(true);
      else setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function download(doc: DocumentResponse) {
    try {
      const res = await apiFetch<DownloadResponse>(`/portal/documents/${doc.id}/download`);
      window.open(res.url, '_blank', 'noopener');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/login');
      else setError(t('error'));
    }
  }

  const categoryLabel = (c: string) =>
    CATEGORIES.includes(c as Category) ? t(`documents.category.${c}`) : c;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('documents.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('documents.subtitle')}</p>
      </div>

      {disabled && <EmptyState variant="restricted" title={t('notEnabled')} />}
      {error && <LoadError message={error} onRetry={() => void load()} hasContent={documents.length > 0} />}

      {!disabled && !error && (
        <DataTable
          rows={documents}
          loading={loading}
          rowKey={(d) => d.id}
          searchPlaceholder={t('documents.searchPlaceholder')}
          initialSort={{ key: 'title', dir: 'asc' }}
          emptyTitle={t('documents.empty')}
          columns={[
            {
              key: 'title',
              header: t('documents.colTitle'),
              sortValue: (d) => d.title,
              searchValues: (d) => [d.title, categoryLabel(d.category)],
              cell: (d) => <span className="font-medium">{d.title}</span>,
            },
            {
              key: 'category',
              header: t('documents.colCategory'),
              sortValue: (d) => categoryLabel(d.category),
              cell: (d) => categoryLabel(d.category),
            },
            {
              key: 'expiry',
              header: t('documents.colExpiry'),
              sortValue: (d) => d.expiryDate,
              cell: (d) => (
                <span className="whitespace-nowrap text-sm text-muted-foreground">
                  {dualDate(d.expiryDate, locale) ?? t('documents.none')}
                </span>
              ),
            },
          ]}
          actions={(d) => (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => void download(d)}>
                {t('documents.download')}
              </Button>
            </div>
          )}
        />
      )}
    </div>
  );
}
