import { useState } from 'react';
import { safeHref } from '../predict/ui/linkify';
import { FeedImage } from './FeedImage';

const box = {
  sm: 'size-8 text-sm',
  xs: 'size-5 text-xs',
  md: 'size-10 text-base',
} as const;

export function FeedAvatar({
  name,
  src,
  size = 'sm',
  eager = false,
}: {
  name: string;
  src?: string | undefined;
  size?: keyof typeof box;
  eager?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const url = src ? safeHref(src) : null;
  return (
    <span
      aria-hidden="true"
      data-feed-avatar
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-(--hairline) bg-muted font-semibold text-foreground select-none ${box[size]}`}
    >
      {name.trim().charAt(0).toUpperCase()}
      {url && !broken ? (
        <FeedImage
          src={url}
          alt=""
          width={40}
          height={40}
          eager={eager}
          onError={() => setBroken(true)}
          className="absolute inset-0 size-full bg-muted object-cover"
        />
      ) : null}
    </span>
  );
}
