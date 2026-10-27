import type { ApiImage, ImagePreset } from '@windle/shared';
import type { ReactNode } from 'react';
import { WalletAvatar } from '@/components/WalletAvatar';
import { SmartImage } from './SmartImage';

type Props = {
  address: string;
  image?: ApiImage | null | undefined;
  /** `avatar64` is sharp up to 32 px at 2x; use `avatar128` from about 48 px. */
  preset?: Extract<ImagePreset, 'avatar64' | 'avatar128'>;
  /** What to draw when there is no picture; the wallet gradient by default. */
  fallback?: ReactNode;
  className?: string;
};

/** A person's profile picture, or their wallet gradient while they have none. Decorative: the name sits beside it. */
export function UserAvatar({ address, image, preset = 'avatar64', fallback, className = 'size-8' }: Props) {
  if (image) {
    return (
      <SmartImage
        image={image}
        preset={preset}
        alt=""
        className={`shrink-0 rounded-full border border-(--hairline) ${className}`}
      />
    );
  }
  return fallback ?? <WalletAvatar address={address} className={className} />;
}
