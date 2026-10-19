# Explicit settings ownership

Settings definitions remain in TypeScript. Each persisted key declares one owner scope (`platform`, `tenant`, or `user`) and a write policy (`systemAdmin`, `tenantOwner`, or `self`). Secrets remain masked in API responses. Hosted platform AI credentials remain deployment environment variables and are never copied into user settings.

Persist all values in one `settings` table. `(NULL, NULL)` identifies a platform value, `(tenantId, NULL)` a tenant value, and `(tenantId, userId)` a personal value. An expression index makes all three owner/key combinations unique despite SQLite's treatment of `NULL`; a check constraint rejects a user without a tenant. A policy-aware settings service selects the correct owner and authorizes writes from authenticated context. Reads and background work use the same owner rules. The Settings UI receives server-derived edit capabilities and submits only authorized fields. Hosted included-AI policy continues to block personal LLM changes.

Migrate existing `settings` rows once. Personal keys retain their recorded `(tenant_id, user_id)`, resolving null user IDs from tenant ownership. Platform keys collapse to one authoritative `(NULL, NULL)` row. Conflicting values use a deterministic choice; a database-only audit retains every candidate owner and value for recovery, including sensitive values, and is never returned in API responses or logs. The old deployment environment key remains outside database migration.

Verify a populated database produced by the old server, including all registry keys, through migration and post-upgrade API/runtime checks. Add automated migration, authorization, scope isolation, and UI tests. Run required CI checks under Node 22.
