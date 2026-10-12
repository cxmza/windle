import { Digits } from '@/components/Digits';
import { countdown } from './format';

/** d hh:mm:ss that flips digit by digit; the seconds pair breathes once per tick. */
export function Countdown({ deadline, now }: { deadline: string; now: number }) {
  const text = countdown(deadline, now);
  const secs = text.slice(-2);
  return (
    <time dateTime={deadline} data-countdown>
      <Digits text={text.slice(0, -2)} dir="down" />
      <span data-seconds={Number(secs) % 2 ? 'odd' : 'even'}>
        <Digits text={secs} dir="down" />
      </span>
    </time>
  );
}
