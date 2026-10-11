'use client';

import { useTranslations } from 'next-intl';
import { candidateHealth } from '@hr/contracts/candidate-health';
import { StatusPill } from '@/components/ui/status-pill';
import { toneFor } from '@/lib/status-tone';

// A candidate's health on the Hiring board and in the candidate window (SOON-04).
// It is WORKED OUT from the target date — nobody types it — by the one shared
// rule, so the card and the window cannot disagree. No pill when there is no
// target date or the candidate is finished.

/** The viewer's own day, as YYYY-MM-DD. */
export function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function useCandidateHealth() {
  const t = useTranslations('hiring');
  const today = localToday();
  return (c: { targetDate: string | null; stage: string }) => {
    const h = candidateHealth({ targetDate: c.targetDate, stage: c.stage, today });
    if (!h) return null;
    const note =
      h.daysToTarget < 0
        ? t('targetNote.past', { count: -h.daysToTarget })
        : h.daysToTarget === 0
          ? t('targetNote.today')
          : t('targetNote.ahead', { count: h.daysToTarget });
    return { ...h, label: t(`health.${h.health}`), note };
  };
}

export function HealthPill({ health, label }: { health: string; label: string }) {
  return <StatusPill tone={toneFor('candidateHealth', health)}>{label}</StatusPill>;
}
