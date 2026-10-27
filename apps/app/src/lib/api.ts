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
  readonly details: Readonly<Record<string, string>>;

  constructor(
    kind: 'network' | 'http' | 'schema',
    message: string,
    status: number | null = null,
    code: string | null = null,
    details: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT';
  json?: unknown;
  signal?: AbortSignal;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function stringRecord(v: unknown): Record<string, string> {
  if (!isRecord(v)) return {};
  return Object.fromEntries(Object.entries(v).flatMap(([k, x]) => (typeof x === 'string' ? [[k, x]] : [])));
}

async function request(
  fetchImpl: typeof fetch,
  baseUrl: string,
  path: string,
  { method = 'GET', json, signal }: RequestOptions,
): Promise<{ res: Response; body: unknown }> {
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      credentials: 'include',
      headers:
        json === undefined
          ? { accept: 'application/json' }
          : { accept: 'application/json', 'content-type': 'application/json' },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiRequestError('network', 'Could not reach the windle API.');
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = isRecord(body) ? body.error : null;
    const message = isRecord(err) && 'message' in err ? String(err.message) : res.statusText;
    const code = isRecord(err) && 'code' in err ? String(err.code) : null;
    const details = isRecord(err) ? stringRecord(err.details) : {};
    throw new ApiRequestError('http', message || `HTTP ${res.status}`, res.status, code, details);
  }
  return { res, body };
}

export interface Http {
  get<T>(path: string, parser: Parser<T>, signal?: AbortSignal): Promise<T>;
  post<T>(path: string, json: unknown, parser: Parser<T>): Promise<T>;
  put<T>(path: string, json: unknown, parser: Parser<T>): Promise<T>;
}

/** JSON over fetch with the session cookie. Every 2xx body is validated against its @windle/shared schema. */
export function createHttp(baseUrl: string = API_URL, fetchImpl: typeof fetch = (...args) => fetch(...args)): Http {
  const parse = <T>(parser: Parser<T>, res: Response, body: unknown): T => {
    const parsed = parser.safeParse(body);
    if (!parsed.success) throw new ApiRequestError('schema', 'The API answered with an unexpected shape.', res.status);
    return parsed.data;
  };
  return {
    async get(path, parser, signal) {
      const { res, body } = await request(fetchImpl, baseUrl, path, signal ? { signal } : {});
      return parse(parser, res, body);
    },
    async post(path, json, parser) {
      const { res, body } = await request(fetchImpl, baseUrl, path, { method: 'POST', json });
      return parse(parser, res, body);
    },
    async put(path, json, parser) {
      const { res, body } = await request(fetchImpl, baseUrl, path, { method: 'PUT', json });
      return parse(parser, res, body);
    },
  };
}

export const http = createHttp();

export interface Api {
  getSession(signal?: AbortSignal): Promise<Session>;
  getMe(signal?: AbortSignal): Promise<Me>;
  logout(): Promise<void>;
}

export function createApi(baseUrl: string = API_URL, fetchImpl: typeof fetch = (...args) => fetch(...args)): Api {
  const client = createHttp(baseUrl, fetchImpl);
  return {
    getSession: (signal) => client.get('/v1/auth/session', Session, signal),
    getMe: (signal) => client.get('/v1/me', Me, signal),
    // Logout's body is not part of the contract: any 2xx means the session is gone.
    logout: async () => {
      await request(fetchImpl, baseUrl, '/v1/auth/logout', { method: 'POST' });
    },
  };
}

export const api = createApi();
