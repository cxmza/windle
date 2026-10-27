import type { MediaKind } from '@windle/shared';
import type { ReactNode } from 'react';

type Props = { src: string; kind: MediaKind };

const frame = 'inline-block overflow-hidden border border-(--hairline) bg-muted';

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className="flex min-w-0 flex-col items-center gap-1.5">
      <div className="flex h-14 items-center justify-center">{children}</div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </li>
  );
}

function Framed({ src, className }: { src: string; className: string }) {
  return (
    <span className={`${frame} ${className}`}>
      <img src={src} alt="" draggable={false} className="size-full object-cover" />
    </span>
  );
}

/**
 * How the picture will sit in the places it is shown, drawn from the local preview. The server crops squares around
 * the subject, so these centred crops are close, not exact.
 */
export function FramePreview({ src, kind }: Props) {
  return (
    <ul aria-label="How it will look" className="m-0 flex list-none flex-wrap items-end gap-x-6 gap-y-3 p-0">
      {kind === 'avatar' ? (
        <>
          <Tile label="Profile">
            <Framed src={src} className="size-14 rounded-full" />
          </Tile>
          <Tile label="Menu">
            <Framed src={src} className="size-8 rounded-full" />
          </Tile>
        </>
      ) : (
        <>
          <Tile label="Card">
            <Framed src={src} className="h-14 w-20 rounded-md" />
          </Tile>
          <Tile label="List">
            <Framed src={src} className="size-8 rounded-md" />
          </Tile>
          <Tile label="Token">
            <Framed src={src} className="size-14 rounded-full" />
          </Tile>
        </>
      )}
    </ul>
  );
}
