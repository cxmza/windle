import { describe, expect, it } from 'vitest';
import { createSiwsMessage, parseSiwsMessage } from './siws-message.ts';

const address = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

// Written out by hand from the SIWS / CAIP-122 template, not produced by createSiwsMessage.
const full = [
  'oauth.windle.fun wants you to sign in with your Solana account:',
  address,
  '',
  'Sign in to windle',
  '',
  'URI: https://oauth.windle.fun',
  'Version: 1',
  'Chain ID: mainnet',
  'Nonce: a1b2c3d4e5',
  'Issued At: 2026-10-11T12:00:00.000Z',
  'Expiration Time: 2026-10-11T12:05:00.000Z',
].join('\n');

describe('SIWS message', () => {
  const fields = {
    domain: 'oauth.windle.fun',
    address,
    statement: 'Sign in to windle',
    uri: 'https://oauth.windle.fun',
    version: '1',
    chainId: 'mainnet',
    nonce: 'a1b2c3d4e5',
    issuedAt: '2026-10-11T12:00:00.000Z',
    expirationTime: '2026-10-11T12:05:00.000Z',
  };

  it('builds the canonical text', () => {
    expect(createSiwsMessage(fields)).toBe(full);
  });

  it('round-trips through the parser', () => {
    expect(parseSiwsMessage(full)).toEqual(fields);
  });

  it('parses a message without statement and with resources', () => {
    const text = `x.test wants you to sign in with your Solana account:\n${address}\n\nNonce: abcdefgh\nResources:\n- https://a\n- https://b`;
    expect(parseSiwsMessage(text)).toEqual({
      domain: 'x.test',
      address,
      nonce: 'abcdefgh',
      resources: ['https://a', 'https://b'],
    });
  });

  it.each([
    ['CRLF line endings', full.replaceAll('\n', '\r\n')],
    ['unknown field', `${full}\nFoo: bar`],
    ['duplicate field', `${full}\nNonce: other1234`],
    ['out of order', full.replace('Version: 1\nChain ID: mainnet', 'Chain ID: mainnet\nVersion: 1')],
    ['wrong header', full.replace('Solana', 'Ethereum')],
    ['trailing newline', `${full}\n`],
    ['empty', ''],
  ])('rejects %s', (_, text) => {
    expect(parseSiwsMessage(text)).toBeNull();
  });
});
