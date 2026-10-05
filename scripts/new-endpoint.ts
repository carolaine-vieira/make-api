// Usage: npm run new -- <feature>/<name> [METHOD]   e.g. npm run new -- formatters/cpf-mask POST
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const [target, method = 'POST'] = process.argv.slice(2);
const [feature, name] = (target ?? '').split('/');
if (!feature || !name) {
  console.error('Usage: npm run new -- <feature>/<name> [GET|POST|PUT|PATCH|DELETE]');
  process.exit(1);
}

const camel = name.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
const pascal = camel[0]!.toUpperCase() + camel.slice(1);
const dir = `features/${feature}/${name}`;

function write(path: string, content: string): void {
  if (existsSync(path)) return console.log(`skip   ${path} (exists)`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  console.log(`create ${path}`);
}

write(
  `api/${feature}/${name}.ts`,
  `import { ${camel}Controller } from '../../${dir}/${name}.controller.js';

export default ${camel}Controller;
`,
);
write(
  `${dir}/${name}.controller.ts`,
  `import { defineEndpoint } from '../../../shared/define-endpoint.js';
import { ${camel} } from './${name}.service.js';
import type { ${pascal}Request } from './${name}.types.js';

export const ${camel}Controller = defineEndpoint({
  method: '${method.toUpperCase()}',
  summary: '${pascal}',
  example: {},
  handle: (input: ${pascal}Request) => ${camel}(input),
});
`,
);
write(
  `${dir}/${name}.service.ts`,
  `import type { ${pascal}Request, ${pascal}Result } from './${name}.types.js';

export function ${camel}(input: ${pascal}Request): ${pascal}Result {
  throw new Error('Not implemented');
}
`,
);
write(
  `${dir}/${name}.types.ts`,
  `export interface ${pascal}Request {}

export interface ${pascal}Result {}

export { ValidationError } from '../../../shared/errors.js';
`,
);
