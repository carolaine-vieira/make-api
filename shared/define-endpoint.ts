import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ValidationError } from './errors.js';
import { allowMethods, sendError, sendSuccess } from './response.js';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Docs shown in Swagger UI (dev server: /docs). */
export interface EndpointDocs {
  summary?: string;
  description?: string;
  /** Example JSON body (POST/PUT/PATCH) or query object (GET/DELETE). */
  example?: Record<string, unknown>;
}

export interface EndpointMeta extends EndpointDocs {
  methods: readonly Method[];
}

interface EndpointOptions<TOut> extends EndpointDocs {
  method: Method | readonly Method[];
  /**
   * Receives the JSON body (POST/PUT/PATCH) or the query string (GET/DELETE).
   * Return the data to send back; throw ValidationError for bad input.
   */
  handle: (input: any, req: VercelRequest) => TOut | Promise<TOut>;
}

/**
 * Wraps a handler with method check, body check, error mapping and the standard
 * response shape, so each file in api/ only contains what is specific to it.
 */
export function defineEndpoint<TOut>({ method, handle, ...docs }: EndpointOptions<TOut>) {
  const methods = Array.isArray(method) ? method : [method];
  const handler = async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    if (!allowMethods(req, res, methods)) return;

    const hasBody = req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH';
    const input: unknown = hasBody ? req.body : req.query;
    if (hasBody && (typeof input !== 'object' || input === null)) {
      sendError(res, 400, 'INVALID_BODY', 'Send a JSON body with Content-Type: application/json.');
      return;
    }

    try {
      sendSuccess(res, await handle(input, req));
    } catch (err) {
      if (err instanceof ValidationError) {
        sendError(res, 422, 'VALIDATION_ERROR', err.message);
        return;
      }
      console.error(err);
      sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected error.');
    }
  };
  return Object.assign(handler, { meta: { methods, ...docs } satisfies EndpointMeta });
}
