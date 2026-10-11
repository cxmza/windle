import { WindleMark } from '@windle/brand';
import { useEffect } from 'react';
import { chapterPath } from './routes';

/** Unknown path (the server only serves index.html for the chapter paths, so this is a client-side safety net). */
export function NotFound() {
  useEffect(() => {
    document.title = '404 — windle';
  }, []);
  return (
    <main
      id="main"
      tabIndex={-1}
      data-not-found
      className="flex min-h-svh flex-col items-center justify-center gap-6 px-(--gutter) text-center outline-none"
    >
      <WindleMark size={56} />
      <p className="text-kicker font-semibold uppercase tracking-[0.18em] text-muted-foreground">Error 404</p>
      <h1 className="font-display text-4xl font-black uppercase tracking-tight">This page does not exist.</h1>
      <a
        href={chapterPath('hero')}
        className="inline-flex min-h-11 items-center rounded-pill bg-accent px-5 text-kicker font-semibold uppercase tracking-[0.12em] text-accent-foreground transition-colors duration-(--dur-fast) ease-standard active:bg-accent-hover [@media(hover:hover)]:hover:bg-accent-hover"
      >
        Back to windle
      </a>
    </main>
  );
}
