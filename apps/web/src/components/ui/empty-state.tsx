import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

// EmptyState (UX-02) — FOUR distinct states, not one.
//
// The app currently collapses all of them into a single grey sentence, so "you
// have no documents yet", "your filter matched nothing", "the server is down" and
// "you lack permission" are indistinguishable. They need opposite responses, and
// the CTA rules differ sharply:
//
//   first-run   → an illustration and a create action. The only variant that
//                 gets either.
//   no-results  → NO create action. Offer "clear filters" and echo what was
//                 filtered; a create button here is answering a question nobody
//                 asked.
//   error       → a retry, and the real reason. Never a create action.
//   restricted  → name the capability and who can grant it. A client rep must
//                 never be told to "add your first employee".
//
// The rule underneath all four: never a dead end.
type Variant = 'first-run' | 'no-results' | 'error' | 'restricted';

const TONE: Record<Variant, string> = {
  'first-run': 'text-foreground',
  'no-results': 'text-foreground',
  error: 'text-status-critical',
  restricted: 'text-status-neutral',
};

function EmptyState({
  variant = 'first-run',
  title,
  description,
  action,
  icon,
  className,
}: {
  variant?: Variant;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Only meaningful for first-run; the other three are deliberately plain. */
  icon?: ReactNode;
  className?: string;
}) {
  const showIcon = variant === 'first-run' && icon;
  return (
    <div
      data-slot="empty-state"
      data-variant={variant}
      // role="status" so a filter that matches nothing is ANNOUNCED. The common
      // failure is a sighted user not noticing the list went empty; a screen
      // reader user has no chance at all without this.
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg border bg-card px-6 py-10 text-center',
        className,
      )}
    >
      {showIcon && <div className="mb-1 text-muted-foreground">{icon}</div>}
      <p className={cn('text-sm font-medium', TONE[variant])}>{title}</p>
      {description && (
        <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export { EmptyState };
