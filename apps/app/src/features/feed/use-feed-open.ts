import { useState } from 'react';

export const FEED_OPEN_KEY = 'windle.feed.open.v1';

function read(): boolean {
  try {
    return window.localStorage.getItem(FEED_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** Whether the feed drawer is open between the mobile and desktop breakpoints. Remembered per browser. */
export function useFeedOpen(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(read);
  const set = (next: boolean) => {
    setOpen(next);
    try {
      window.localStorage.setItem(FEED_OPEN_KEY, next ? '1' : '0');
    } catch {
      // storage can be blocked; the toggle still works for this visit
    }
  };
  return [open, set];
}
