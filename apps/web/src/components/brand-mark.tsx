import { cn } from '@/lib/utils';

// The PEOPLE&GRO wordmark (UX-15).
//
// The artwork is gold on navy, and that is not a stylistic preference — measured,
// the gold is 12.69:1 on the brand navy and 1.45:1 on our near-white sidebar.
// It is legible on a dark ground and invisible on a light one.
//
// So a light surface gets the mark on a NAVY CHIP rather than a recoloured
// wordmark: the brand's own colours are preserved exactly, and nothing about the
// logo is redrawn to suit our theme. `plate={false}` is for surfaces that are
// already dark (the login panel), where a chip would be a box around nothing.
export function BrandMark({
  plate = true,
  decorative = false,
  className,
  width = 132,
}: {
  plate?: boolean;
  /** Alt text off, for surfaces that already name the brand in text nearby. */
  decorative?: boolean;
  className?: string;
  width?: number;
}) {
  // A plain <img>, not next/image: a 17KB local asset rendered at a fixed size
  // needs no loader or wrapper, and width/height are set so it reserves its box
  // and contributes no layout shift.
  const mark = (
    <img
      src="/brand/wordmark.webp"
      alt={decorative ? '' : 'PEOPLE&GRO'}
      width={width}
      height={Math.round((width * 105) / 1020)}
      className="block h-auto"
      style={{ width }}
    />
  );

  if (!plate) return <span className={className}>{mark}</span>;

  return (
    <span
      className={cn('inline-flex items-center rounded-md px-2.5 py-2', className)}
      style={{ backgroundColor: '#040a31' }}
    >
      {mark}
    </span>
  );
}
