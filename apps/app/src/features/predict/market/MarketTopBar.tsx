import { Link } from 'react-router';

export function MarketTopBar() {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <Link
        to="/"
        className="-ml-2 inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-(--dur-instant) hover:text-foreground active:opacity-80"
      >
        <span aria-hidden="true">←</span>
        All markets
      </Link>
    </nav>
  );
}
