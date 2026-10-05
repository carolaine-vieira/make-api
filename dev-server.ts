// Local-only server to test api/ handlers without the Vercel CLI (no login/link needed).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const API_DIR = join(process.cwd(), 'api');
const PORT = Number(process.env.PORT ?? 3000);

type Meta = { methods: string[]; summary?: string; description?: string; example?: Record<string, unknown> };
type Handler = (req: unknown, res: unknown) => void | Promise<void>;

function collectRoutes(dir: string): Map<string, string> {
  const routes = new Map<string, string>();
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      for (const [k, v] of collectRoutes(full)) routes.set(k, v);
    } else if (entry.endsWith('.ts')) {
      let route = '/' + relative(API_DIR, full).split(sep).join('/').replace(/\.ts$/, '');
      route = route.replace(/\/index$/, '') || '/';
      routes.set(route, full);
      if (route !== '/') routes.set('/api' + route, full);
      else routes.set('/api', full);
    }
  }
  return routes;
}

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


async function buildOpenApi(): Promise<unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [route, file] of collectRoutes(API_DIR)) {
    if (!route.startsWith('/api')) continue;
    const mod = (await import(`${pathToFileURL(file).href}?t=${Date.now()}`)) as { default: Handler & { meta?: Meta } };
    const meta = mod.default.meta;
    if (!meta) continue;
    const tag = route.split('/')[2] ? route.split('/')[2]! : 'general';
    for (const method of meta.methods) {
      const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
      paths[route] ??= {};
      paths[route][method.toLowerCase()] = {
        tags: [route === '/api' ? 'general' : tag],
        summary: meta.summary ?? route,
        description: meta.description,
        ...(hasBody && {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', example: meta.example ?? {} } } },
          },
        }),
        ...(!hasBody && meta.example && {
          parameters: Object.entries(meta.example).map(([name, value]) => ({
            name, in: 'query', schema: { type: 'string' }, example: value,
          })),
        }),
        responses: {
          '200': { description: 'Success: { success: true, data }' },
          '4XX': { description: 'Error: { success: false, error: { code, message } }' },
        },
      };
    }
  }
  return { openapi: '3.0.3', info: { title: 'gp-make-api', version: '1.0.0' }, paths };
}

const SWAGGER_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>gp-make-api docs</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css"></head>
<body><div id="ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: '/openapi.json', dom_id: '#ui', tryItOutEnabled: true });</script>
</body></html>`;

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (url.pathname === '/docs') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(SWAGGER_HTML);
    return;
  }
  if (url.pathname === '/openapi.json') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(await buildOpenApi()));
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
