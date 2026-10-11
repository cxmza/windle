import { AuthProviders, Session, SiwsNonce, type SiwsVerifyRequest, SiwsVerifyResponse } from '@windle/shared';
import { API_URL } from '@/lib/env';

/** Anything with zod's `safeParse` shape; keeps zod itself out of this app's direct dependencies. */
interface Parser<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

/**
 * How a request failed:
 *  - network: no response at all (offline, DNS, CORS, api down)
 *  - http: non-2xx (status + the api's `{error:{code,message}}` when present)
 *  - schema: 2xx but the body is not the agreed contract
 */
export class ApiRequestError extends Error {
  readonly kind: 'network' | 'http' | 'schema';
  readonly status: number | null;
  readonly code: string | null;

  constructor(
    kind: 'network' | 'http' | 'schema',
    message: string,
    status: number | null = null,
    code: string | null = null,
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  path: string,
  parser: Parser<T> | null,
  init: RequestInit = {},
): Promise<T | null> {
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}) },
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiRequestError('network', 'Could not reach the windle API.');
  }

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = typeof body === 'object' && body !== null && 'error' in body ? body.error : null;
    const message = typeof err === 'object' && err !== null && 'message' in err ? String(err.message) : res.statusText;
    const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : null;
    throw new ApiRequestError('http', message || `HTTP ${res.status}`, res.status, code);
  }
  if (!parser) return null;
  const parsed = parser.safeParse(body);
  if (!parsed.success) throw new ApiRequestError('schema', 'The API answered with an unexpected shape.', res.status);
  return parsed.data;
}

export interface AuthApi {
  getNonce(signal?: AbortSignal): Promise<SiwsNonce>;
  verify(body: SiwsVerifyRequest): Promise<SiwsVerifyResponse>;
  getSession(signal?: AbortSignal): Promise<Session>;
  getProviders(signal?: AbortSignal): Promise<AuthProviders>;
  logout(): Promise<void>;
}

/** Typed client for the auth endpoints. `fetchImpl` is resolved per call so tests can stub `globalThis.fetch`. */
export function createAuthApi(
  baseUrl: string = API_URL,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): AuthApi {
  const call = async <T>(path: string, parser: Parser<T>, init?: RequestInit): Promise<T> => {
    const data = await request(fetchImpl, baseUrl, path, parser, init);
    if (data === null) throw new ApiRequestError('schema', 'Empty response.');
    return data;
  };
  return {
    getNonce: (signal) => call('/v1/auth/siws/nonce', SiwsNonce, signal ? { signal } : undefined),
    verify: (body) => call('/v1/auth/siws/verify', SiwsVerifyResponse, { method: 'POST', body: JSON.stringify(body) }),
    getSession: (signal) => call('/v1/auth/session', Session, signal ? { signal } : undefined),
    getProviders: (signal) => call('/v1/auth/providers', AuthProviders, signal ? { signal } : undefined),
    logout: async () => {
      await request(fetchImpl, baseUrl, '/v1/auth/logout', null, { method: 'POST' });
    },
  };
}

export const authApi = createAuthApi();
