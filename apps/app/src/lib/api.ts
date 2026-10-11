import { Me, Session } from '@windle/shared';
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

async function request(
  fetchImpl: typeof fetch,
  baseUrl: string,
  path: string,
  init: RequestInit,
): Promise<{ res: Response; body: unknown }> {
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: { accept: 'application/json' },
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
  return { res, body };
}

export interface Api {
  getSession(signal?: AbortSignal): Promise<Session>;
  getMe(signal?: AbortSignal): Promise<Me>;
  logout(): Promise<void>;
}

/** Typed client. Every JSON response is validated against the @windle/shared schema before it reaches a component. */
export function createApi(baseUrl: string = API_URL, fetchImpl: typeof fetch = (...args) => fetch(...args)): Api {
  const get = async <T>(path: string, parser: Parser<T>, signal?: AbortSignal): Promise<T> => {
    const { res, body } = await request(fetchImpl, baseUrl, path, signal ? { signal } : {});
    const parsed = parser.safeParse(body);
    if (!parsed.success) throw new ApiRequestError('schema', 'The API answered with an unexpected shape.', res.status);
    return parsed.data;
  };
  return {
    getSession: (signal) => get('/v1/auth/session', Session, signal),
    getMe: (signal) => get('/v1/me', Me, signal),
    // Logout's body is not part of the contract: any 2xx means the session is gone.
    logout: async () => {
      await request(fetchImpl, baseUrl, '/v1/auth/logout', { method: 'POST' });
    },
  };
}

export const api = createApi();
