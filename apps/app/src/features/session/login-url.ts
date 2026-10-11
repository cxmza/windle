import { AUTH_URL } from '@/lib/env';

/** Sign-in page URL that sends the person back to where they were (`return_to` is allow-listed by the auth app). */
export function loginUrl(returnTo: string = window.location.href): string {
  const url = new URL(AUTH_URL);
  url.pathname = '/';
  url.searchParams.set('return_to', returnTo);
  return url.toString();
}
