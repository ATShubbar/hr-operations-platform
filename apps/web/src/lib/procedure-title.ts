import type { GroProcessResponse } from '@hr/contracts';
import { dots } from '@/lib/pieces';

// A procedure's title. Most are their type ("Iqama renewal") — the person is
// shown beside it. A DEPENDANT procedure (DEP-06) is opened on the sponsor, so
// its title also says which family member it is for: "Dependant iqama renewal ·
// Yasmin Hassan". Without the name, three renewals for one family read alike.
export function procedureTitle(
  p: Pick<GroProcessResponse, 'type' | 'dependant'>,
  typeLabel: (type: GroProcessResponse['type']) => string,
  locale: string,
): string {
  const label = typeLabel(p.type);
  if (!p.dependant) return label;
  const name = locale === 'ar' && p.dependant.nameAr ? p.dependant.nameAr : p.dependant.nameEn;
  return dots(locale, label, name);
}
