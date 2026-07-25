import { cn } from '@/lib/utils';

// Skeleton (UX-02). Fifteen of twenty-one screens currently render nothing while
// loading — a table header over blank white with no sign anything is happening.
//
// Two deliberate constraints:
//
// 1. The pulse runs a FINITE number of iterations. An indefinitely looping
//    animation over five seconds needs a pause control to be conformant, and a
//    shimmer nobody can stop is also just irritating on a screen someone stares
//    at all day. It settles into a static placeholder instead.
// 2. `motion-safe:` gates it entirely for anyone who has asked for reduced motion.
//
// Match the real layout — same row count, same heights — so there is no layout
// shift when content arrives. A skeleton that reflows is worse than a spinner.
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(
        'rounded-md bg-muted motion-safe:animate-pulse [animation-iteration-count:3]',
        className,
      )}
      {...props}
    />
  );
}

// A screen reader gets nothing from a stack of grey rectangles, so the loading
// state is announced once here instead. `role="status"` is polite: it waits for a
// gap rather than interrupting, which is right for something the user initiated.
// Note the region must exist in the DOM before the text lands, or it never
// announces at all — hence the wrapper rather than a bare conditional.
function SkeletonRegion({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & { label: string }) {
  return (
    <div role="status" aria-live="polite" className={className} {...props}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

// Table body placeholder, sized to what is about to render.
function SkeletonRows({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 border-b px-3 py-2.5 last:border-b-0">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton
              key={c}
              className="h-3.5"
              // Vary the widths so it reads as content rather than as a grid,
              // and taper the first column wider (it holds the identifier).
              style={{ inlineSize: c === 0 ? '28%' : `${18 - c * 2}%` }}
            />
          ))}
        </div>
      ))}
    </>
  );
}

export { Skeleton, SkeletonRegion, SkeletonRows };
