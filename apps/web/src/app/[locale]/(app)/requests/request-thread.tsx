'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { RequestComment, RequestCommentListResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type { Locale } from '@/lib/employee-format';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RequestAttachments } from './request-attachments';

// A request's thread (ADR-016) — the prototype's Attachments + Comments blocks
// under the request detail. THREAD-01: comments; THREAD-02: files
// (request-attachments.tsx). Everything here is visible to everyone on the
// request; who may ADD is the caller's permission (`canPost` — the Auditor reads
// only). `base` is the request's own path: /requests/:id for staff and client
// managers, /me/requests/:id for the employee who raised it.
export function RequestThread({
  base,
  canPost,
  onPosted,
}: {
  base: string;
  canPost: boolean;
  // A reply from the requester's side can return a request waiting on them
  // (THREAD-03), so the page re-reads the request after anything is posted.
  onPosted?: () => void;
}) {
  const t = useTranslations('thread');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [comments, setComments] = useState<RequestComment[] | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  useEffect(() => {
    let live = true;
    setComments(null);
    setError('');
    apiFetch<RequestCommentListResponse>(`${base}/comments`)
      .then((r) => live && setComments(r.comments))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
        if (live) setError(t('error'));
      });
    return () => {
      live = false;
    };
  }, [base]);

  async function add(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setSendError('');
    try {
      const row = await apiFetch<RequestComment>(`${base}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      setComments((c) => [...(c ?? []), row]);
      setDraft('');
      onPosted?.();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setSendError(t('sendError'));
    } finally {
      setSending(false);
    }
  }

  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));

  return (
    <div className="flex flex-col gap-4">
      <RequestAttachments base={base} canPost={canPost} onAttached={onPosted} />

      <section className="flex flex-col gap-2 border-t pt-4">
        <h3 className="flex items-baseline gap-1.5 text-[13px] leading-[18px] font-medium">
          {t('comments')}
          {comments && comments.length > 0 && (
            <span className="font-normal text-muted-foreground tabular-nums">
              {comments.length}
            </span>
          )}
        </h3>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {comments && comments.length === 0 && (
          <p className="rounded-md bg-neutral-50 px-3.5 py-3 text-[13px] leading-[18px] text-muted-foreground ring-1 ring-foreground/10">
            {t('empty')}
          </p>
        )}
        {comments && comments.length > 0 && (
          <ol className="flex flex-col gap-3">
            {comments.map((c) => {
              const name = c.mine ? t('you') : (c.author?.name ?? t('unknown'));
              return (
                <li key={c.id} className="flex items-start gap-2.5">
                  <Avatar name={c.author?.name ?? '?'} size="sm" />
                  <div className="flex min-w-0 grow flex-col gap-0.5">
                    <span className="flex flex-wrap items-baseline gap-x-2 text-xs leading-4">
                      <span className="font-medium">{name}</span>
                      <span className="text-muted-foreground">
                        {c.author ? t(`kind.${c.author.kind}`) : ''} · {when(c.createdAt)}
                      </span>
                    </span>
                    <p
                      className={cn(
                        'text-sm leading-[20px] whitespace-pre-wrap text-pretty text-neutral-700',
                        '[overflow-wrap:anywhere]',
                      )}
                    >
                      {/* A comment is written in either language whatever the screen's;
                          bdi gives it its own direction inside the LTR layout (ADR-012). */}
                      <bdi>{c.body}</bdi>
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {canPost ? (
          <form onSubmit={add} className="flex flex-col gap-2">
            <Textarea
              rows={3}
              value={draft}
              maxLength={4000}
              placeholder={t('placeholder')}
              aria-label={t('placeholder')}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex items-center gap-2">
              {sendError && <p className="grow text-sm text-destructive">{sendError}</p>}
              <Button
                type="submit"
                size="sm"
                disabled={sending || !draft.trim()}
                className="ms-auto"
              >
                {sending ? t('adding') : t('add')}
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-xs leading-4 text-muted-foreground">{t('readOnly')}</p>
        )}
      </section>
    </div>
  );
}
