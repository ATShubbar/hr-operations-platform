import { cn } from '@/lib/utils';

// Textarea (UX-02). Previously hand-written twice, with the class string copied
// between the requests and tasks dialogs — the kind of duplication that drifts.
// Mirrors input.tsx's geometry so a description field sits correctly next to a
// text field.
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'field-sizing-content min-h-16 w-full rounded-2xl border border-transparent bg-input/50 px-2.5 py-1.5 text-base transition-[color,box-shadow] duration-200 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
