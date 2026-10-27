export const rowClass =
  'relative flex h-8 min-w-0 items-center gap-2.5 rounded-md px-2.5 text-sm font-normal text-muted-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) active:bg-(--selected) aria-[current=page]:bg-(--selected) aria-[current=page]:text-foreground max-md:h-10 before:pointer-events-none before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-(--accent) before:opacity-0 aria-[current=page]:before:opacity-100 [@media(hover:hover)]:hover:bg-(--hover) [@media(hover:hover)]:hover:text-foreground';

/** Same padding as the full row, so the icon does not move when the rail takes over. */
export const railRowClass = 'w-10';
