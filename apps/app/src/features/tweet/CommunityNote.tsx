import type { XCommunityNote } from '@windle/shared';
import { safeHref } from '../predict/ui/linkify';

export function CommunityNote({ note }: { note: XCommunityNote }) {
  const href = note.url ? safeHref(note.url) : null;
  return (
    <aside
      data-community-note
      aria-label="Community note"
      className="flex flex-col gap-1 rounded-lg border border-(--hairline) bg-surface-raised p-2.5"
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <svg
          viewBox="0 0 16 16"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="6.2" />
          <path d="M8 7.2v3.6M8 5.1v.1" strokeLinecap="round" />
        </svg>
        Readers added context
      </p>
      <p className="text-sm leading-snug whitespace-pre-wrap text-foreground">{note.text}</p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="w-fit text-xs font-medium text-accent-text underline-offset-2 transition-colors duration-(--dur-instant) active:opacity-80 [@media(hover:hover)]:hover:underline"
        >
          Learn more<span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : null}
    </aside>
  );
}
