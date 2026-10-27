import { CopyButton } from '@/components/CopyButton';
import { API_URL, DOCS_URL } from '@/lib/env';

export function DocsLink() {
  return (
    <a
      href={DOCS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-(--hairline) px-3 text-sm font-medium text-foreground transition-colors duration-(--dur-instant) ease-(--ease-standard) max-md:h-11 active:bg-(--selected) [@media(hover:hover)]:hover:bg-(--hover)"
    >
      Open docs
      <span aria-hidden="true">↗</span>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

export function ApiBaseUrl() {
  return (
    <>
      <code className="min-w-0 truncate font-mono text-sm" title={API_URL}>
        {API_URL}
      </code>
      <CopyButton value={API_URL} label="Copy API base URL" />
    </>
  );
}

export function ApiKeys() {
  return <span className="text-sm text-muted-foreground">Not available yet</span>;
}
