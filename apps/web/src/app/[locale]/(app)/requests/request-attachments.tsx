'use client';

import { useEffect, useState, type DragEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Download, FileText, FileX, Trash2, Upload } from 'lucide-react';
import type {
  DownloadResponse,
  RequestAttachment,
  RequestAttachmentListResponse,
  RequestAttachmentUploadResponse,
} from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type { Locale } from '@/lib/employee-format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toastSuccess } from '@/components/ui/toast';

// Kept in step with @hr/contracts (REQUEST_ATTACHMENT_*) — values, not imported,
// so the page doesn't ship zod (the DS-06 landmine).
const TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_BYTES = 10 * 1024 * 1024;

// The thread's files (ADR-016, THREAD-02) — the prototype's Attachments block:
// a count, one row per file (name · who · when · size, Download), and the drop
// box. A file goes browser → storage directly, then confirm runs the virus
// check and the size/type check; only a file that passes is attached. A removed
// file stays as a "removed by …" line (a thread is a record). Only the person
// who uploaded a file removes it.
export function RequestAttachments({
  base,
  canPost,
  onAttached,
}: {
  base: string;
  canPost: boolean;
  onAttached?: () => void;
}) {
  const t = useTranslations('thread');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [files, setFiles] = useState<RequestAttachment[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState('');

  const url = `${base}/attachments`;

  async function load() {
    try {
      const r = await apiFetch<RequestAttachmentListResponse>(url);
      // In-flight uploads are shown by the drop box, not as rows.
      setFiles(r.attachments.filter((a) => a.status !== 'pending'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setLoadError(t('filesError'));
    }
  }

  useEffect(() => {
    setFiles(null);
    setLoadError('');
    setUploadError('');
    setConfirmRemove(null);
    void load();
  }, [base]);

  function bounce(err: unknown): boolean {
    if (err instanceof ApiError && err.status === 401) {
      router.replace('/login');
      return true;
    }
    return false;
  }

  async function upload(file: File) {
    setUploadError('');
    if (!TYPES.includes(file.type)) return setUploadError(t('wrongType'));
    if (file.size > MAX_BYTES) return setUploadError(t('tooLarge'));
    if (file.size === 0) return setUploadError(t('emptyFile'));
    setUploading(file.name);
    try {
      const issued = await apiFetch<RequestAttachmentUploadResponse>(url, {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name.slice(0, 200),
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });
      const put = await fetch(issued.upload.url, {
        method: 'PUT',
        headers: issued.upload.headers,
        body: file,
      });
      if (!put.ok) throw new Error(`upload failed: ${put.status}`);
      const done = await apiFetch<RequestAttachment>(`${url}/${issued.attachment.id}/confirm`, {
        method: 'POST',
      });
      if (done.status === 'available') {
        toastSuccess(t('attached'));
        onAttached?.();
      } else setUploadError(done.status === 'quarantined' ? t('quarantined') : t('rejected'));
      await load();
    } catch (err) {
      if (bounce(err)) return;
      setUploadError(err instanceof ApiError && err.status === 409 ? t('full') : t('uploadError'));
    } finally {
      setUploading(null);
    }
  }

  async function download(a: RequestAttachment) {
    setRowError('');
    setBusy(a.id);
    try {
      const res = await apiFetch<DownloadResponse>(`${url}/${a.id}/download`);
      window.open(res.url, '_blank', 'noopener');
    } catch (err) {
      if (!bounce(err)) setRowError(t('downloadError'));
    } finally {
      setBusy(null);
    }
  }

  async function remove(a: RequestAttachment) {
    setRowError('');
    setBusy(a.id);
    try {
      await apiFetch<RequestAttachment>(`${url}/${a.id}`, { method: 'DELETE' });
      setConfirmRemove(null);
      toastSuccess(t('removedToast'));
      await load();
    } catch (err) {
      if (!bounce(err)) setRowError(t('removeError'));
    } finally {
      setBusy(null);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && !uploading) void upload(file);
  }
  // Cancel dragenter as well as dragover: a fast drag can release before any
  // dragover reaches the box (the DS-09 landmine).
  function onDragOver(e: DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      day: 'numeric',
      month: 'short',
    }).format(new Date(iso));
  const size = (bytes: number) =>
    bytes < 1024 * 1024
      ? t('sizeKb', { n: Math.max(1, Math.round(bytes / 1024)) })
      : t('sizeMb', { n: (bytes / (1024 * 1024)).toFixed(1) });
  const who = (a: RequestAttachment) => (a.mine ? t('you') : (a.uploadedBy?.name ?? t('unknown')));
  const shown = files ?? [];
  const attachedCount = shown.filter((a) => a.status === 'available').length;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-baseline gap-2 text-[13px] leading-[18px] font-medium">
        <span className="grow">{t('attachments')}</span>
        {attachedCount > 0 && (
          <span className="font-mono text-[11px] font-normal text-muted-foreground tabular-nums">
            {attachedCount}
          </span>
        )}
      </h3>

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}
      {files && shown.length === 0 && (
        <p className="text-[13px] leading-[18px] text-muted-foreground">{t('noFiles')}</p>
      )}

      {shown.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {shown.map((a) => {
            if (a.status === 'removed') {
              return (
                <li
                  key={a.id}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs leading-4 text-muted-foreground border border-dashed"
                >
                  <FileX className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 grow">
                    {a.mine
                      ? t('removedLineMine', { date: when(a.removedAt ?? a.createdAt) })
                      : t('removedLine', { name: who(a), date: when(a.removedAt ?? a.createdAt) })}
                  </span>
                </li>
              );
            }
            if (a.status !== 'available') {
              // Only the uploader ever sees these: the check refused the file.
              return (
                <li
                  key={a.id}
                  className="flex items-center gap-2.5 rounded-lg bg-neutral-50 px-2.5 py-2 text-xs leading-4 text-muted-foreground ring-1 ring-foreground/10"
                >
                  <FileX className="size-4 shrink-0" aria-hidden />
                  <span className="flex min-w-0 grow flex-col gap-px">
                    <span className="truncate text-[13px] leading-[18px] text-neutral-700">
                      <bdi>{a.fileName}</bdi>
                    </span>
                    <span>
                      {a.status === 'quarantined' ? t('notAttachedVirus') : t('notAttachedCheck')}
                    </span>
                  </span>
                </li>
              );
            }
            const asking = confirmRemove === a.id;
            return (
              <li
                key={a.id}
                className="flex flex-col gap-2 rounded-lg px-2.5 py-2 ring-1 ring-foreground/10"
              >
                <div className="flex items-center gap-2.5">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="flex min-w-0 grow flex-col gap-px">
                    {/* A file name is in either language whatever the screen's: bdi gives it
                        its own direction; the span keeps the layout's alignment (ADR-012). */}
                    <span className="truncate text-[13px] leading-[18px]">
                      <bdi>{a.fileName}</bdi>
                    </span>
                    <span className="text-[11px] leading-[15px] text-muted-foreground">
                      {who(a)} · {when(a.createdAt)} · {a.sizeBytes ? size(a.sizeBytes) : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t('downloadName', { name: a.fileName ?? '' })}
                      title={t('download')}
                      disabled={busy === a.id}
                      onClick={() => void download(a)}
                    >
                      <Download className="size-3.5" aria-hidden />
                    </Button>
                    {canPost && a.mine && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t('removeName', { name: a.fileName ?? '' })}
                        title={t('remove')}
                        aria-expanded={asking}
                        disabled={busy === a.id}
                        onClick={() => setConfirmRemove(asking ? null : a.id)}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    )}
                  </span>
                </div>
                {asking && (
                  <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-xs leading-4">
                    <span className="grow text-muted-foreground">{t('removeConfirm')}</span>
                    <Button size="xs" variant="outline" onClick={() => setConfirmRemove(null)}>
                      {t('keep')}
                    </Button>
                    <Button
                      size="xs"
                      variant="destructive"
                      disabled={busy === a.id}
                      onClick={() => void remove(a)}
                    >
                      {t('remove')}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {rowError && <p className="text-sm text-destructive">{rowError}</p>}

      {canPost && (
        <label
          onDragEnter={onDragOver}
          onDragOver={onDragOver}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors',
            'has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
            dragging ? 'border-primary bg-muted' : 'bg-card hover:bg-muted/40',
            uploading && 'pointer-events-none opacity-60',
          )}
        >
          <input
            type="file"
            className="sr-only"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            disabled={!!uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void upload(file);
            }}
          />
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Upload className="size-[18px]" aria-hidden />
          </span>
          <span className="text-sm leading-5 font-medium">
            {uploading ? t('uploading') : t('drop')}
          </span>
          <span className="text-xs leading-4 text-muted-foreground">{t('dropHint')}</span>
        </label>
      )}
      {uploadError && (
        <p role="alert" className="text-sm text-destructive">
          {uploadError}
        </p>
      )}
    </section>
  );
}
