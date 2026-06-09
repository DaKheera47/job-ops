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
});
