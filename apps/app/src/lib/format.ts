/** `9WzDXw…tAWWM`: enough to recognise an address without letting it blow out a 360px layout. */
export function shortAddress(address: string, head = 4, tail = 4): string {
  return address.length <= head + tail + 1 ? address : `${address.slice(0, head)}…${address.slice(-tail)}`;
}

const dateTime = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });
const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

export const formatDateTime = (iso: string): string => dateTime.format(new Date(iso));
export const formatDate = (iso: string): string => date.format(new Date(iso));
