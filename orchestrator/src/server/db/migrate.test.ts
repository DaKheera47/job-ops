import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "vitest";

describe.sequential("database migrations", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("boots when an older pipeline_runs table lacks config_snapshot", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-migrate-"));
    const script = `
      import { join } from "node:path";
      import { pathToFileURL } from "node:url";
      import Database from "better-sqlite3";

      const dbPath = join(process.env.DATA_DIR, "jobs.db");
      const sqlite = new Database(dbPath);
      sqlite.exec(\`
        CREATE TABLE pipeline_runs (
          id TEXT PRIMARY KEY,
          started_at TEXT NOT NULL DEFAULT (datetime('now')),
          completed_at TEXT,
          status TEXT NOT NULL DEFAULT 'running',
          jobs_discovered INTEGER NOT NULL DEFAULT 0,
          jobs_processed INTEGER NOT NULL DEFAULT 0,
          error_message TEXT
        );
      \`);
      sqlite.close();

      await import(pathToFileURL(join(process.cwd(), "src/server/db/migrate.ts")).href);

      const migratedDb = new Database(dbPath, { readonly: true });
      const columns = migratedDb.prepare("PRAGMA table_info(pipeline_runs)").all();
      if (!columns.some((column) => column.name === "config_snapshot")) {
        throw new Error("config_snapshot column missing after migration");
      }
      migratedDb.close();
    `;

    execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      {
        env: {
          ...process.env,
          DATA_DIR: tempDir,
        },
        stdio: "pipe",
      },
    );
  });

  it("creates tenant foreign keys for tenant-scoped core tables", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-migrate-"));
    const script = `
      import { join } from "node:path";
      import { pathToFileURL } from "node:url";
      import Database from "better-sqlite3";

      const dbPath = join(process.env.DATA_DIR, "jobs.db");
      await import(pathToFileURL(join(process.cwd(), "src/server/db/migrate.ts")).href);

      const migratedDb = new Database(dbPath, { readonly: true });

      function hasTenantCascade(tableName) {
        const fks = migratedDb.prepare(\`PRAGMA foreign_key_list(\${tableName})\`).all();
        return fks.some((fk) => fk.from === "tenant_id" && fk.table === "tenants" && String(fk.on_delete).toUpperCase() === "CASCADE");
      }

      const requiredTables = ["jobs", "pipeline_runs", "settings"];
      for (const tableName of requiredTables) {
        if (!hasTenantCascade(tableName)) {
          throw new Error(\`\${tableName} is missing tenant_id -> tenants(id) ON DELETE CASCADE\`);
        }
      }

      migratedDb.close();
    `;

    execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      {
        env: {
          ...process.env,
          DATA_DIR: tempDir,
        },
        stdio: "pipe",
      },
    );
  });

  it("marks only existing workspaces for legacy onboarding migration", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-migrate-"));
    const script = `
      import { join } from "node:path";
      import { pathToFileURL } from "node:url";
      import Database from "better-sqlite3";

      const dbPath = join(process.env.DATA_DIR, "jobs.db");
      const sqlite = new Database(dbPath);
      sqlite.exec(\`
        CREATE TABLE settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO settings(key, value) VALUES ('llmProvider', 'openrouter');
      \`);
      sqlite.close();

      await import(pathToFileURL(join(process.cwd(), "src/server/db/migrate.ts")).href);

      const migratedDb = new Database(dbPath, { readonly: true });
      const pending = migratedDb.prepare(
        "SELECT value FROM settings WHERE key = 'onboardingLegacyMigrationPending'",
      ).get();
      if (pending?.value !== "1") {
        throw new Error("Existing workspace was not marked for onboarding migration");
      }
      migratedDb.close();
    `;

    execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      {
        env: { ...process.env, DATA_DIR: tempDir },
        stdio: "pipe",
      },
    );
  });

  it("creates hosted usage tables with user-scoped foreign keys and indexes", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-migrate-"));
    const script = `
      import { join } from "node:path";
      import { pathToFileURL } from "node:url";
      import Database from "better-sqlite3";

      const dbPath = join(process.env.DATA_DIR, "jobs.db");
      await import(pathToFileURL(join(process.cwd(), "src/server/db/migrate.ts")).href);

      const migratedDb = new Database(dbPath, { readonly: true });

      function tableExists(tableName) {
        return Boolean(
          migratedDb
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
            .get(tableName),
        );
      }

      for (const tableName of ["account_subscriptions", "hosted_usage_counters", "hosted_usage_reservations"]) {
        if (!tableExists(tableName)) {
          throw new Error(\`\${tableName} was not created\`);
        }
        const fks = migratedDb.prepare(\`PRAGMA foreign_key_list(\${tableName})\`).all();
        const hasTenantCascade = fks.some((fk) => fk.from === "tenant_id" && fk.table === "tenants" && String(fk.on_delete).toUpperCase() === "CASCADE");
        const hasUserCascade = fks.some((fk) => fk.from === "user_id" && fk.table === "users" && String(fk.on_delete).toUpperCase() === "CASCADE");
        if (!hasTenantCascade || !hasUserCascade) {
          throw new Error(\`\${tableName} is missing hosted usage foreign keys\`);
        }
      }

      const counterIndexes = migratedDb.prepare("PRAGMA index_list(hosted_usage_counters)").all();
      const counterUnique = counterIndexes.find((index) => index.name === "idx_hosted_usage_counters_tenant_user_period_action_unique");
      if (!counterUnique || !counterUnique.unique) {
        throw new Error("hosted usage counter unique index missing");
      }

      const reservationIndexes = migratedDb.prepare("PRAGMA index_list(hosted_usage_reservations)").all();
      const reservationUnique = reservationIndexes.find((index) => index.name === "idx_hosted_usage_reservations_idempotency_unique");
      if (!reservationUnique || !reservationUnique.unique) {
        throw new Error("hosted usage reservation idempotency unique index missing");
      }

      migratedDb.close();
    `;

    execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      {
        env: {
          ...process.env,
          DATA_DIR: tempDir,
        },
        stdio: "pipe",
      },
    );
  });

  it("backfills legacy PDF rows as generated", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-migrate-"));
    const script = `
      import { join } from "node:path";
      import { pathToFileURL } from "node:url";
      import Database from "better-sqlite3";

      const dbPath = join(process.env.DATA_DIR, "jobs.db");
      const migrationUrl = pathToFileURL(join(process.cwd(), "src/server/db/migrate.ts")).href;
      await import(\`\${migrationUrl}?run=initial\`);

      const sqlite = new Database(dbPath);
      sqlite.prepare("INSERT INTO jobs(id, title, employer, job_url, pdf_path, pdf_source) VALUES (?, ?, ?, ?, ?, NULL)").run(
        "legacy-pdf-job",
        "Legacy PDF Job",
        "Acme",
        "https://example.com/legacy-pdf-job",
        "data/pdfs/resume_legacy-pdf-job.pdf",
      );
      sqlite.close();

      await import(\`\${migrationUrl}?run=backfill\`);

      const migratedDb = new Database(dbPath, { readonly: true });
      const row = migratedDb.prepare("SELECT pdf_source FROM jobs WHERE id = ?").get("legacy-pdf-job");
      if (row?.pdf_source !== "generated") {
        throw new Error(\`Expected legacy PDF source to be generated, got \${row?.pdf_source}\`);
      }
      migratedDb.close();
    `;

    execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      {
        env: {
          ...process.env,
          DATA_DIR: tempDir,
        },
        stdio: "pipe",
      },
    );
  });

  it("adds the tracer-link composite unique index to legacy tables", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-migrate-"));
    const script = `
      import { join } from "node:path";
      import { pathToFileURL } from "node:url";
      import Database from "better-sqlite3";

      const dbPath = join(process.env.DATA_DIR, "jobs.db");
      const sqlite = new Database(dbPath);
      sqlite.exec(\`
        CREATE TABLE tracer_links (
          id TEXT PRIMARY KEY,
          token TEXT NOT NULL UNIQUE,
          job_id TEXT NOT NULL,
          source_path TEXT NOT NULL,
          source_label TEXT NOT NULL,
          destination_url TEXT NOT NULL,
          destination_url_hash TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE tracer_click_events (
          id TEXT PRIMARY KEY,
          tracer_link_id TEXT NOT NULL,
          clicked_at INTEGER NOT NULL,
          is_likely_bot INTEGER NOT NULL DEFAULT 0,
          unique_fingerprint_hash TEXT
        );

        INSERT INTO tracer_links(
          id, token, job_id, source_path, source_label, destination_url,
          destination_url_hash, created_at, updated_at
        )
        VALUES
          ('link-1', 'acme-aa', 'job-1', 'basics.url.href', 'Portfolio', 'https://example.com', 'hash-1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
          ('link-2', 'acme-bb', 'job-1', 'basics.url.href', 'Portfolio', 'https://example.com', 'hash-1', '2026-01-02T00:00:00.000Z', '2026-01-02T00:00:00.000Z');

        INSERT INTO tracer_click_events(id, tracer_link_id, clicked_at)
        VALUES ('click-1', 'link-2', 1);
      \`);
      sqlite.close();

      await import(pathToFileURL(join(process.cwd(), "src/server/db/migrate.ts")).href);

      const migratedDb = new Database(dbPath, { readonly: true });
      const indexes = migratedDb.prepare("PRAGMA index_list(tracer_links)").all();
      const uniqueIndex = indexes.find((index) => index.name === "idx_tracer_links_tenant_user_job_source_destination_unique");
      if (!uniqueIndex || !uniqueIndex.unique) {
        throw new Error("tracer_links composite unique index missing after migration");
      }

      const linkCount = migratedDb.prepare("SELECT count(*) AS count FROM tracer_links").get();
      if (linkCount.count !== 1) {
        throw new Error(\`Expected duplicate tracer links to be merged, got \${linkCount.count}\`);
      }

      const click = migratedDb.prepare("SELECT tracer_link_id FROM tracer_click_events WHERE id = ?").get("click-1");
      if (click?.tracer_link_id !== "link-1") {
        throw new Error(\`Expected duplicate click to be reassigned to link-1, got \${click?.tracer_link_id}\`);
      }

      migratedDb.close();
    `;

    execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      {
        env: {
          ...process.env,
          DATA_DIR: tempDir,
        },
        stdio: "pipe",
      },
    );
  });

  it("enforces private unique indexes when user_id is null", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-migrate-"));
    const script = `
      import { join } from "node:path";
      import { pathToFileURL } from "node:url";
      import Database from "better-sqlite3";

      const dbPath = join(process.env.DATA_DIR, "jobs.db");
      await import(pathToFileURL(join(process.cwd(), "src/server/db/migrate.ts")).href);

      const migratedDb = new Database(dbPath);
      migratedDb.prepare("INSERT INTO jobs(id, tenant_id, user_id, title, employer, job_url) VALUES (?, ?, NULL, ?, ?, ?)").run(
        "job-null-owner-1",
        "tenant_default",
        "Role",
        "Acme",
        "https://example.com/null-owner",
      );

      let duplicateFailed = false;
      try {
        migratedDb.prepare("INSERT INTO jobs(id, tenant_id, user_id, title, employer, job_url) VALUES (?, ?, NULL, ?, ?, ?)").run(
          "job-null-owner-2",
          "tenant_default",
          "Role",
          "Acme",
          "https://example.com/null-owner",
        );
      } catch {
        duplicateFailed = true;
      }

      if (!duplicateFailed) {
        throw new Error("jobs unique index allowed duplicate NULL user_id rows");
      }

      migratedDb.close();
    `;

    execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      {
        env: {
          ...process.env,
          DATA_DIR: tempDir,
        },
        stdio: "pipe",
      },
    );
  });

  it("upgrades old settings into personal and platform storage without merging users", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-settings-upgrade-"));
    const script = `
      import { join } from "node:path";
      import { pathToFileURL } from "node:url";
      import Database from "better-sqlite3";

      const migrationUrl = pathToFileURL(join(process.cwd(), "src/server/db/migrate.ts")).href;
      await import(\`\${migrationUrl}?run=old\`);
      const dbPath = join(process.env.DATA_DIR, "jobs.db");
      const oldDb = new Database(dbPath);
      oldDb.exec(\`
        INSERT INTO tenants(id, name, slug) VALUES ('tenant-alt', 'Alt', 'alt');
        INSERT INTO users(id, username, password_hash, password_salt) VALUES
          ('user-a', 'a', 'hash', 'salt'),
          ('user-b', 'b', 'hash', 'salt'),
          ('user-c', 'c', 'hash', 'salt');
        INSERT INTO tenant_memberships(id, user_id, tenant_id, role) VALUES
          ('membership-a', 'user-a', 'tenant_default', 'owner'),
          ('membership-b', 'user-b', 'tenant_default', 'member'),
          ('membership-c', 'user-c', 'tenant-alt', 'owner');
        INSERT INTO settings(tenant_id, user_id, key, value) VALUES
          ('tenant_default', 'user-a', 'model', 'model-a'),
          ('tenant_default', 'user-b', 'model', 'model-b'),
          ('tenant-alt', 'user-c', 'model', 'model-c'),
          ('tenant_default', 'user-a', 'llmApiKey', 'key-a'),
          ('tenant_default', 'user-b', 'llmApiKey', 'key-b'),
          ('tenant_default', 'user-a', 'backupHour', '7'),
          ('tenant-alt', 'user-c', 'backupHour', '9');
        INSERT INTO settings(tenant_id, user_id, key, value)
          VALUES ('tenant_default', NULL, 'model', 'legacy-owner-model'),
            ('tenant-alt', NULL, 'model', 'legacy-alt-model');
        DELETE FROM app_data_migrations WHERE id = 'settings-ownership-v1';
      \`);
      oldDb.close();

      await import(\`\${migrationUrl}?run=upgrade\`);
      await import(\`\${migrationUrl}?run=repeat\`);
      const upgraded = new Database(dbPath, { readonly: true });
      const personal = upgraded.prepare(
        "SELECT user_id, value FROM settings WHERE key = 'model' ORDER BY user_id",
      ).all();
      if (JSON.stringify(personal) !== JSON.stringify([
        { user_id: 'user-a', value: 'model-a' },
        { user_id: 'user-b', value: 'model-b' },
        { user_id: 'user-c', value: 'model-c' },
      ])) throw new Error("Personal model values were merged or lost");
      const key = upgraded.prepare(
        "SELECT value FROM settings WHERE user_id = 'user-b' AND key = 'llmApiKey'",
      ).get();
      if (key?.value !== 'key-b') throw new Error("Personal API key was lost");
      const platform = upgraded.prepare(
        "SELECT value FROM settings WHERE key = 'backupHour' AND tenant_id IS NULL AND user_id IS NULL",
      ).all();
      if (platform.length !== 1 || platform[0].value !== '7') {
        throw new Error("Platform backup setting is not authoritative");
      }
      const conflict = upgraded.prepare(
        "SELECT candidate_count FROM settings_migration_conflicts WHERE key = 'backupHour'",
      ).get();
      if (conflict?.candidate_count !== 2) {
        throw new Error("Conflicting platform values were not recorded");
      }
      const ownerConflicts = upgraded.prepare(
        "SELECT candidate_count, candidates_json FROM settings_migration_conflicts WHERE key = 'model'",
      ).all();
      if (ownerConflicts.length !== 2 ||
        ownerConflicts.some((entry) => entry.candidate_count !== 2) ||
        !ownerConflicts.some((entry) =>
          JSON.parse(entry.candidates_json).some((candidate) =>
            candidate.value === 'legacy-owner-model'))) {
        throw new Error("Conflicting personal values were not recorded");
      }
      const backupAudit = upgraded.prepare(
        "SELECT candidates_json FROM settings_migration_conflicts WHERE key = 'backupHour'",
      ).get();
      if (JSON.parse(backupAudit.candidates_json).length !== 2) {
        throw new Error("Losing platform values were not retained in the audit");
      }
      upgraded.close();
    `;

    execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      { env: { ...process.env, DATA_DIR: tempDir }, stdio: "pipe" },
    );
  });
});
