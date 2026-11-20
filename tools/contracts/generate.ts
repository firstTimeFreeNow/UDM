import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const root = new URL('../../', import.meta.url);
const specUrl = new URL('packages/contracts/openapi.json', root);
const spec = JSON.parse(await readFile(specUrl, 'utf8'));
const generated = new URL('packages/contracts/generated/', root);
await mkdir(generated, { recursive: true });
await writeFile(new URL('api.ts', generated), astToString(await openapiTS(specUrl)));
const operations = Object.entries(spec.paths).flatMap(([path, methods]) =>
  Object.entries(methods).map(([method, operation]: [string, any]) => ({
    method: method.toUpperCase(), path, operationId: operation.operationId,
    action: operation['x-udm-action'] ?? null, view: operation['x-udm-view'] ?? null,
  })),
);
await writeFile(new URL('operations.ts', generated), `// Generated from openapi.json; do not edit.\nexport const operations = ${JSON.stringify(operations, null, 2)} as const;\n`);
console.log(`Generated API types and operations from ${fileURLToPath(specUrl)}`);
