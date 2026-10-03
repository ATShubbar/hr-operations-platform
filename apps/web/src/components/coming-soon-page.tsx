'use client';

import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/empty-state';

// A prototype screen with no backend yet (DS-04). The owner's rule for unbuilt
// parts of the People & Gro prototype: SHOW them, marked "coming soon" — never
// omitted, never faked. Each use is replaced by the real screen when its feature
// epic lands.
export function ComingSoonPage({
  titleKey,
  descriptionKey,
}: {
  titleKey: string;
  descriptionKey: string;
}) {
  const t = useTranslations();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t(titleKey)}</h1>
      <EmptyState
        variant="first-run"
        title={t('states.comingSoon')}
        description={t(descriptionKey)}
      />
    </div>
  );
}
