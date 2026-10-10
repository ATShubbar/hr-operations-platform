'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Signature, X } from 'lucide-react';
import type { ClientPortal, ClientResponse, ClientSignatory } from '@hr/contracts';
import { CLIENT_PORTALS, MAX_SIGNATORIES } from '@hr/contracts/client-profile';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toastSuccess } from '@/components/ui/toast';

// The Client record's Records tab, the profile half (PROF-04, ADR-019) — the
// prototype's four cards: main contact, authorised signatories, registrations,
// and the portals we hold credentials FOR.
//
// Everyone who reads a client reads these. Only an Administrator changes them
// (`client.update` — the matrix as it stands): each card then has its own Edit,
// and each dialog saves ONLY its own group, sending only what changed.
//
// Portals are names. The app records that access exists and never holds a
// username, password or token — the dialog offers checkboxes and nothing to type.

type Group = 'contact' | 'signatories' | 'registrations' | 'portals';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d][\d\s-]{5,24}$/;
const orNull = (v: string) => v.trim() || null;

export function ProfileRecords({
  client,
  onSaved,
}: {
  client: ClientResponse;
  onSaved: (saved: ClientResponse) => void;
}) {
  const t = useTranslations('clients.profile');
  const tp = useTranslations('clientProfile');
  const tc = useTranslations('clients');
  const router = useRouter();
  const canEdit = useCan('client.update');

  const [editing, setEditing] = useState<Group | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // One draft per group; filled when its dialog opens.
  const [contact, setContact] = useState({
    nameEn: '',
    nameAr: '',
    role: '',
    email: '',
    phone: '',
  });
  const [sigs, setSigs] = useState<ClientSignatory[]>([]);
  const [regs, setRegs] = useState({ crNumber: '', qiwa: '', gosi: '', vat: '' });
  const [portals, setPortals] = useState<ClientPortal[]>([]);

  function open(group: Group) {
    setError('');
    if (group === 'contact') {
      const c = client.contact;
      setContact({
        nameEn: c.nameEn ?? '',
        nameAr: c.nameAr ?? '',
        role: c.role ?? '',
        email: c.email ?? '',
        phone: c.phone ?? '',
      });
    }
    if (group === 'signatories') {
      setSigs(client.signatories.length ? client.signatories : [{ name: '', role: '' }]);
    }
    if (group === 'registrations') {
      setRegs({
        crNumber: client.crNumber ?? '',
        qiwa: client.registrations.qiwaEstablishment ?? '',
        gosi: client.registrations.gosiEstablishment ?? '',
        vat: client.registrations.vatNumber ?? '',
      });
    }
    if (group === 'portals') setPortals([...client.portals]);
    setEditing(group);
  }

  // The request body for the open group — only what changed — or a message.
  function body(): Record<string, unknown> | string {
    if (editing === 'contact') {
      if (contact.email.trim() && !EMAIL_RE.test(contact.email.trim())) return t('error.email');
      if (contact.phone.trim() && !PHONE_RE.test(contact.phone.trim())) return t('error.phone');
      const next = {
        nameEn: orNull(contact.nameEn),
        nameAr: orNull(contact.nameAr),
        role: orNull(contact.role),
        email: orNull(contact.email),
        phone: orNull(contact.phone),
      };
      const changed = Object.fromEntries(
        Object.entries(next).filter(([k, v]) => v !== client.contact[k as keyof typeof next]),
      );
      return Object.keys(changed).length ? { contact: changed } : {};
    }
    if (editing === 'signatories') {
      // A row left wholly empty is dropped; a half-filled one is a mistake.
      const rows = sigs
        .map((s) => ({ name: s.name.trim(), role: s.role.trim() }))
        .filter((s) => s.name || s.role);
      if (rows.some((s) => !s.name || !s.role)) return t('error.signatory');
      return JSON.stringify(rows) === JSON.stringify(client.signatories)
        ? {}
        : { signatories: rows };
    }
    if (editing === 'registrations') {
      const cr = regs.crNumber.trim();
      const vat = regs.vat.trim();
      if (cr && !/^\d{10}$/.test(cr)) return t('error.cr');
      if (vat && !/^\d{15}$/.test(vat)) return t('error.vat');
      const out: Record<string, unknown> = {};
      if ((cr || null) !== client.crNumber) out.crNumber = cr || null;
      const r = client.registrations;
      const registrations: Record<string, string | null> = {};
      if (orNull(regs.qiwa) !== r.qiwaEstablishment)
        registrations.qiwaEstablishment = orNull(regs.qiwa);
      if (orNull(regs.gosi) !== r.gosiEstablishment)
        registrations.gosiEstablishment = orNull(regs.gosi);
      if ((vat || null) !== r.vatNumber) registrations.vatNumber = vat || null;
      if (Object.keys(registrations).length) out.registrations = registrations;
      return out;
    }
    // Portals, in the list's own order.
    const next = CLIENT_PORTALS.filter((p) => portals.includes(p));
    const same =
      next.length === client.portals.length && next.every((p) => client.portals.includes(p));
    return same ? {} : { portals: next };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload = body();
    if (typeof payload === 'string') return setError(payload);
    if (Object.keys(payload).length === 0) return setEditing(null); // nothing to save or audit
    setBusy(true);
    setError('');
    try {
      const saved = await apiFetch<ClientResponse>(`/clients/${client.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setEditing(null);
      onSaved(saved);
      toastSuccess(t('saved'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      // Refusals in our own words — never the server's text.
      setError(
        err instanceof ApiError && err.status === 409
          ? tc('form.error.crTaken')
          : err instanceof ApiError && err.status === 400
            ? tc('form.error.invalid')
            : tc('saveError'),
      );
    } finally {
      setBusy(false);
    }
  }

  const card = (group: Group, children: ReactNode) => (
    <section
      aria-labelledby={`pr-${group}`}
      className="flex min-w-0 flex-col gap-3 rounded-xl bg-card px-5 py-[18px] ring-1 ring-foreground/10"
    >
      <div className="flex items-center gap-3">
        <h2 id={`pr-${group}`} className="min-w-0 grow text-base leading-6 font-medium">
          {t(`${group}.title`)}
        </h2>
        {canEdit && (
          <Button
            variant="outline"
            size="xs"
            className="shrink-0"
            onClick={() => open(group)}
            aria-label={t('editGroup', { group: t(`${group}.title`) })}
          >
            {t('edit')}
          </Button>
        )}
      </div>
      {children}
    </section>
  );
  const none = (text: string) => (
    <p className="text-[13px] leading-[18px] text-neutral-400">{text}</p>
  );
  const fact = (label: string, value: string | null, mono = false) => (
    <div className="flex min-w-0 flex-col gap-px">
      <span className="text-xs leading-4 text-muted-foreground">{label}</span>
      {value ? (
        <span className="truncate text-[13px] leading-[18px]">
          <bdi dir="ltr" className={mono ? 'font-mono' : undefined}>
            {value}
          </bdi>
        </span>
      ) : (
        <span className="text-[13px] leading-[18px] text-neutral-400">{tp('notRecorded')}</span>
      )}
    </div>
  );
  const c = client.contact;
  const hasContact = Boolean(c.nameEn || c.nameAr || c.role || c.email || c.phone);
  const r = client.registrations;

  const input = (
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    extra: {
      dir?: 'ltr' | 'rtl';
      mono?: boolean;
      maxLength?: number;
      digits?: boolean;
      type?: string;
    } = {},
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={extra.type}
        dir={extra.dir}
        inputMode={extra.digits ? 'numeric' : undefined}
        maxLength={extra.maxLength}
        value={value}
        onChange={(e) => {
          setError('');
          onChange(extra.digits ? e.target.value.replace(/\D/g, '') : e.target.value);
        }}
        className={extra.mono ? 'font-mono' : undefined}
      />
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {card(
          'contact',
          hasContact ? (
            <>
              <div className="flex flex-col gap-px">
                {c.nameEn && <span className="text-sm leading-5 font-medium">{c.nameEn}</span>}
                {c.nameAr && (
                  <span
                    dir="rtl"
                    className="w-fit text-end text-xs leading-4 text-muted-foreground"
                  >
                    {c.nameAr}
                  </span>
                )}
                {c.role && (
                  <span className="text-xs leading-4 text-muted-foreground">
                    <bdi>{c.role}</bdi>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2">
                {fact(t('contact.email'), c.email)}
                {fact(t('contact.phone'), c.phone)}
              </div>
            </>
          ) : (
            none(t('contact.none'))
          ),
        )}
        {card(
          'signatories',
          client.signatories.length ? (
            <ul className="flex flex-col gap-2">
              {client.signatories.map((s, i) => (
                <li key={i} className="flex items-center gap-2 text-[13px] leading-[18px]">
                  <Signature className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 truncate">
                    <bdi>
                      {s.name} · {s.role}
                    </bdi>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            none(t('signatories.none'))
          ),
        )}
        {card(
          'registrations',
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fact(t('registrations.cr'), client.crNumber, true)}
            {fact(t('registrations.qiwa'), r.qiwaEstablishment, true)}
            {fact(t('registrations.gosi'), r.gosiEstablishment, true)}
            {fact(t('registrations.vat'), r.vatNumber, true)}
          </div>,
        )}
        {card(
          'portals',
          <>
            {client.portals.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {client.portals.map((p) => (
                  <li key={p}>
                    <Badge variant="outline">{tp(`portal.${p}`)}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              none(t('portals.none'))
            )}
            <p className="text-xs leading-4 text-neutral-500">{t('portals.namesOnly')}</p>
          </>,
        )}
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-[520px] [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>{editing ? t(`${editing}.title`) : ''}</DialogTitle>
            <DialogDescription>{editing ? t(`${editing}.hint`) : ''}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
            {editing === 'contact' && (
              <>
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  {input('pr-c-en', t('contact.nameEn'), contact.nameEn, (v) =>
                    setContact((s) => ({ ...s, nameEn: v })),
                  )}
                  {input(
                    'pr-c-ar',
                    t('contact.nameAr'),
                    contact.nameAr,
                    (v) => setContact((s) => ({ ...s, nameAr: v })),
                    { dir: 'rtl' },
                  )}
                </div>
                {input('pr-c-role', t('contact.role'), contact.role, (v) =>
                  setContact((s) => ({ ...s, role: v })),
                )}
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  {input(
                    'pr-c-email',
                    t('contact.email'),
                    contact.email,
                    (v) => setContact((s) => ({ ...s, email: v })),
                    { dir: 'ltr', type: 'email' },
                  )}
                  {input(
                    'pr-c-phone',
                    t('contact.phone'),
                    contact.phone,
                    (v) => setContact((s) => ({ ...s, phone: v })),
                    { dir: 'ltr', type: 'tel' },
                  )}
                </div>
              </>
            )}

            {editing === 'signatories' && (
              <>
                <ul className="flex flex-col gap-2.5">
                  {sigs.map((s, i) => (
                    <li key={i} className="flex items-end gap-2">
                      <div className="grid min-w-0 grow grid-cols-1 gap-2 sm:grid-cols-2">
                        {input(`pr-s-name-${i}`, t('signatories.name'), s.name, (v) =>
                          setSigs((list) => list.map((x, j) => (j === i ? { ...x, name: v } : x))),
                        )}
                        {input(`pr-s-role-${i}`, t('signatories.role'), s.role, (v) =>
                          setSigs((list) => list.map((x, j) => (j === i ? { ...x, role: v } : x))),
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0"
                        onClick={() => setSigs((list) => list.filter((_, j) => j !== i))}
                        aria-label={t('signatories.remove', { n: i + 1 })}
                        title={t('signatories.removeTitle')}
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
                {sigs.length < MAX_SIGNATORIES && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => setSigs((list) => [...list, { name: '', role: '' }])}
                  >
                    <Plus aria-hidden />
                    {t('signatories.add')}
                  </Button>
                )}
              </>
            )}

            {editing === 'registrations' && (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                {input(
                  'pr-r-cr',
                  t('registrations.cr'),
                  regs.crNumber,
                  (v) => setRegs((s) => ({ ...s, crNumber: v })),
                  { dir: 'ltr', mono: true, maxLength: 10, digits: true },
                )}
                {input(
                  'pr-r-vat',
                  t('registrations.vat'),
                  regs.vat,
                  (v) => setRegs((s) => ({ ...s, vat: v })),
                  { dir: 'ltr', mono: true, maxLength: 15, digits: true },
                )}
                {input(
                  'pr-r-qiwa',
                  t('registrations.qiwa'),
                  regs.qiwa,
                  (v) => setRegs((s) => ({ ...s, qiwa: v })),
                  { dir: 'ltr', mono: true, maxLength: 40 },
                )}
                {input(
                  'pr-r-gosi',
                  t('registrations.gosi'),
                  regs.gosi,
                  (v) => setRegs((s) => ({ ...s, gosi: v })),
                  { dir: 'ltr', mono: true, maxLength: 40 },
                )}
              </div>
            )}

            {editing === 'portals' && (
              <fieldset className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                <legend className="sr-only">{t('portals.title')}</legend>
                {CLIENT_PORTALS.map((p) => (
                  <label key={p} className="flex min-h-11 items-center gap-2.5 text-sm sm:min-h-9">
                    <input
                      type="checkbox"
                      className="size-4 accent-neutral-900"
                      checked={portals.includes(p)}
                      onChange={(e) =>
                        setPortals((list) =>
                          e.target.checked ? [...list, p] : list.filter((x) => x !== p),
                        )
                      }
                    />
                    {tp(`portal.${p}`)}
                  </label>
                ))}
              </fieldset>
            )}

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? tc('saving') : tc('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
