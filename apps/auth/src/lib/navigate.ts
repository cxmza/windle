/** Full-page navigation to another origin. Isolated so tests can replace it. */
export function redirectTo(url: string): void {
  window.location.assign(url);
}
