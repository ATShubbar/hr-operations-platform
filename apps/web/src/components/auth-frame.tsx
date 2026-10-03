'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { BrandMark } from '@/components/brand-mark';
import { LanguageSwitcher } from '@/components/language-switcher';

// Sampled from the artwork, not approximated: the panel's ground has to match
// the photograph's own sky or the seam shows, and the rule has to be the mark's
// gold rather than our --primary, which is a different gold.
const BRAND_NAVY = '#040a31';
const BRAND_GOLD = '#f7ce46';

// The frame every signed-out page shares (SS-06b, extracted from the UX-16 login
// page): the form column on the start side, the brand panel on the end side from
// `lg` up. ONE component so the login, set-password and forgot-password pages
// cannot drift apart — the same reason AppNav is shared by the sidebar and the
// sheet (UX-05).
//
// Below `lg` the panel is hidden rather than stacked — it carries identity, not
// information, and a phone should reach the field without scrolling past a
// photograph. `grid-cols-2`, not two positioned halves, so RTL mirrors for free.
export function AuthFrame({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** A quiet line under the form (e.g. the accounts note on the login page). */
  footer?: ReactNode;
}) {
  const t = useTranslations('auth');
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <main className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex items-center justify-between gap-2">
          <BrandMark width={148} />
          <LanguageSwitcher />
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <div className="mb-6 flex flex-col items-center gap-1 text-center">
              {/* The page's only title, so the h1 (UX-11). */}
              <h1 className="text-2xl font-semibold">{title}</h1>
              {subtitle && <p className="text-sm text-balance text-muted-foreground">{subtitle}</p>}
            </div>
            {children}
            {footer && (
              <div className="mt-6 text-center text-xs text-muted-foreground">{footer}</div>
            )}
          </div>
        </div>
      </main>

      {/* The brand panel. The artwork is 1.79:1 and this column is ~0.84:1, so
          object-cover can only ever show about 46% of the source width — and the
          skyline is in its left half while the wordmark is in its right, so the
          two cannot both survive the crop. The asset is therefore pre-cropped to
          the skyline at 1130×1340 (0.843, near-identical to the column), which
          also removes the baked wordmark for good at any panel shape; the name
          and slogan are drawn on top instead, so they stay sharp and can
          translate. */}
      <div
        className="relative hidden overflow-hidden lg:block"
        style={{ backgroundColor: BRAND_NAVY }}
      >
        <img
          src="/brand/riyadh-skyline.webp"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* The lockup sits over a night skyline whose road lights are bright
            enough to eat the slogan without this. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, rgba(4,10,49,0.94) 0%, rgba(4,10,49,0.72) 26%, rgba(4,10,49,0) 58%)',
          }}
        />
        <div className="relative flex h-full flex-col justify-end gap-3 p-10 pb-14">
          <span aria-hidden className="h-px w-full" style={{ backgroundColor: BRAND_GOLD }} />
          <BrandMark plate={false} decorative width={416} className="max-w-full" />
          <p className="max-w-sm text-sm text-white/85 italic">{t('slogan')}</p>
        </div>
      </div>
    </div>
  );
}
