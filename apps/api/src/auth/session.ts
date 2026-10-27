import { SESSION_COOKIE } from '@windle/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../context.ts';
import { dep, HttpError } from '../errors.ts';
import { sha256Hex } from '../lib/crypto.ts';
import type { SessionRecord } from '../store/types.ts';

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export interface ActiveSession {
  token: string;
  hash: string;
  record: SessionRecord;
  /** Seconds the session lives from now if renewed: min(sliding TTL, time left before the absolute cap). */
  ttlSeconds: number;
  expiresAt: Date;
}

function cookieOptions(ctx: AppContext) {
  return {
    path: '/',
    httpOnly: true,
    secure: ctx.config.cookie.secure,
    sameSite: 'lax' as const,
    ...(ctx.config.cookie.domain ? { domain: ctx.config.cookie.domain } : {}),
  };
}

export function setSessionCookie(reply: FastifyReply, ctx: AppContext, token: string, maxAgeSeconds: number) {
  reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions(ctx), maxAge: maxAgeSeconds });
}

export function clearSessionCookie(reply: FastifyReply, ctx: AppContext) {
  reply.clearCookie(SESSION_COOKIE, cookieOptions(ctx));
}

export function remainingTtl(ctx: AppContext, record: SessionRecord): number {
  const absoluteEnd = record.createdAt + ctx.config.session.absoluteTtlSeconds * 1000;
  const left = Math.floor((absoluteEnd - ctx.now().getTime()) / 1000);
  return Math.min(ctx.config.session.ttlSeconds, left);
}

/**
 * Resolves the cookie to a live session. A cookie that does not resolve (unknown, expired, malformed) is reported
 * through `stale` so the caller can clear it.
 */
export async function readSession(
  request: FastifyRequest,
  ctx: AppContext,
): Promise<{ session: ActiveSession | null; stale: boolean }> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return { session: null, stale: false };
  if (!TOKEN_SHAPE.test(token)) return { session: null, stale: true };

  const hash = sha256Hex(token);
  const record = await dep('redis', () => ctx.store.getSession(hash));
  if (!record) return { session: null, stale: true };

  const ttlSeconds = remainingTtl(ctx, record);
  if (ttlSeconds <= 0) {
    await dep('redis', () => ctx.store.deleteSession(hash));
    return { session: null, stale: true };
  }
  return {
    session: { token, hash, record, ttlSeconds, expiresAt: new Date(ctx.now().getTime() + ttlSeconds * 1000) },
    stale: false,
  };
}

/** The live session or `401 unauthenticated` (a stale cookie is cleared on the way). */
export async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
  ctx: AppContext,
): Promise<ActiveSession> {
  const { session, stale } = await readSession(request, ctx);
  if (session) return session;
  if (stale) clearSessionCookie(reply, ctx);
  throw new HttpError(401, 'unauthenticated', 'Sign in first');
}

/** Sliding expiry: every authenticated read pushes Redis TTL and cookie Max-Age forward (capped by the absolute TTL). */
export async function renewSession(reply: FastifyReply, ctx: AppContext, session: ActiveSession) {
  await dep('redis', () => ctx.store.touchSession(session.hash, session.ttlSeconds));
  setSessionCookie(reply, ctx, session.token, session.ttlSeconds);
}
