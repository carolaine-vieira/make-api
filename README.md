# gp-make-api

A toolkit of small, stateless JSON endpoints meant to be called from **Make** automations (HTTP > *Make a request*) to parse, format or transform data that Make's built-in modules can't handle. Built for Vercel serverless functions with TypeScript, with no framework.

## Quick start

```bash
npm install
npm run dev        # local server on http://localhost:3000 (PORT to change)
```

Open **http://localhost:3000/docs** for Swagger UI and try the endpoints there (dev server only).

| Script              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run dev`       | Local server (`dev-server.ts`), no Vercel login needed    |
| `npm run new`       | Scaffolds a new endpoint (see below)                      |
| `npm run typecheck` | `tsc --noEmit`                                            |
| `npm test`          | Unit tests (`node:test`, no network or credentials needed) |
| `npm start`         | `vercel dev` (requires logging in and linking a project)  |

## Endpoints

| Method | Path                                  | Description                                  |
| ------ | ------------------------------------- | -------------------------------------------- |
| GET    | `/api`                                | Health check                                 |
| POST   | `/api/formatters/currency-to-extenso` | Converts a BRL amount to words (pt-BR)       |
| POST   | `/api/receipts/vr-receipt`            | Generates a VR receipt PDF (needs `x-api-key`) |

Example:

```bash
curl -X POST localhost:3000/api/formatters/currency-to-extenso \
  -H 'Content-Type: application/json' -d '{"value":"1.234,56"}'
```

### Response format

```json
{ "success": true,  "data": { "...": "..." } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

| Status | Code                | When                                  |
| ------ | ------------------- | ------------------------------------- |
| 400    | `INVALID_BODY`      | Body is missing or not a JSON object  |
| 405    | `METHOD_NOT_ALLOWED`| Wrong HTTP method                     |
| 422    | `VALIDATION_ERROR`  | Service threw `ValidationError`       |
| 500    | `INTERNAL_ERROR`    | Anything unexpected                   |

## Project structure

```
api/                              Routes. One file per endpoint, re-exports a controller.
features/<feature>/<endpoint>/
  <endpoint>.controller.ts        HTTP side: method, docs, calls the service
  <endpoint>.service.ts           Business logic only, no HTTP knowledge
  <endpoint>.types.ts             Request and result types
shared/
  define-endpoint.ts              Wrapper: method check, body check, error mapping, response shape
  response.ts                     sendSuccess / sendError / allowMethods
  errors.ts                       ValidationError
scripts/new-endpoint.ts           Endpoint generator
dev-server.ts                     Local server + Swagger UI + OpenAPI generation
```

## Adding an endpoint

```bash
npm run new -- <feature>/<name> [METHOD]
# e.g. npm run new -- formatters/cpf-mask POST
```

This creates the route, controller, service and types files (existing files are never overwritten). Then:

1. Fill in the request/result types.
2. Implement the service function. Throw `ValidationError` for bad input.
3. Set `summary`, `description` and `example` in the controller. They feed Swagger.

A controller looks like this:

```ts
export const currencyToExtensoController = defineEndpoint({
  method: 'POST',
  summary: 'Convert a BRL amount to words',
  example: { value: '1.234,56' },
  handle: (body: CurrencyToExtensoRequest) => currencyToExtenso(body),
});
```

## VR receipt (`POST /api/receipts/vr-receipt`)

Renders a "RECIBO" PDF for a meal voucher payment and returns the PDF bytes. It does not save anything: in Make, use the HTTP module's output (**Data**, with *Parse response* off) in a Google Drive > *Upload a File* module. Nothing is stored or logged on the server (no payloads, names or CPFs). This endpoint does **not** use the `{ success, data }` envelope.

Body: `name`, `cpf`, `unitValue`, `quantity`, `totalValue`, `totalInWords` (required); `referenceMonth`, `issueDate` (`YYYY-MM-DD`), `observation`, `fileName` (optional). Numbers may be sent as strings with a dot (`"31.43"`). Header: `x-api-key` must match the `RECEIPT_API_KEY` env var (set it in `.env` locally and in the Vercel project settings).

| Status | Body                                                        |
| ------ | ----------------------------------------------------------- |
| 200    | PDF bytes (`application/pdf`). Suggested file name in `Content-Disposition`, default `Recibo VR - {name} - {month} {year}.pdf` |
| 400    | `{ error, details? }` field-level messages (never the CPF)  |
| 401    | Missing or invalid API key                                  |
| 405    | Not POST                                                    |
| 500    | `{ error: "server_error" }` (also when `RECEIPT_API_KEY` is not set) |

```bash
RECEIPT_API_KEY=dev npm run dev   # in another terminal
curl -X POST "http://localhost:3000/api/receipts/vr-receipt" -H "Content-Type: application/json" -H "x-api-key: $RECEIPT_API_KEY" -d '{"name":"Maria Souza","cpf":"000.000.000-00","unitValue":31.43,"quantity":13,"totalValue":408.59,"totalInWords":"quatrocentos e oito reais e cinquenta e nove centavos","referenceMonth":"Agosto","issueDate":"2026-08-01"}' --output recibo.pdf
```

The fonts and logo in `assets/` are bundled into the function through `vercel.json`.

## Swagger / OpenAPI

The spec is generated at request time from the `api/` folder and each controller's `summary`, `description` and `example`. There is no spec file to maintain. It is served only by the local dev server (`/docs`, `/openapi.json`), not on Vercel. Swagger UI loads from a CDN, so it needs internet access.

## Using it from Make

Use **HTTP > Make a request**: method POST, body type *Raw*, content type *JSON*, *Parse response* on, and *Evaluate all states as errors* on. Map fields from `data.*` in later modules. Make can only reach a public HTTPS URL, so deploy to Vercel (or tunnel `npm run dev` with ngrok/cloudflared while testing).

## Conventions for new endpoints

- Prefer POST with a JSON body, even for simple lookups.
- Keep responses flat and use simple values so they're easy to map in Make.
- Accept arrays where batching saves Make operations.
- Keep calls fast and stateless (Vercel free tier limits functions to about 10 seconds).

## Not done yet

- **Authentication:** only `vr-receipt` checks an API key. The other endpoints are open.
- **Tests:** only the VR receipt feature has tests so far.
- **Swagger on Vercel:** dev server only.
- **Schema validation:** services validate their own input. There are no per-field schemas in the OpenAPI spec.
- **Versioned paths** (`/api/v1/...`) are not in place.
