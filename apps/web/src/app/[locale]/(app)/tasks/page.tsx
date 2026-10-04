import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

// Task history (DS-13) was retired in DS-22b (owner decision): finished tasks
// are in the Work queue's Finished view. Kept as a redirect, preset to tasks.
// (new-task-dialog.tsx in this folder is still the queue's New task form.)
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (hasLocale(['ar', 'en'], locale)) setRequestLocale(locale);
  redirect({ href: '/queue?view=finished&kind=task', locale });
}
