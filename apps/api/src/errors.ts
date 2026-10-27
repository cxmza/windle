import type { ApiError, ApiErrorCode } from '@windle/shared';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';

/** Throw this from handlers/hooks; the error handler turns it into the shared ApiError envelope. */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly headers: Record<string, string> | undefined;
  readonly details: Record<string, string> | undefined;

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    headers?: Record<string, string>,
    details?: Record<string, string>,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.headers = headers;
    this.details = details;
  }
}

/** A backing service (Postgres/Redis) failed: 503 for the client, full error in the log. */
export class DependencyError extends Error {
  readonly dependency: string;

  constructor(dependency: string, cause: unknown) {
    super(`${dependency} unavailable`, { cause });
    this.dependency = dependency;
  }
}

/** Runs a store call and rethrows driver failures as DependencyError (so they map to 503, not 500). */
export async function dep<T>(dependency: 'postgres' | 'redis', fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new DependencyError(dependency, err);
  }
}

export function errorBody(
  request: FastifyRequest,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, string>,
): ApiError {
  return { error: { code, message, requestId: request.id, ...(details ? { details } : {}) } };
}

const FASTIFY_CODES: Record<string, [number, ApiErrorCode, string]> = {
  FST_ERR_CTP_INVALID_MEDIA_TYPE: [415, 'unsupported_media_type', 'Content-Type must be application/json'],
  FST_ERR_CTP_INVALID_CONTENT_LENGTH: [400, 'bad_request', 'Invalid Content-Length'],
  FST_ERR_CTP_BODY_TOO_LARGE: [413, 'payload_too_large', 'Request body is too large'],
  FST_ERR_CTP_EMPTY_JSON_BODY: [400, 'invalid_json', 'Body cannot be empty when Content-Type is application/json'],
  FST_ERR_CTP_INVALID_JSON_BODY: [400, 'invalid_json', 'Body is not valid JSON'],
};

export function registerErrorHandling(app: FastifyInstance, opts: { exposeInternalMessages: boolean }) {
  app.setErrorHandler((error: FastifyError | HttpError | DependencyError, request, reply: FastifyReply) => {
    if (error instanceof HttpError) {
      if (error.headers) reply.headers(error.headers);
      if (error.statusCode >= 500) request.log.error({ err: error }, error.message);
      return reply.code(error.statusCode).send(errorBody(request, error.code, error.message, error.details));
    }

    if (error instanceof DependencyError) {
      request.log.error({ err: error.cause, dependency: error.dependency }, error.message);
      reply.header('retry-after', '5');
      return reply
        .code(503)
        .send(errorBody(request, 'service_unavailable', 'A backing service is unavailable, retry shortly'));
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const first = error.validation[0];
      const where = first?.instancePath ? `${error.validationContext ?? 'request'}${first.instancePath}` : '';
      const message = `${where ? `${where}: ` : ''}${first?.message ?? 'invalid request'}`;
      return reply.code(400).send(errorBody(request, 'validation_failed', message));
    }

    if (isResponseSerializationError(error)) {
      request.log.error({ err: error }, 'response failed its own schema');
      return reply.code(500).send(errorBody(request, 'internal_error', 'Internal server error'));
    }

    const known = 'code' in error && typeof error.code === 'string' ? FASTIFY_CODES[error.code] : undefined;
    if (known) {
      const [status, code, message] = known;
      return reply.code(status).send(errorBody(request, code, message));
    }

    const status = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (status >= 400 && status < 500) {
      return reply
        .code(status)
        .send(errorBody(request, status === 405 ? 'method_not_allowed' : 'bad_request', error.message));
    }

    request.log.error({ err: error }, 'unhandled error');
    // Never leak internals (stack, driver messages) outside development.
    const message = opts.exposeInternalMessages ? error.message : 'Internal server error';
    return reply.code(500).send(errorBody(request, 'internal_error', message));
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send(errorBody(request, 'not_found', `${request.method} ${request.url.split('?')[0]} not found`)),
  );
}
