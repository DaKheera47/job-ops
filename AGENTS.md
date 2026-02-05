# Error/Logging/Sanitization Standards

This project uses strict operability and privacy defaults for server-side code.

## API Response Contract

For all `/api/*` routes, return:

- Success: `{ ok: true, data, meta?: { requestId } }`
- Error: `{ ok: false, error: { code, message, details? }, meta: { requestId } }`

Use consistent status/code mapping:

- `400 INVALID_REQUEST`
- `401 UNAUTHORIZED`
- `403 FORBIDDEN`
- `404 NOT_FOUND`
- `408 REQUEST_TIMEOUT`
- `409 CONFLICT`
- `422 UNPROCESSABLE_ENTITY`
- `500 INTERNAL_ERROR`
- `502 UPSTREAM_ERROR`
- `503 SERVICE_UNAVAILABLE`

## Correlation IDs

- Honor inbound `x-request-id` when present; otherwise generate one.
- Always return `x-request-id` header.
- Include request ID in API responses (`meta.requestId`) and logs.
- Propagate context into async flows (especially pipeline run and per-job work) so logs include `pipelineRunId` / `jobId` when available.

## Logging Rules

- Use the shared logger wrapper (`infra/logger.ts`) in core server paths.
- Do not add direct `console.log`, `console.warn`, or `console.error` in core paths.
- Log structured objects, not free-form dumps.
- Include useful context fields (e.g. `requestId`, `pipelineRunId`, `jobId`, `route`, `status`).

## Redaction and Sanitization

- Always sanitize objects before logging or returning in error `details`.
- Redact sensitive keys by default (`authorization`, `cookie`, `password`, `secret`, `token`, `apiKey`, etc.).
- Truncate large payloads and long strings.
- Do not throw/log raw upstream response bodies, full webhook bodies, or large `JSON.stringify(...)` blobs.

## Webhook and LLM Payload Defaults

- Webhooks: send minimal whitelisted payloads by default.
- LLM prompts: send only required profile/job fields; avoid unnecessary PII.
- Document external payload behavior when adding new integrations.

## PR Checklist (Routes/Services)

- API responses follow `{ ok, data/error, meta.requestId }`.
- Status/code mapping is correct and consistent.
- Request/correlation IDs appear in logs and async workflows.
- No raw sensitive payload logging or raw upstream body throws.
- New/changed webhook or LLM payloads are sanitized and documented.
