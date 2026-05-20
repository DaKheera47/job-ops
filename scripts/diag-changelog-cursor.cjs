// Read-only diagnostic: print the current telegramChangelogLastSentVersion
// from /app/data/jobs.db. Used to understand why the changelog send failed
// (the bot tries to bundle every unsent entry into ONE Telegram message,
// which overflows the 4096-char limit if the cursor is far behind).
const Database = require("/app/orchestrator/node_modules/better-sqlite3");
const db = new Database("/app/data/jobs.db", { readonly: true });
const rows = db
  .prepare(
    "SELECT key, value, tenant_id FROM settings WHERE key = 'telegramChangelogLastSentVersion'",
  )
  .all();
console.log(JSON.stringify(rows, null, 2));
db.close();
