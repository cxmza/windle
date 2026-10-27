import { Digits } from '@/components/Digits';
import { usePref } from '@/features/settings/prefs';
import { countdown, formatDeadline } from './format';

/** A deadline as a local date and time, in the 12/24-hour format chosen in settings. */
export function DeadlineTime({ deadline }: { deadline: string }) {
  const clock = usePref('clock');
  return <time dateTime={deadline}>{formatDeadline(deadline, clock)}</time>;
}

/** A live deadline in the form chosen in settings: a ticking countdown, or the absolute date and time. */
export function DeadlineValue({ deadline, now, srLeft = false }: { deadline: string; now: number; srLeft?: boolean }) {
  if (usePref('deadlines') === 'date') return <DeadlineTime deadline={deadline} />;
  return (
    <>
      <Digits text={countdown(deadline, now)} dir="down" />
      {srLeft ? <span className="sr-only"> left</span> : null}
    </>
  );
}
