'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  GcalInvitationListResponse,
  GcalInvitationResponse,
} from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { dualDate, type Locale } from '@/lib/employee-format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Form {
  kind: 'interview' | 'meeting';
  start: string;
  end: string;
  timezone: string;
  personName: string;
  jobTitle: string;
  meetingTitle: string;
  referenceCode: string;
  location: string;
  meetingLink: string;
  attendeeEmails: string; // comma/newline separated
}
const EMPTY: Form = {
  kind: 'interview',
  start: '',
  end: '',
  timezone: 'Asia/Riyadh',
  personName: '',
  jobTitle: '',
  meetingTitle: '',
  referenceCode: '',
  location: '',
  meetingLink: '',
  attendeeEmails: '',
};

// Google Calendar invitations console (GCAL-03) over the GCAL-02 API. Schedule an
// outbound invitation (typed form) and inspect EXACTLY the whitelisted payload that
// left the system — the ADR-009 transparency view. Gated on integration.google-calendar.
export default function IntegrationsPage() {
  const t = useTranslations('integrations');
  const locale = useLocale() as Locale;
  const router = useRouter();

  const [invitations, setInvitations] = useState<GcalInvitationResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [inspect, setInspect] = useState<GcalInvitationResponse | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<GcalInvitationListResponse>('/integrations/google-calendar/invitations');
      setInvitations(res.invitations);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setForm(EMPTY);
    setFormError('');
    setOpen(true);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    const emails = form.attendeeEmails
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const body = {
      kind: form.kind,
      start: new Date(form.start).toISOString(),
      end: new Date(form.end).toISOString(),
      timezone: form.timezone,
      ...(form.kind === 'interview'
        ? {
            ...(form.personName ? { personName: form.personName } : {}),
            ...(form.jobTitle ? { jobTitle: form.jobTitle } : {}),
          }
        : { ...(form.meetingTitle ? { meetingTitle: form.meetingTitle } : {}) }),
      referenceCode: form.referenceCode,
      ...(form.location ? { location: form.location } : {}),
      ...(form.meetingLink ? { meetingLink: form.meetingLink } : {}),
      attendeeEmails: emails,
    };
    try {
      await apiFetch('/integrations/google-calendar/invitations', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setOpen(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setFormError(t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function cancel(inv: GcalInvitationResponse) {
    try {
      await apiFetch(`/integrations/google-calendar/invitations/${inv.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace('/login');
      else setError(t('error'));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button onClick={openCreate}>{t('new')}</Button>
      </div>

      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        {t('guardrail')}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('colReference')}</TableHead>
              <TableHead>{t('colKind')}</TableHead>
              <TableHead>{t('colSummary')}</TableHead>
              <TableHead>{t('colStart')}</TableHead>
              <TableHead>{t('colStatus')}</TableHead>
              <TableHead className="text-end">{t('colActions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-medium">{inv.referenceCode}</TableCell>
                <TableCell>{t(`kind.${inv.kind}`)}</TableCell>
                <TableCell className="text-sm">{inv.payload.summary}</TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {dualDate(inv.startAt, locale)}
                </TableCell>
                <TableCell>
                  <Badge variant={inv.status === 'scheduled' ? 'default' : 'destructive'}>
                    {t(`status.${inv.status}`)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setInspect(inv)}>
                      {t('inspect')}
                    </Button>
                    {inv.status === 'scheduled' && (
                      <Button variant="ghost" size="sm" onClick={() => void cancel(inv)}>
                        {t('cancel')}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {invitations.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Schedule dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('createTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={create} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('fieldKind')}</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: (v as Form['kind']) ?? 'interview' })}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => t(`kind.${String(v)}`)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="interview">{t('kind.interview')}</SelectItem>
                    <SelectItem value="meeting">{t('kind.meeting')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-ref">{t('fieldReference')}</Label>
                <Input id="g-ref" value={form.referenceCode} onChange={(e) => setForm({ ...form, referenceCode: e.target.value })} required dir="ltr" />
              </div>
            </div>
            {form.kind === 'interview' ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="g-name">{t('fieldPersonName')}</Label>
                  <Input id="g-name" value={form.personName} onChange={(e) => setForm({ ...form, personName: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="g-role">{t('fieldJobTitle')}</Label>
                  <Input id="g-role" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="g-mtitle">{t('fieldMeetingTitle')}</Label>
                <Input id="g-mtitle" value={form.meetingTitle} onChange={(e) => setForm({ ...form, meetingTitle: e.target.value })} />
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="g-start">{t('fieldStart')}</Label>
                <Input id="g-start" type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-end">{t('fieldEnd')}</Label>
                <Input id="g-end" type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="g-tz">{t('fieldTimezone')}</Label>
                <Input id="g-tz" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="g-loc">{t('fieldLocation')}</Label>
                <Input id="g-loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-emails">{t('fieldAttendees')}</Label>
              <Input id="g-emails" value={form.attendeeEmails} onChange={(e) => setForm({ ...form, attendeeEmails: e.target.value })} placeholder="a@x.com, b@y.com" dir="ltr" required />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('cancelBtn')}
              </Button>
              <Button type="submit" disabled={saving || !form.referenceCode || !form.start || !form.end || !form.attendeeEmails}>
                {saving ? t('saving') : t('schedule')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Inspect (what leaves the system) */}
      <Dialog open={!!inspect} onOpenChange={(o) => !o && setInspect(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('inspectTitle')}</DialogTitle>
          </DialogHeader>
          {inspect && (
            <div className="space-y-3 text-sm">
              <p className="text-xs text-muted-foreground">{t('inspectNote')}</p>
              <dl className="space-y-2">
                <Row label={t('payloadSummary')} value={inspect.payload.summary} />
                <Row label={t('payloadDescription')} value={inspect.payload.description} />
                <Row label={t('payloadStart')} value={`${inspect.payload.start.dateTime} (${inspect.payload.start.timeZone})`} />
                <Row label={t('payloadEnd')} value={`${inspect.payload.end.dateTime} (${inspect.payload.end.timeZone})`} />
                {inspect.payload.location && <Row label={t('payloadLocation')} value={inspect.payload.location} />}
                <Row label={t('payloadAttendees')} value={inspect.payload.attendees.map((a) => a.email).join(', ')} />
                <Row label={t('payloadExternalId')} value={inspect.externalEventId} />
              </dl>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setInspect(null)}>
              {t('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-all font-mono text-xs">{value}</dd>
    </div>
  );
}
