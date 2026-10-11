import { ApiRequestError } from '@/lib/api';
import { API_URL, IS_LOCAL_API } from '@/lib/env';
import { Button } from './Button';

function describe(error: unknown): { title: string; body: string } {
  if (error instanceof ApiRequestError && error.kind === 'http' && error.status !== null && error.status >= 500) {
    return {
      title: 'windle is having trouble',
      body: 'Our server returned an error. Nothing you did caused it. Try again in a moment.',
    };
  }
  if (error instanceof ApiRequestError && error.kind === 'schema') {
    return {
      title: 'Unexpected answer from the server',
      body: 'The app and the server may be mid-update. Try again in a moment.',
    };
  }
  if (error instanceof ApiRequestError && error.kind === 'http') {
    return { title: 'The server refused the request', body: error.message };
  }
  return { title: 'Can’t reach windle', body: 'Check your connection, then try again. Your data is safe.' };
}

interface Props {
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
}

/** Friendly "API is down" banner with retry; adds a dev-only hint when the API is configured on localhost. */
export function ApiUnavailable({ error, onRetry, retrying = false, className = '' }: Props) {
  const { title, body } = describe(error);
  const devHint = IS_LOCAL_API && error instanceof ApiRequestError && error.kind === 'network';
  return (
    <div role="alert" className={`glass flex flex-col gap-4 rounded-2xl p-5 ${className}`}>
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-base font-bold lowercase tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      {devHint ? (
        <p className="rounded-xl border border-dashed border-border-accent/60 px-4 py-3 text-caption text-accent-text">
          Dev notice: the API at <code className="font-mono">{API_URL}</code> is not responding. Start it with{' '}
          <code className="font-mono">npm run dev:api</code> (needs Postgres and Redis).
        </p>
      ) : null}
      <div>
        <Button variant="secondary" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Retrying…' : 'Try again'}
        </Button>
      </div>
    </div>
  );
}
