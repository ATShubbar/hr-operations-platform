import { cn } from '@/lib/utils';

// A job title in two tones (PEOPLE-01): the seniority in grey, the job itself in
// the text colour — "Senior Accountant" reads as an Accountant first. English
// titles only; any other title, and any title without such a first word, is
// shown whole.
const LEAD = /^(senior|sr\.?|junior|jr\.?|lead|chief|head|assistant|associate|principal)\s+(.+)$/i;

export function JobTitle({ title, className }: { title: string | null; className?: string }) {
  if (!title) return <span className={cn('text-neutral-400', className)}>—</span>;
  const split = LEAD.exec(title);
  return (
    <span className={className}>
      {split ? (
        <>
          <span className="text-muted-foreground">{split[1]} </span>
          {split[2]}
        </>
      ) : (
        title
      )}
    </span>
  );
}
