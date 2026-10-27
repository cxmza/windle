import { pill } from './styles';

export function PracticeBadge({ variant = 'tag' }: { variant?: 'tag' | 'pill' }) {
  if (variant === 'pill') {
    return (
      <span title="Practice points have no real value" className={`${pill} border-(--hairline) text-muted-foreground`}>
        Practice
      </span>
    );
  }
  return (
    <span
      title="Practice points have no real value"
      className="inline-flex h-5 shrink-0 items-center rounded-sm border border-(--hairline) px-1.5 text-xs font-medium tracking-[0.04em] text-muted-foreground uppercase"
    >
      Practice
    </span>
  );
}
