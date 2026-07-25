'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import type { AuditEntry, AuditListResponse } from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadError, NoAccess } from '@/components/ui/load-state';
import { useStaffDirectory } from '@/lib/staff-directory';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const PAGE_SIZE = 25;

// Still used for the CLIENT column: that id is a company, not a person, and the
// staff directory has nothing to say about it. Resolving client names here would
// mean pulling /clients into the audit screen — a separate decision.
function short(id: string | null): string | null {
  return id ? id.slice(0, 8) : null;
}

// Admin audit viewer (AUDIT-05) over GET /audit (AUDIT-04). Filters and the
// cursor are passed explicitly to the fetcher so "load more" always pages the
// currently-applied filter, never a stale one. A 401 means the session lapsed
// → back to sign-in.
export default function AuditPage() {
  const t = useTranslations('audit');
  const { nameFor } = useStaffDirectory();
  const format = useFormatter();
  const router = useRouter();

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [resource, setResource] = useState('');
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  async function fetchPage(opts: {
    resource: string;
    action: string;
    beforeId?: string;
    append: boolean;
  }) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (opts.resource) params.set('resource', opts.resource);
      if (opts.action) params.set('action', opts.action);
      params.set('limit', String(PAGE_SIZE));
      if (opts.beforeId) params.set('beforeId', opts.beforeId);
      const res = await apiFetch<AuditListResponse>(`/audit?${params.toString()}`);
      setEntries((prev) => (opts.append ? [...prev, ...res.entries] : res.entries));
      setCursor(res.nextCursor);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return;
      }
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(t('error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Initial unfiltered load, once on mount.
    void fetchPage({ resource: '', action: '', append: false });
  }, []);

  const onApply = (e: FormEvent) => {
    e.preventDefault();
    void fetchPage({ resource, action, append: false });
  };
  const onClear = () => {
    setResource('');
    setAction('');
    void fetchPage({ resource: '', action: '', append: false });
  };

  // Deep-linked without the capability: the nav hides the link, a pasted URL does
  // not. A refusal is not a failure, so it replaces the screen and offers no retry.
  if (forbidden) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <NoAccess capability="audit.read" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <form onSubmit={onApply} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="f-resource">{t('filterResource')}</Label>
          <Input
            id="f-resource"
            value={resource}
            onChange={(e) => setResource(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-action">{t('filterAction')}</Label>
          <Input
            id="f-action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-44"
          />
        </div>
        <Button type="submit" disabled={loading}>
          {t('filterApply')}
        </Button>
        <Button type="button" variant="outline" onClick={onClear} disabled={loading}>
          {t('filterClear')}
        </Button>
      </form>

      {error && (
        <LoadError message={error} onRetry={() => void fetchPage({ resource, action, append: false })} hasContent={entries.length > 0} />
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('colTime')}</TableHead>
              <TableHead>{t('colActor')}</TableHead>
              <TableHead>{t('colRole')}</TableHead>
              <TableHead>{t('colClient')}</TableHead>
              <TableHead>{t('colResource')}</TableHead>
              <TableHead>{t('colAction')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {format.dateTime(new Date(entry.createdAt), {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {/* Was a truncated UUID: an audit trail whose actor is
                      `a1b2c3d4` answers "what happened" but not "who" (UX-10b).
                      Falls back to the short id when the person has no name. */}
                  {nameFor(entry.actorId) ?? t('none')}
                </TableCell>
                <TableCell className="text-sm">{entry.actorRole ?? t('none')}</TableCell>
                <TableCell className="font-mono text-xs">
                  {short(entry.clientId) ?? t('none')}
                </TableCell>
                <TableCell className="text-sm">{entry.resource}</TableCell>
                <TableCell>
                  <Badge>{entry.action}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {cursor && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => void fetchPage({ resource, action, beforeId: cursor, append: true })}
            disabled={loading}
          >
            {loading ? t('loading') : t('loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}
