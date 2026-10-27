import { WindleMark } from '@windle/brand';
import { useRouteError } from 'react-router';
import { Button } from '@/components/Button';

/** Last-resort boundary for render/loader errors. API outages are handled closer to the data (ApiUnavailable). */
export function RouteError() {
  const error = useRouteError();
  const detail = error instanceof Error ? error.message : null;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-(--gutter) py-12">
      <WindleMark decorative size={56} />
      <div
        role="alert"
        className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-(--hairline) bg-surface p-4"
      >
        <h1 className="text-base font-semibold">Something broke on our side</h1>
        <p className="text-sm text-muted-foreground">Reload the page. If it keeps happening, tell us.</p>
        {import.meta.env.DEV && detail ? <pre className="overflow-x-auto font-mono text-caption">{detail}</pre> : null}
        <div>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    </div>
  );
}
