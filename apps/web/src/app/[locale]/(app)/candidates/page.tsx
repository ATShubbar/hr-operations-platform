'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  CandidateListResponse,
  CandidateResponse,
  CandidateStage,
  VacancyListResponse,
  VacancyResponse,
} from '@hr/contracts';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useCan } from '@/lib/session';
import { type Locale } from '@/lib/employee-format';
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

const ALL = 'all';
// The pipeline lanes, in order. rejected/withdrawn are shown as a trailing lane.
const LANES: readonly CandidateStage[] = [
  'applied',
  'screening',
  'interview',
  'offer',
  'hired',
];
const CLOSED_LANE: readonly CandidateStage[] = ['rejected', 'withdrawn'];

// Legal next stages, mirrored client-side (the API validates authoritatively —
// REC-04). Reaching `hired` spawns an employee (REC-05).
const NEXT: Record<CandidateStage, readonly CandidateStage[]> = {
  applied: ['screening', 'rejected', 'withdrawn'],
  screening: ['interview', 'rejected', 'withdrawn'],
  interview: ['offer', 'rejected', 'withdrawn'],
  offer: ['hired', 'rejected', 'withdrawn'],
  hired: [],
  rejected: [],
  withdrawn: [],
};

interface CreateForm {
  vacancyId: string;
  nameAr: string;
  nameEn: string;
  nationality: string;
  email: string;
}
const EMPTY_CREATE: CreateForm = { vacancyId: '', nameAr: '', nameEn: '', nationality: '', email: '' };

// Candidate pipeline (REC-06) over the candidate.* API (REC-04). Staff-internal.
// A stage board: each lane is a stage; the per-card menu advances the pipeline
// (candidate.advance) offering only legal moves. Advancing to `hired` creates an
// employee (REC-05). Create needs candidate.create.
export default function CandidatesPage() {
  const t = useTranslations('candidates');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const canCreate = useCan('candidate.create');
  const canAdvance = useCan('candidate.advance');

  const [candidates, setCandidates] = useState<CandidateResponse[]>([]);
  const [vacancies, setVacancies] = useState<VacancyResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fVacancy, setFVacancy] = useState(ALL);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const vacancyTitle = (id: string) => {
    const v = vacancies.find((x) => x.id === id);
    return v ? (locale === 'ar' ? v.title.ar : v.title.en) : id.slice(0, 8);
  };

  async function loadVacancies() {
    try {
      const res = await apiFetch<VacancyListResponse>('/vacancies');
      setVacancies(res.vacancies);
    } catch {
      setVacancies([]);
    }
  }

  async function load(vacancyFilter?: string) {
    const v = vacancyFilter ?? fVacancy;
    setLoading(true);
    setError('');
    try {
      const qs = v !== ALL ? `?vacancyId=${v}` : '';
      const res = await apiFetch<CandidateListResponse>(`/candidates${qs}`);
      setCandidates(res.candidates);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    void loadVacancies();
  }, []);

  function openCreate() {
    setForm({ ...EMPTY_CREATE, vacancyId: vacancies[0]?.id ?? '' });
    setFormError('');
    setOpen(true);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await apiFetch('/candidates', {
        method: 'POST',
        body: JSON.stringify({
          vacancyId: form.vacancyId,
          name: { ar: form.nameAr, en: form.nameEn },
          ...(form.nationality ? { nationality: form.nationality.toUpperCase() } : {}),
          ...(form.email ? { email: form.email } : {}),
        }),
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

  async function advance(c: CandidateResponse, stage: CandidateStage) {
    setError('');
    try {
      await apiFetch(`/candidates/${c.id}/stage`, {
        method: 'POST',
        body: JSON.stringify({ stage }),
      });
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return void router.replace('/login');
      if (err instanceof ApiError && err.status === 400) setError(t('hireNeedsNationality'));
      else setError(t('saveError'));
    }
  }

  const inLane = (stage: CandidateStage) => candidates.filter((c) => c.stage === stage);

  const card = (c: CandidateResponse) => (
    <div key={c.id} className="rounded-md border bg-card p-3 text-sm">
      <div className="font-medium">{locale === 'ar' ? c.name.ar : c.name.en}</div>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>{vacancyTitle(c.vacancyId)}</span>
        {c.nationality && <span>· {c.nationality}</span>}
      </div>
      {c.email && <div className="mt-1 text-xs text-muted-foreground">{c.email}</div>}
      {canAdvance && NEXT[c.stage].length > 0 && (
        <div className="mt-2">
          <Select value="" onValueChange={(s) => s && void advance(c, s as CandidateStage)}>
            <SelectTrigger className="h-8 w-full">
              <SelectValue placeholder={t('advance')}>{() => t('advance')}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {NEXT[c.stage].map((s) => (
                <SelectItem key={s} value={s}>
                  {s === 'hired' ? t('actionHire') : t(`stage.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {canCreate && (
          <Button onClick={openCreate} disabled={vacancies.length === 0}>
            {t('new')}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>{t('filterVacancy')}</Label>
          <Select
            value={fVacancy}
            onValueChange={(v) => {
              setFVacancy(v ?? ALL);
              void load(v ?? ALL);
            }}
          >
            <SelectTrigger className="w-64">
              <SelectValue>{(v) => (v === ALL ? t('filterAll') : vacancyTitle(String(v)))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('filterAll')}</SelectItem>
              {vacancies.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {locale === 'ar' ? v.title.ar : v.title.en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-3">
          {LANES.map((stage) => (
            <div key={stage} className="w-56 shrink-0 rounded-lg border bg-muted/30 p-2">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium">{t(`stage.${stage}`)}</span>
                <Badge variant="secondary">{inLane(stage).length}</Badge>
              </div>
              <div className="space-y-2">{inLane(stage).map(card)}</div>
            </div>
          ))}
          <div className="w-56 shrink-0 rounded-lg border bg-muted/30 p-2">
            <div className="mb-2 px-1 text-sm font-medium">{t('laneClosed')}</div>
            <div className="space-y-2">
              {CLOSED_LANE.flatMap((stage) => inLane(stage)).map(card)}
            </div>
          </div>
        </div>
      </div>
      {candidates.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('createTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={create} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('fieldVacancy')}</Label>
              <Select value={form.vacancyId} onValueChange={(v) => setForm({ ...form, vacancyId: v ?? '' })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('selectVacancy')}>
                    {(v) => (v ? vacancyTitle(String(v)) : t('selectVacancy'))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {vacancies.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {locale === 'ar' ? v.title.ar : v.title.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-ar">{t('fieldNameAr')}</Label>
                <Input id="c-ar" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} required dir="rtl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-en">{t('fieldNameEn')}</Label>
                <Input id="c-en" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} required dir="ltr" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-nat">{t('fieldNationality')}</Label>
                <Input id="c-nat" value={form.nationality} maxLength={2} placeholder="SA" onChange={(e) => setForm({ ...form, nationality: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-email">{t('fieldEmail')}</Label>
                <Input id="c-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t('nationalityHint')}</p>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={saving || !form.vacancyId || !form.nameAr || !form.nameEn}>
                {saving ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
