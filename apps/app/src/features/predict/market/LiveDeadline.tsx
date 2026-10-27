import { usePref } from '@/features/settings/prefs';
import { useClock } from '@/lib/clock';
import { DeadlineTime, DeadlineValue } from '../../markets/DeadlineValue';

type Props = {
  deadline: string;
  live: boolean;
  /** A lead-in such as "Closes": a running countdown reads "Closes in 7:59:56", a date "Closes Oct 11, 13:25". */
  verb?: string;
};

/** A countdown while `live`, the plain date and time otherwise; both follow the deadline preferences. */
export function LiveDeadline({ deadline, live, verb }: Props) {
  const now = useClock('second', live);
  const mode = usePref('deadlines');
  const countdown = live && mode === 'countdown';
  const value = live ? <DeadlineValue deadline={deadline} now={now} srLeft /> : <DeadlineTime deadline={deadline} />;
  if (!verb) return value;
  return (
    <>
      {verb}
      {countdown ? ' in ' : ' '}
      {value}
    </>
  );
}
