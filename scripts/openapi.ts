// Builds the OpenAPI spec and Swagger UI page from the files in api/ (shared by dev server and docs generator).
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

type Meta = { methods: string[]; summary?: string; description?: string; example?: Record<string, unknown> | unknown[] };
type Handler = (req: unknown, res: unknown) => void | Promise<void>;

export function collectRoutes(dir: string, apiDir = dir): Map<string, string> {
  const routes = new Map<string, string>();
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      for (const [k, v] of collectRoutes(full, apiDir)) routes.set(k, v);
    } else if (entry.endsWith('.ts')) {
      let route = '/' + relative(apiDir, full).split(sep).join('/').replace(/\.ts$/, '');
      route = route.replace(/\/index$/, '') || '/';
      routes.set(route, full);
      if (route !== '/') routes.set('/api' + route, full);
      else routes.set('/api', full);
    }
  }
  return routes;
}

export async function buildOpenApi(apiDir: string): Promise<unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [route, file] of collectRoutes(apiDir)) {
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
            content: { 'application/json': { schema: { type: Array.isArray(meta.example) ? 'array' : 'object', example: meta.example ?? {} } } },
          },
        }),
        ...(!hasBody && meta.example && !Array.isArray(meta.example) && {
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

export const SWAGGER_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>gp-make-api docs</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css"></head>
<body><div id="ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: '/openapi.json', dom_id: '#ui', tryItOutEnabled: true });</script>
</body></html>`;
