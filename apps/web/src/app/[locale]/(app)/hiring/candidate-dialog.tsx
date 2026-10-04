'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { CandidateStage } from '@hr/contracts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { nextOf, prevOf } from './stages';

// The candidate's dialog (DS-09) — the prototype's drawer. Facts it has data for
// are shown; Health, Target and Mobilisation are not stored yet and say so (owner
// rule: shown, marked "coming soon", never faked — a progress % derived from the
// column would only repeat the column). Documents and comments are the request
// thread's sibling and come with that feature.
//
// Not progressing (reject / withdrawn) is not in the prototype; the workflow has
// it and a board without it lets dead candidates pile up, so it stays — as a
// secondary action.

export interface CandidateView {
  id: string;
  name: string;
  nameAr: string;
  role: string;
  department: string | null;
  client: string;
  nationality: string;
  stage: CandidateStage;
  notes: string | null;
  added: string;
}

export function CandidateDialog({
  candidate,
  canAdvance,
  busy,
  onClose,
  onMove,
}: {
  candidate: CandidateView | null;
  canAdvance: boolean;
  busy: boolean;
  onClose: () => void;
  onMove: (to: CandidateStage) => void;
}) {
  const t = useTranslations('hiring');
  const [endOpen, setEndOpen] = useState(false);
  const c = candidate;
  const next = c ? nextOf(c.stage) : null;
  const prev = c ? prevOf(c.stage) : null;

  const fact = (label: string, value: ReactNode, soon = false) => (
    <div className="flex flex-col gap-px">
      <span className="text-[11px] leading-[15px] text-muted-foreground">{label}</span>
      {soon ? (
        <span className="text-[13px] leading-[18px] text-neutral-400">{t('soon')}</span>
      ) : (
        <span className="text-[13px] leading-[18px]">{value}</span>
      )}
    </div>
  );

  return (
    <Dialog open={c !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[620px]">
        {c && (
          <>
            <DialogHeader>
              <DialogTitle>{c.name}</DialogTitle>
              <DialogDescription>
                {[c.role, c.client].filter(Boolean).join(' · ')}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md bg-neutral-50 px-3.5 py-3 ring-1 ring-foreground/10 sm:grid-cols-3">
                {fact(t('factStage'), t(`column.${c.stage}`))}
                {fact(t('factNationality'), c.nationality || '—')}
                {fact(t('factNameAr'), <span dir="rtl">{c.nameAr}</span>)}
                {fact(t('factHealth'), null, true)}
                {fact(t('factTarget'), null, true)}
                {fact(t('factMobilisation'), null, true)}
              </div>

              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] leading-[18px] text-pretty text-neutral-700">
                  {[c.notes, t('addedOn', { date: c.added })].filter(Boolean).join(' · ')}
                </span>
                <span className="text-xs leading-4 text-muted-foreground">
                  {t('againstRole', {
                    role: [c.role, c.department].filter(Boolean).join(' · '),
                  })}
                </span>
              </div>

              <div className="flex flex-col gap-1 rounded-md px-3.5 py-3 ring-1 ring-foreground/10">
                <span className="text-[13px] leading-[18px] font-medium">
                  {t('documentsAndComments')}
                </span>
                <span className="text-xs leading-4 text-muted-foreground">{t('threadSoon')}</span>
              </div>
            </div>

            <DialogFooter className="items-center sm:justify-start">
              {canAdvance && prev && (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => onMove(prev)}>
                  {t('backTo', { stage: t(`column.${prev}`) })}
                </Button>
              )}
              {canAdvance && next && (
                <Popover open={endOpen} onOpenChange={setEndOpen}>
                  <PopoverTrigger render={<Button variant="ghost" size="sm" disabled={busy} />}>
                    {t('notProgressing')}
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-56 p-1">
                    <ul className="flex flex-col">
                      {(['rejected', 'withdrawn'] as const).map((s) => (
                        <li key={s}>
                          <button
                            type="button"
                            className="flex w-full flex-col items-start gap-px rounded-md px-2.5 py-2 text-start hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                            onClick={() => {
                              setEndOpen(false);
                              onMove(s);
                            }}
                          >
                            <span className="text-[13px] leading-[18px] font-medium">
                              {t(`end.${s}`)}
                            </span>
                            <span className="text-[11px] leading-[15px] text-muted-foreground">
                              {t(`endHint.${s}`)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </PopoverContent>
                </Popover>
              )}
              <span className="hidden grow sm:block" />
              <Button variant="outline" size="sm" onClick={onClose}>
                {t('close')}
              </Button>
              {canAdvance && next && (
                <Button size="sm" disabled={busy} onClick={() => onMove(next)}>
                  {t('moveTo', { stage: t(`column.${next}`) })}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
