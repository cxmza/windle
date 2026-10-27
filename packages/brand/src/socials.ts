/**
 * The project's public links: one source of truth for web, app and docs.
 * A null value means "not public yet": production hides the entry, dev shows it as a placeholder so layouts can be reviewed.
 */
export const SOCIALS = {
  x: 'https://x.com/windlepro' as string | null,
  github: 'https://github.com/cxmza/windle' as string | null,
} as const;

/**
 * The windle token's mint address on pump.fun. null hides the CA chip everywhere, so a placeholder can never be
 * mistaken for the real contract.
 */
export const TOKEN_CA: string | null = 'E4mQ9PH1BVgVdYwiQeh8ZNv4YTEVo7gjR81q4mZGpump';

export type SocialSlot = keyof typeof SOCIALS;

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isSolanaAddress(value: string): boolean {
  return SOLANA_ADDRESS.test(value);
}

export function pumpFunUrl(mint: string): string {
  return `https://pump.fun/coin/${mint}`;
}

/** "7xKXtg…Npump" — head and tail kept so people can eyeball it against other sources. */
export function shortAddress(address: string, head = 4, tail = 4): string {
  return address.length <= head + tail + 1 ? address : `${address.slice(0, head)}…${address.slice(-tail)}`;
}

/** The token CA only when it is set and well-formed; anything else renders nothing. */
export function tokenCa(): string | null {
  return TOKEN_CA !== null && isSolanaAddress(TOKEN_CA) ? TOKEN_CA : null;
}
