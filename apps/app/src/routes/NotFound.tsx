import { Link } from 'react-router';
import { PageHeading } from '@/components/PageHeading';

export function NotFound() {
  return (
    <>
      <PageHeading title="Page not found" lede="That address does not lead anywhere here." />
      <p>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-pill bg-accent px-6 text-sm font-semibold text-accent-foreground transition-colors duration-(--dur-fast) hover:bg-accent-hover"
        >
          Back to the dashboard
        </Link>
      </p>
    </>
  );
}
