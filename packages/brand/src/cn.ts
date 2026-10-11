import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Same helper as apps/web/src/lib/cn.ts: later Tailwind classes win (a consumer's `text-*` replaces `text-accent`). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
