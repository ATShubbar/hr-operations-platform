'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { EmployeeResponse } from '@hr/contracts';
import { Link, useRouter } from '@/i18n/navigation';
import { chipClass, soonestDoc } from '@/lib/employee-docs';
import { useNationalityName } from '@/lib/nationality';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

// The Client record's People tab (DS-10): the company's register, as the
// prototype has it — the first twelve, each with the document that expires first,
// and "Open People" for the full list (People filtered to this company). Ordered
// soonest-first, the People screen's rule, so the twelve shown are the twelve
// that need attention first.

const SHOWN = 12;
// The prototype's 1.6fr 1.2fr 1fr 100px. A <col> ignores calc() (DS-05), so the
// three flexible columns take their share of 84% and the fixed 100px column the
// rest; the browser spreads any remainder proportionally.
const COLS = ['35.4%', '26.5%', '22.1%'];

export function PeopleTab({
  staff,
  clientId,
}: {
  staff: readonly EmployeeResponse[];
  clientId: string;
}) {
  const t = useTranslations('clients');
  const tp = useTranslations('people');
  const locale = useLocale();
  const router = useRouter();
  const nationalityName = useNationalityName(locale);

  const rows = staff
    .map((e) => ({ e, doc: soonestDoc(e) }))
    .sort((a, b) => {
      if (a.doc && b.doc) return a.doc.days - b.doc.days;
      if (a.doc) return -1;
      if (b.doc) return 1;
      return a.e.name.en.localeCompare(b.e.name.en);
    });
  const shown = rows.slice(0, SHOWN);

  const shortDate = (iso: string) => {
    const d = new Date(iso);
    if (locale === 'ar') {
      return new Intl.DateTimeFormat('ar', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(d);
    }
    const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(d);
    return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
  };
  const position = (e: EmployeeResponse) =>
    (locale === 'ar' ? e.jobTitle.ar : e.jobTitle.en) ?? e.jobTitle.en ?? e.jobTitle.ar ?? '—';

  return (
    <section
      aria-labelledby="register"
      className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
    >
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="flex min-w-0 grow flex-col gap-0.5">
          <h2 id="register" className="text-base leading-6 font-medium">
            {t('register')}
          </h2>
          {rows.length > 0 && (
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {rows.length > SHOWN
                ? t('registerMore', { shown: SHOWN, total: rows.length })
                : t('registerCount', { count: rows.length })}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          nativeButton={false}
          render={<Link href={`/employees?client=${clientId}`} />}
        >
          {t('openPeople')}
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="border-t p-6">
          <EmptyState variant="first-run" title={t('registerEmpty')} />
        </div>
      ) : (
        <div
          role="region"
          aria-labelledby="register"
          tabIndex={0}
          className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring"
        >
          <table className="w-full min-w-[620px] table-fixed border-separate border-spacing-0">
            <colgroup>
              {COLS.map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
              <col style={{ width: 100 }} />
            </colgroup>
            <thead>
              <tr className="bg-neutral-100 text-xs leading-4 font-medium text-muted-foreground">
                <th scope="col" className="border-t px-5 py-2 text-start font-medium">
                  {t('colEmployee')}
                </th>
                <th scope="col" className="border-t px-4 py-2 text-start font-medium">
                  {t('colPosition')}
                </th>
                <th scope="col" className="border-t px-4 py-2 text-start font-medium">
                  {t('colFirstDue')}
                </th>
                <th scope="col" className="border-t px-4 py-2 text-end font-medium">
                  {t('colLeft')}
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ e, doc }) => {
                const href = `/employees/${e.id}`;
                return (
                  // The row is a mouse target as in the prototype; the NAME is the
                  // real link (People's pattern), one focus stop per person.
                  <tr
                    key={e.id}
                    onClick={() => router.push(href)}
                    className="h-14 cursor-pointer transition-colors hover:bg-muted/40 [&>td]:border-t"
                  >
                    <td className="px-5">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={e.name.en} size="sm" />
                        <span className="flex min-w-0 flex-col">
                          <Link
                            href={href}
                            onClick={(ev) => ev.stopPropagation()}
                            className="truncate text-[13px] leading-[18px] font-medium outline-none hover:underline focus-visible:underline"
                          >
                            {e.name.en}
                          </Link>
                          <span
                            dir="rtl"
                            className="text-end text-[11px] leading-[15px] text-muted-foreground"
                          >
                            {e.name.ar}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-4">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[13px] leading-[18px]">{position(e)}</span>
                        <span className="truncate text-[11px] leading-[15px] text-muted-foreground">
                          {nationalityName(e.nationality)}
                        </span>
                      </span>
                    </td>
                    <td className="px-4">
                      {doc ? (
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[13px] leading-[18px]">
                            {tp(`doc.${doc.key}`)}
                          </span>
                          <span className="text-[11px] leading-[15px] text-muted-foreground">
                            {shortDate(doc.iso)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-[13px] text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-4 text-end">
                      {doc ? (
                        <span
                          className={cn(
                            'inline-flex h-5 items-center rounded-full px-2 font-mono text-[11px] leading-5 whitespace-nowrap',
                            chipClass(doc.days),
                          )}
                        >
                          {doc.days < 0
                            ? tp('over', { n: Math.abs(doc.days) })
                            : tp('left', { n: doc.days })}
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] text-neutral-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
