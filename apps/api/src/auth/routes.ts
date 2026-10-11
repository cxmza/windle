import {
  ApiError,
  type ApiErrorCode,
  type AuthProvider,
  AuthProviders,
  Me,
  Session,
  SiwsNonce,
  SiwsVerifyRequest,
  SiwsVerifyResponse,
} from '@windle/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppContext } from '../context.ts';
import { dep, HttpError } from '../errors.ts';
import { newNonce, newSessionToken, sha256Hex } from '../lib/crypto.ts';
import type { SessionRecord } from '../store/types.ts';
import { clearSessionCookie, readSession, renewSession, setSessionCookie } from './session.ts';
import { buildSignInInput, checkMessageAgainstIssued, decodeSignedMessage, verifySignature } from './siws.ts';

const errors = {
  400: ApiError,
  401: ApiError,
  403: ApiError,
  429: ApiError,
  501: ApiError,
  503: ApiError,
};

const PROVIDER_NAMES: Record<AuthProvider, string> = {
  siws: 'Solana',
  email: 'email',
  x: 'X',
  google: 'Google',
  telegram: 'Telegram',
  discord: 'Discord',
};

function authLimit(ctx: AppContext) {
  return { rateLimit: { max: ctx.config.rateLimit.authMax, timeWindow: ctx.config.rateLimit.windowSeconds * 1000 } };
}

function requireProvider(ctx: AppContext, provider: AuthProvider) {
  if (!ctx.config.providers[provider])
    throw new HttpError(501, 'provider_disabled', `Sign-in with ${provider} is not enabled on this server`);
}

export async function authRoutes(app: FastifyInstance, ctx: AppContext) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/v1/auth/providers',
    {
      schema: {
        tags: ['Auth'],
        summary: 'List sign-in methods',
        description:
          'Which sign-in methods this server offers. Only `siws` is live today; the others are reserved and answer `501`.',
        response: { 200: AuthProviders },
      },
    },
    async () => ({
      providers: (Object.keys(ctx.config.providers) as AuthProvider[]).map((id) => ({
        id,
        enabled: ctx.config.providers[id],
      })),
    }),
  );

  const issueNonce = async () => {
    requireProvider(ctx, 'siws');
    for (let attempt = 0; attempt < 3; attempt++) {
      const nonce = newNonce();
      const input = buildSignInInput(
        { ...ctx.config.siws, ttlSeconds: ctx.config.siws.nonceTtlSeconds },
        nonce,
        ctx.now(),
      );
      if (await dep('redis', () => ctx.store.putNonce(nonce, input, ctx.config.siws.nonceTtlSeconds))) {
        ctx.metrics.authEvents.inc({ event: 'siws_nonce', result: 'issued' });
        return { nonce, input };
      }
    }
    throw new HttpError(503, 'service_unavailable', 'Could not allocate a nonce');
  };
  const nonceSchema = {
    tags: ['Auth'],
    summary: 'Get a sign-in nonce',
    description:
      'Step 1 of Sign-In With Solana. Returns the complete `SolanaSignInInput` to pass unchanged to the wallet ' +
      '`solana:signIn` feature. The nonce is stored server-side and can be redeemed once by ' +
      '`POST /v1/auth/siws/verify` before `expirationTime` (5 minutes). GET and POST (no body) are equivalent.',
    response: { 200: SiwsNonce, ...errors },
  };
  r.get('/v1/auth/siws/nonce', { schema: nonceSchema, config: authLimit(ctx) }, issueNonce);
  r.post('/v1/auth/siws/nonce', { schema: nonceSchema, config: authLimit(ctx) }, issueNonce);

  r.post(
    '/v1/auth/siws/verify',
    {
      config: authLimit(ctx),
      schema: {
        tags: ['Auth'],
        summary: 'Verify a signature and sign in',
        description:
          'Body is the wallet `SolanaSignInOutput` encoded for JSON: `signedMessage` base64, `signature` base58. ' +
          'The signed text must match the issued input field-for-field. On success the `wl_session` cookie is set ' +
          '(HttpOnly, Secure, SameSite=Lax, Domain=.windle.fun) and the session + profile are returned. ' +
          'A first sign-in creates the account. Any session already on the request is replaced.',
        body: SiwsVerifyRequest,
        response: { 200: SiwsVerifyResponse, ...errors },
      },
    },
    async (request, reply) => {
      requireProvider(ctx, 'siws');
      const body = request.body;
      const fail = (status: number, code: ApiErrorCode, message: string) => {
        ctx.metrics.authEvents.inc({ event: 'siws_verify', result: code });
        request.log.info({ address: body.address, code }, 'siws verify rejected');
        return new HttpError(status, code, message);
      };

      // 1. Cheap, local checks first; the nonce is only spent on a well-formed attempt.
      const decoded = decodeSignedMessage(body.signedMessage);
      if (!decoded.ok) throw fail(400, decoded.failure.code, decoded.failure.message);
      if (decoded.fields.nonce !== body.nonce)
        throw fail(400, 'siws_message_mismatch', 'signed nonce differs from body');
      if (decoded.fields.address !== body.address)
        throw fail(400, 'siws_message_mismatch', 'signed address differs from body');

      // 2. Single use: GETDEL. A replay (or a concurrent duplicate) finds nothing.
      const issued = await dep('redis', () => ctx.store.takeNonce(body.nonce));
      if (!issued) throw fail(400, 'nonce_invalid', 'Nonce is unknown, expired or already used');

      // 3. What was signed must be exactly what was issued, and still inside its validity window.
      const mismatch = checkMessageAgainstIssued(decoded.fields, issued, body.address, ctx.now());
      if (mismatch) throw fail(400, mismatch.code, mismatch.message);

      // 4. ed25519 over the exact bytes.
      if (!verifySignature(decoded.bytes, body.signature, body.address))
        throw fail(401, 'signature_invalid', 'Signature does not verify for this address');

      // 5. Account + session. Audit row first: a session that cannot be audited is not created.
      const now = ctx.now();
      const { userId, created } = await dep('postgres', () => ctx.repo.upsertWalletUser(body.address, now));
      await revokeCurrent(request, reply, ctx, 'replaced');

      const token = newSessionToken();
      const hash = sha256Hex(token);
      const ttl = ctx.config.session.ttlSeconds;
      const expiresAt = new Date(now.getTime() + ttl * 1000);
      await dep('postgres', () =>
        ctx.repo.recordSessionCreated({
          sessionHash: hash,
          userId,
          method: 'siws',
          walletAddress: body.address,
          ip: request.clientIp,
          userAgent: request.headers['user-agent'] ?? null,
          createdAt: now,
          expiresAt,
        }),
      );
      const record: SessionRecord = { userId, address: body.address, method: 'siws', createdAt: now.getTime() };
      await dep('redis', () => ctx.store.putSession(hash, record, ttl));
      setSessionCookie(reply, ctx, token, ttl);

      const me = await dep('postgres', () => ctx.repo.getMe(userId));
      if (!me) throw new HttpError(503, 'service_unavailable', 'Account was not readable after sign-in');
      ctx.metrics.authEvents.inc({ event: 'siws_verify', result: 'ok' });
      request.log.info({ userId, address: body.address, newUser: created }, 'siws sign-in');
      return {
        session: { authenticated: true as const, userId, address: body.address, expiresAt: expiresAt.toISOString() },
        me,
      };
    },
  );

  r.get(
    '/v1/auth/session',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Get the current session',
        description:
          'Anonymous callers get `200` with `authenticated: false`, so apps can branch without error handling. ' +
          'An authenticated call renews the sliding expiry and the cookie.',
        security: [{}, { session: [] }],
        response: { 200: Session, 503: ApiError },
      },
    },
    async (request, reply) => {
      const { session, stale } = await readSession(request, ctx);
      if (!session) {
        if (stale) clearSessionCookie(reply, ctx);
        return { authenticated: false as const };
      }
      await renewSession(reply, ctx, session);
      return {
        authenticated: true as const,
        userId: session.record.userId,
        address: session.record.address,
        expiresAt: session.expiresAt.toISOString(),
      };
    },
  );

  r.post(
    '/v1/auth/logout',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Sign out',
        description:
          'Ends the current session and clears the cookie. Idempotent: calling it without a session is also `204`. ' +
          'Browsers must send an allow-listed `Origin`.',
        security: [{}, { session: [] }],
        response: { 204: z.null().describe('Session ended; cookie cleared'), 403: ApiError, 503: ApiError },
      },
    },
    async (request, reply) => {
      await revokeCurrent(request, reply, ctx, 'logout');
      clearSessionCookie(reply, ctx);
      return reply.code(204).send(null);
    },
  );

  r.get(
    '/v1/me',
    {
      schema: {
        tags: ['Account'],
        summary: 'Get the signed-in user',
        description:
          'The account behind the session cookie and its linked wallets. `401 unauthenticated` without a session.',
        security: [{ session: [] }],
        response: { 200: Me, 401: ApiError, 503: ApiError },
      },
    },
    async (request, reply) => {
      const { session, stale } = await readSession(request, ctx);
      if (!session) {
        if (stale) clearSessionCookie(reply, ctx);
        throw new HttpError(401, 'unauthenticated', 'Sign in first');
      }
      const me = await dep('postgres', () => ctx.repo.getMe(session.record.userId));
      if (!me) {
        // The account was deleted under a live session: end it.
        await dep('redis', () => ctx.store.deleteSession(session.hash));
        clearSessionCookie(reply, ctx);
        throw new HttpError(401, 'unauthenticated', 'Sign in first');
      }
      await renewSession(reply, ctx, session);
      return me;
    },
  );

  // Providers that exist as config flags only. Disabled: 501 provider_disabled. Enabled (credentials present) but
  // not built yet: 501 not_implemented, so switching a flag on never silently half-works.
  const pending: Array<{ provider: AuthProvider; method: 'GET' | 'POST'; url: string }> = [
    { provider: 'email', method: 'POST', url: '/v1/auth/email/start' },
    { provider: 'email', method: 'GET', url: '/v1/auth/email/callback' },
    { provider: 'x', method: 'GET', url: '/v1/auth/x/start' },
    { provider: 'x', method: 'GET', url: '/v1/auth/x/callback' },
    { provider: 'google', method: 'GET', url: '/v1/auth/google/start' },
    { provider: 'google', method: 'GET', url: '/v1/auth/google/callback' },
    { provider: 'telegram', method: 'GET', url: '/v1/auth/telegram/start' },
    { provider: 'telegram', method: 'GET', url: '/v1/auth/telegram/callback' },
    { provider: 'discord', method: 'GET', url: '/v1/auth/discord/start' },
    { provider: 'discord', method: 'GET', url: '/v1/auth/discord/callback' },
  ];
  for (const { provider, method, url } of pending) {
    r.route({
      method,
      url,
      config: authLimit(ctx),
      schema: {
        // Live and tested, but kept out of the public OpenAPI document / reference until the provider ships.
        hide: true,
        tags: ['Auth'],
        summary: `Sign in with ${PROVIDER_NAMES[provider]} (not enabled yet)`,
        description:
          `Reserved for ${PROVIDER_NAMES[provider]} sign-in. Answers \`501 provider_disabled\` while the method is off, ` +
          'and `501 not_implemented` if it is switched on before it ships.',
        response: { 501: ApiError.describe('Not available yet.') },
      },
      handler: async () => {
        requireProvider(ctx, provider);
        throw new HttpError(501, 'not_implemented', `Sign-in with ${provider} is not implemented yet`);
      },
    });
  }
}

/** Deletes the session behind the request cookie, if any, and closes its audit row. Audit failure is logged only. */
async function revokeCurrent(
  request: FastifyRequest,
  reply: FastifyReply,
  ctx: AppContext,
  reason: 'logout' | 'replaced',
) {
  const { session, stale } = await readSession(request, ctx);
  if (stale) clearSessionCookie(reply, ctx);
  if (!session) return;
  await dep('redis', () => ctx.store.deleteSession(session.hash));
  try {
    await ctx.repo.recordSessionRevoked(session.hash, ctx.now(), reason);
  } catch (err) {
    request.log.error({ err }, 'session audit (revoke) failed');
  }
  ctx.metrics.authEvents.inc({ event: 'session_revoked', result: reason });
}
