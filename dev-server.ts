// Local-only server to test api/ handlers without the Vercel CLI (no login/link needed).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildOpenApi, collectRoutes, SWAGGER_HTML } from './scripts/openapi.js';

const API_DIR = join(process.cwd(), 'api');
const PORT = Number(process.env.PORT ?? 3000);

type Handler = (req: unknown, res: unknown) => void | Promise<void>;

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

type Decorated = ServerResponse & { status(code: number): Decorated; json(body: unknown): Decorated };

function decorate(res: ServerResponse): Decorated {
  const r = res as Decorated;
  r.status = (code) => {
    r.statusCode = code;
    return r;
  };
  r.json = (body) => {
    r.setHeader('Content-Type', 'application/json');
    r.end(JSON.stringify(body));
    return r;
  };
  return r;
}


createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (url.pathname === '/docs') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(SWAGGER_HTML);
    return;
  }
  if (url.pathname === '/openapi.json') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(await buildOpenApi(API_DIR)));
    return;
  }
  const routes = collectRoutes(API_DIR); // rescanned per request so new files are picked up
  const file = routes.get(url.pathname.replace(/\/$/, '') || '/');
  if (!file) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'No such route.' } }));
    return;
  }
  const r = decorate(res);
  const body = await readBody(req);
  Object.assign(req, { body, query: Object.fromEntries(url.searchParams) });
  try {
    // Query string busts the ESM cache so edits are reloaded.
    const mod = (await import(`${pathToFileURL(file).href}?t=${Date.now()}`)) as { default: Handler };
    await mod.default(req, r);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) r.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: String(err) } });
  }
}).listen(PORT, () => {
  const color = process.stdout.isTTY && !process.env.NO_COLOR;
  const paint = (code: string) => (t: string) => (color ? `\x1b[${code}m${t}\x1b[0m` : t);
  const bold = paint('1');
  const dim = paint('2');
  const green = paint('32');
  const cyan = paint('36');

  const base = `http://localhost:${PORT}`;
  console.log(`\n  ${green('●')} ${bold('gp-make-api')} ${dim('local dev server')}\n`);
  console.log(`  ${dim('Local:')}  ${cyan(base)}`);
  console.log(`  ${dim('Docs: ')}  ${cyan(base)}${bold('/docs')}\n`);
  console.log(`  ${dim('Press Ctrl+C to stop')}\n`);
});
