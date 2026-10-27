import type { ApiImage } from '@windle/shared';
import { SmartImage } from '@/features/media/SmartImage';

type Size = 'sm' | 'md' | 'lg';

const box: Record<Size, string> = {
  sm: 'size-8 text-sm',
  md: 'size-9 text-sm',
  lg: 'size-12 text-xl md:size-14 md:text-2xl',
};

/** A market's picture when it has one (cropped square by the CDN), else the first letter of its name. */
export function Monogram({
  name,
  size = 'md',
  image,
}: {
  name: string;
  size?: Size;
  image?: ApiImage | null | undefined;
}) {
  if (image) {
    return (
      <span data-monogram="image" className={`inline-flex shrink-0 ${box[size]}`}>
        <SmartImage
          image={image}
          preset={size === 'lg' ? 'avatar128' : 'avatar64'}
          alt=""
          className="size-full rounded-md border border-(--hairline)"
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      data-monogram
      className={`inline-flex shrink-0 items-center justify-center rounded-md border border-(--hairline) bg-muted font-semibold text-foreground select-none ${box[size]}`}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
