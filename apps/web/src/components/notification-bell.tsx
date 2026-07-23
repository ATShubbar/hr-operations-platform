'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { NotificationListResponse, NotificationResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';

type Locale = 'ar' | 'en';
const POLL_MS = 60_000;

// Largest-unit relative time, localized. `< 1 min` collapses to a "just now"
// string the caller passes in (Intl.RelativeTimeFormat has no sub-minute unit
// we want to show).
function relativeTime(iso: string, locale: Locale, justNow: string): string {
  const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return justNow;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const min = Math.round(sec / 60);
  if (min < 60) return rtf.format(-min, 'minute');
  const hr = Math.round(min / 60);
  if (hr < 24) return rtf.format(-hr, 'hour');
  const day = Math.round(hr / 24);
  if (day < 30) return rtf.format(-day, 'day');
  const mon = Math.round(day / 30);
  if (mon < 12) return rtf.format(-mon, 'month');
  return rtf.format(-Math.round(mon / 12), 'year');
}

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

// Notification bell (NOTIF-06). Header surface over the NOTIF-02 read API: an
// unread-count badge, a popover list of recent notifications in the reader's
// language, click-to-read, and mark-all-read. Light polling (no websockets) —
// proportionate for an internal ops tool. Rendered inside the authenticated
// shell, so every principal (staff or client rep) sees their own.
export function NotificationBell() {
  const t = useTranslations('notifications');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationResponse[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(
    async (withList: boolean) => {
      try {
        const res = await apiFetch<NotificationListResponse>('/notifications');
        setUnread(res.unreadCount);
        if (withList) setItems(res.notifications);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) router.replace('/login');
      }
    },
    [router],
  );

  // Initial unread count + light polling.
  useEffect(() => {
    void refresh(false);
    const id = setInterval(() => void refresh(false), POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      await refresh(true);
      setLoading(false);
    }
  }

  async function markRead(n: NotificationResponse) {
    if (n.readAt) return;
    try {
      await apiFetch(`/notifications/${n.id}/read`, { method: 'POST' });
      setItems((xs) =>
        xs.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
      );
      setUnread((u) => Math.max(0, u - 1));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/login');
    }
  }

  async function markAll() {
    try {
      await apiFetch('/notifications/read-all', { method: 'POST' });
      setItems((xs) => xs.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
      setUnread(0);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/login');
    }
  }

  const hasUnread = items.some((x) => !x.readAt);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={t('open')}
        onClick={() => void toggleOpen()}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">{t('title')}</span>
            {hasUnread && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => void markAll()}
              >
                {t('markAllRead')}
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('loading')}</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('empty')}</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void markRead(n)}
                  className={`flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-start last:border-0 hover:bg-accent ${
                    n.readAt ? '' : 'bg-accent/40'
                  }`}
                >
                  <div className="flex w-full items-center gap-2">
                    {!n.readAt && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    )}
                    <span className="flex-1 text-sm font-medium">
                      {locale === 'ar' ? n.title.ar : n.title.en}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {relativeTime(n.createdAt, locale, t('justNow'))}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {locale === 'ar' ? n.body.ar : n.body.en}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
