const dateFmt = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' });
export const formatDate = (iso: string): string => dateFmt.format(new Date(iso));

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function ago(iso: string, now: number): string {
  const ms = Math.max(0, now - Date.parse(iso));
  if (ms < MINUTE) return 'just now';
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ago`;
  return `${Math.floor(ms / DAY)}d ago`;
}
