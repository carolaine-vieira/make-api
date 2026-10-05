import type { VercelResponse } from '@vercel/node';

export interface SuccessBody<T> {
  success: true;
  data: T;
}

export interface ErrorBody {
  success: false;
  error: { code: string; message: string };
}

export function sendSuccess<T>(res: VercelResponse, data: T, status = 200): void {
  res.status(status).json({ success: true, data } satisfies SuccessBody<T>);
}

export function sendError(res: VercelResponse, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, error: { code, message } } satisfies ErrorBody);
}

/** Replies 405 and returns false when the request method is not allowed. */
export function allowMethods(
  req: { method?: string },
  res: VercelResponse,
  methods: readonly string[],
): boolean {
  if (req.method && methods.includes(req.method)) return true;
  res.setHeader('Allow', methods.join(', '));
  sendError(res, 405, 'METHOD_NOT_ALLOWED', `Use ${methods.join(' or ')}.`);
  return false;
}
