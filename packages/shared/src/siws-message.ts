import type { SiwsSignInInput } from './auth.ts';

/**
 * Sign-In With Solana message text (CAIP-122 / EIP-4361 shape, as produced by `createSignInMessageText` in
 * @solana/wallet-standard-util and by wallets implementing `solana:signIn`):
 *
 *   ${domain} wants you to sign in with your Solana account:
 *   ${address}
 *
 *   ${statement}
 *
 *   URI: ${uri}
 *   Version: ${version}
 *   Chain ID: ${chainId}
 *   Nonce: ${nonce}
 *   Issued At: ${issuedAt}
 *   Expiration Time: ${expirationTime}
 *   Not Before: ${notBefore}
 *   Request ID: ${requestId}
 *   Resources:
 *   - ${resource}
 *
 * Every field after the address is optional; present fields keep this order.
 *
 * The api parses the message a wallet actually signed and compares each field with what it issued.
 * `createSiwsMessage` is the fallback for wallets without `solana:signIn`: build the text, `signMessage` it, and
 * post the same verify body.
 */
export interface SiwsMessageFields {
  domain: string;
  address: string;
  statement?: string;
  uri?: string;
  version?: string;
  chainId?: string;
  nonce?: string;
  issuedAt?: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}

const HEADER_SUFFIX = ' wants you to sign in with your Solana account:';

const FIELD_LABELS = [
  ['uri', 'URI'],
  ['version', 'Version'],
  ['chainId', 'Chain ID'],
  ['nonce', 'Nonce'],
  ['issuedAt', 'Issued At'],
  ['expirationTime', 'Expiration Time'],
  ['notBefore', 'Not Before'],
  ['requestId', 'Request ID'],
] as const satisfies ReadonlyArray<readonly [keyof SiwsMessageFields, string]>;

type ScalarField = (typeof FIELD_LABELS)[number][0];

export function createSiwsMessage(fields: SiwsMessageFields): string {
  let message = `${fields.domain}${HEADER_SUFFIX}\n${fields.address}`;
  if (fields.statement) message += `\n\n${fields.statement}`;

  const lines: string[] = [];
  for (const [key, label] of FIELD_LABELS) {
    const value = fields[key];
    if (value) lines.push(`${label}: ${value}`);
  }
  if (fields.resources) {
    lines.push('Resources:');
    for (const resource of fields.resources) lines.push(`- ${resource}`);
  }
  if (lines.length > 0) message += `\n\n${lines.join('\n')}`;
  return message;
}

/** Convenience for the auth app: the exact message for an api-issued input and the connected account. */
export function createSiwsMessageForInput(input: SiwsSignInInput, address: string): string {
  return createSiwsMessage({ ...input, address });
}

/**
 * Strict parser. Returns null for anything that is not a well-formed SIWS message: unknown field labels, duplicate
 * fields, fields out of order, trailing garbage, CR characters. Being strict is deliberate: the api only has to
 * accept messages wallets produce from the input it issued.
 */
export function parseSiwsMessage(text: string): SiwsMessageFields | null {
  if (text.includes('\r')) return null;
  const lines = text.split('\n');

  const header = lines[0];
  const address = lines[1];
  if (header === undefined || address === undefined || !header.endsWith(HEADER_SUFFIX)) return null;
  const domain = header.slice(0, -HEADER_SUFFIX.length);
  if (!domain || /\s/.test(domain) || !address || /\s/.test(address)) return null;

  const result: SiwsMessageFields = { domain, address };
  let i = 2;
  if (i === lines.length) return result;

  // Blank separator, then either a statement paragraph or the field block.
  if (lines[i] !== '') return null;
  i++;
  const isFieldLine = (line: string | undefined) =>
    line !== undefined && (line === 'Resources:' || FIELD_LABELS.some(([, label]) => line.startsWith(`${label}: `)));

  if (lines[i] !== undefined && !isFieldLine(lines[i])) {
    const statement = lines[i];
    if (!statement) return null;
    result.statement = statement;
    i++;
    if (i === lines.length) return result;
    if (lines[i] !== '') return null;
    i++;
  }

  let order = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    if (line === 'Resources:') {
      const resources: string[] = [];
      i++;
      while (i < lines.length) {
        const item = lines[i] as string;
        if (!item.startsWith('- ') || item.length === 2) return null;
        resources.push(item.slice(2));
        i++;
      }
      result.resources = resources;
      break;
    }
    const index = FIELD_LABELS.findIndex(([, label]) => line.startsWith(`${label}: `));
    if (index < order) return null; // unknown label (-1), duplicate or out of order
    const [key, label] = FIELD_LABELS[index] as (typeof FIELD_LABELS)[number];
    const value = line.slice(label.length + 2);
    if (!value) return null;
    (result as Record<ScalarField, string | undefined>)[key] = value;
    order = index + 1;
    i++;
  }
  return result;
}
