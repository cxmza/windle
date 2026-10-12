import type { TrackRecord } from './types';

export function RecordLabel({ record }: { record: TrackRecord }) {
  return (
    <span className="whitespace-nowrap text-sm text-muted-foreground">
      <span className="font-mono tabular-nums text-foreground">{record.shipped}</span> shipped ·{' '}
      <span className="font-mono tabular-nums text-foreground">{record.slashed}</span> slashed
    </span>
  );
}
