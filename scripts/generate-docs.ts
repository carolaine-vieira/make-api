// Writes static Swagger docs into public/ so Vercel serves /docs and /openapi.json. Runs as the build step.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildOpenApi, SWAGGER_HTML } from './openapi.js';

mkdirSync('public/docs', { recursive: true });
writeFileSync('public/openapi.json', JSON.stringify(await buildOpenApi(join(process.cwd(), 'api')), null, 2));
writeFileSync('public/docs/index.html', SWAGGER_HTML);
console.log('Generated public/openapi.json and public/docs/index.html');
