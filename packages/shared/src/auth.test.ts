import { describe, expect, it } from 'vitest';
import { AUTH_PROVIDERS, AuthProviders, Session, SiwsNonce, SiwsVerifyRequest } from './auth.ts';

const address = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

describe('auth contracts', () => {
  it('accepts a nonce response the api would issue', () => {
    const parsed = SiwsNonce.parse({
      nonce: 'a1b2c3d4e5',
      input: {
        domain: 'oauth.windle.fun',
        statement: 'Sign in to windle',
        uri: 'https://oauth.windle.fun',
        version: '1',
        chainId: 'mainnet',
        nonce: 'a1b2c3d4e5',
        issuedAt: '2026-10-11T12:00:00Z',
        expirationTime: '2026-10-11T12:05:00Z',
      },
    });
    expect(parsed.input.nonce).toBe(parsed.nonce);
  });

  it('rejects a short nonce and a non-base58 address', () => {
    const base = { nonce: 'a1b2c3d4', address, signedMessage: 'aGVsbG8=', signature: '1'.repeat(88) };
    expect(SiwsVerifyRequest.safeParse(base).success).toBe(true);
    expect(SiwsVerifyRequest.safeParse({ ...base, nonce: 'short' }).success).toBe(false);
    expect(SiwsVerifyRequest.safeParse({ ...base, address: '0OIl'.repeat(10) }).success).toBe(false);
  });

  it('narrows the session union on `authenticated`', () => {
    const s = Session.parse({ authenticated: false });
    expect(s.authenticated).toBe(false);
  });

  it('knows every sign-in method, including telegram and discord', () => {
    expect(AUTH_PROVIDERS).toEqual(['siws', 'email', 'x', 'google', 'telegram', 'discord']);
    const parsed = AuthProviders.parse({
      providers: AUTH_PROVIDERS.map((id) => ({ id, enabled: id === 'siws' })),
    });
    expect(parsed.providers).toHaveLength(6);
    expect(AuthProviders.safeParse({ providers: [{ id: 'myspace', enabled: false }] }).success).toBe(false);
  });
});
