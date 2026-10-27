import type { XVerified } from '@windle/shared';

const LABEL = {
  blue: 'Verified account',
  business: 'Verified business account',
  government: 'Verified government account',
} as const;

const COLOR = {
  blue: 'text-(--x-verified-blue)',
  business: 'text-(--x-verified-gold)',
  government: 'text-(--x-verified-grey)',
} as const;

const SEAL =
  'M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z';

const CHECK = 'M7.2 12.4l3.2 3.2 6.2-6.8';

/** The check mark of an account X has verified: a seal for people and governments, a rounded square for businesses. */
export function VerifiedBadge({ kind, size = 16 }: { kind: XVerified | undefined; size?: number }) {
  if (!kind || kind === 'none') return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="img"
      aria-label={LABEL[kind]}
      data-verified={kind}
      className={`shrink-0 ${COLOR[kind]}`}
    >
      <title>{LABEL[kind]}</title>
      {kind === 'business' ? (
        <>
          <rect x="2.2" y="2.2" width="19.6" height="19.6" rx="5.4" fill="currentColor" />
          <path
            d={CHECK}
            fill="none"
            stroke="var(--background)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <path fill="currentColor" d={SEAL} />
      )}
    </svg>
  );
}
