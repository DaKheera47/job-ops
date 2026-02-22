import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as backup from "./index";

// Mock the dataDir module
vi.mock("@server/config/dataDir", () => ({
  getDataDir: vi.fn(),
}));

import { getDataDir } from "@server/config/dataDir";

describe("Backup Service", () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(async () => {
    // Create temp directory for tests
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "backup-test-"));
    dbPath = path.join(tempDir, "jobs.db");

    // Create a real SQLite database file for backup() to work.
    const db = new Database(dbPath);
    try {
      db.exec(
        [
          "PRAGMA journal_mode = DELETE;",
          "CREATE TABLE IF NOT EXISTS test_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL);",
          "DELETE FROM test_items;",
          "INSERT INTO test_items (name) VALUES ('alpha');",
        ].join("\n"),
      );
    } finally {
      db.close();
    }

    // Mock getDataDir to return temp directory
    vi.mocked(getDataDir).mockReturnValue(tempDir);

    // Reset backup settings
    backup.setBackupSettings({ enabled: false, hour: 2, maxCount: 5 });
    backup.stopBackupScheduler();
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    vi.clearAllMocks();
  });

  describe("createBackup", () => {
    it("should create an automatic backup with correct filename format", async () => {
      const filename = await backup.createBackup("auto");

      // Check filename format: jobs_YYYY_MM_DD.db
      expect(filename).toMatch(/^jobs_\d{4}_\d{2}_\d{2}\.db$/);

      // Check file was created
      const backupPath = path.join(tempDir, filename);
      expect(fs.existsSync(backupPath)).toBe(true);

      // Check backup is a valid SQLite database with expected data
      const backupDb = new Database(backupPath, {
        readonly: true,
        fileMustExist: true,
      });
      try {
        const row = backupDb
          .prepare("SELECT name FROM test_items ORDER BY id LIMIT 1")
          .get() as { name: string } | undefined;
        expect(row?.name).toBe("alpha");
      } finally {
        backupDb.close();
      }
    });

    it("should create a manual backup with correct filename format", async () => {
      const filename = await backup.createBackup("manual");

      // Check filename format: jobs_manual_YYYY_MM_DD_HH_MM_SS.db
      expect(filename).toMatch(
        /^jobs_manual_\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2}\.db$/,
      );

      // Check file was created
      const backupPath = path.join(tempDir, filename);
      expect(fs.existsSync(backupPath)).toBe(true);

      const backupDb = new Database(backupPath, {
        readonly: true,
        fileMustExist: true,
      });
      try {
        const count = backupDb
          .prepare("SELECT COUNT(*) as count FROM test_items")
          .get() as { count: number };
        expect(count.count).toBe(1);
      } finally {
        backupDb.close();
      }
    });

    it("should add a suffix when manual backup name collides", async () => {
      // Only fake Date to keep async I/O (used by better-sqlite3 backup) real.
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        vi.setSystemTime(new Date("2026-01-15T12:30:45Z"));

        const first = await backup.createBackup("manual");
        const second = await backup.createBackup("manual");

        expect(first).toBe("jobs_manual_2026_01_15_12_30_45.db");
        expect(second).toBe("jobs_manual_2026_01_15_12_30_45_1.db");
        expect(fs.existsSync(path.join(tempDir, second))).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("should throw error if database does not exist", async () => {
      // Delete the database
      await fs.promises.unlink(dbPath);

      await expect(backup.createBackup("auto")).rejects.toThrow(
        "Database file not found",
      );
    });
  });

  describe("listBackups", () => {
    it("should return empty array when no backups exist", async () => {
      const backups = await backup.listBackups();
      expect(backups).toEqual([]);
    });

    it("should list all backups with metadata", async () => {
      // Create some backups
      await backup.createBackup("auto");
      await backup.createBackup("manual");

      const backups = await backup.listBackups();

      expect(backups).toHaveLength(2);
      expect(backups[0]).toHaveProperty("filename");
      expect(backups[0]).toHaveProperty("type");
      expect(backups[0]).toHaveProperty("size");
      expect(backups[0]).toHaveProperty("createdAt");
    });

    it("should sort backups by date (newest first)", async () => {
      // Create backups with different dates by manipulating filenames
      const oldBackup = path.join(tempDir, "jobs_2026_01_01.db");
      const newBackup = path.join(tempDir, "jobs_2026_01_15.db");
      await fs.promises.writeFile(oldBackup, "old");
      await fs.promises.writeFile(newBackup, "new");

      const backups = await backup.listBackups();

      expect(backups[0].filename).toBe("jobs_2026_01_15.db");
      expect(backups[1].filename).toBe("jobs_2026_01_01.db");
    });

    it("should ignore non-backup files", async () => {
      // Create a backup and some other files
      await backup.createBackup("auto");
      await fs.promises.writeFile(path.join(tempDir, "random.txt"), "text");
      await fs.promises.writeFile(path.join(tempDir, "jobs.db"), "db");

      const backups = await backup.listBackups();

      expect(backups).toHaveLength(1);
      expect(backups[0].filename).toMatch(/^jobs_\d{4}_\d{2}_\d{2}\.db$/);
    });

    it("should include suffixed manual backups", async () => {
      const filename = "jobs_manual_2026_01_01_12_00_00_2.db";
      await fs.promises.writeFile(path.join(tempDir, filename), "manual");

      const backups = await backup.listBackups();

      expect(backups).toHaveLength(1);
      expect(backups[0].filename).toBe(filename);
      expect(backups[0].type).toBe("manual");
      expect(backups[0].createdAt).toBe("2026-01-01T12:00:00.000Z");
    });
  });

  describe("deleteBackup", () => {
    it("should delete a backup file", async () => {
      const filename = await backup.createBackup("auto");
      const backupPath = path.join(tempDir, filename);

      expect(fs.existsSync(backupPath)).toBe(true);

      await backup.deleteBackup(filename);

      expect(fs.existsSync(backupPath)).toBe(false);
    });

    it("should throw error for invalid filename", async () => {
      await expect(backup.deleteBackup("../../../etc/passwd")).rejects.toThrow(
        "Invalid backup filename",
      );
      await expect(backup.deleteBackup("random.txt")).rejects.toThrow(
        "Invalid backup filename",
      );
    });

    it("should throw error if backup does not exist", async () => {
      await expect(backup.deleteBackup("jobs_2026_01_01.db")).rejects.toThrow(
        "Backup not found",
      );
    });

    it("should delete a suffixed manual backup", async () => {
      const filename = "jobs_manual_2026_01_01_12_00_00_1.db";
      await fs.promises.writeFile(path.join(tempDir, filename), "manual");

      await backup.deleteBackup(filename);

      expect(fs.existsSync(path.join(tempDir, filename))).toBe(false);
    });
  });

  describe("cleanupOldBackups", () => {
    it("should delete oldest automatic backups when exceeding max count", async () => {
      // Create 7 auto backups (max is 5)
      for (let i = 1; i <= 7; i++) {
        const filename = `jobs_2026_01_${String(i).padStart(2, "0")}.db`;
        await fs.promises.writeFile(path.join(tempDir, filename), "data");
      }

      // Set max count to 5
      backup.setBackupSettings({ maxCount: 5 });
      await backup.cleanupOldBackups();

      const remaining = await backup.listBackups();
      expect(remaining).toHaveLength(5);
      // Should keep the 5 newest (03-07)
      const filenames = remaining.map((b) => b.filename);
      expect(filenames).toContain("jobs_2026_01_03.db");
      expect(filenames).toContain("jobs_2026_01_07.db");
      expect(filenames).not.toContain("jobs_2026_01_01.db");
      expect(filenames).not.toContain("jobs_2026_01_02.db");
    });

    it("should not delete manual backups", async () => {
      // Create auto backups
      for (let i = 1; i <= 7; i++) {
        const filename = `jobs_2026_01_${String(i).padStart(2, "0")}.db`;
        await fs.promises.writeFile(path.join(tempDir, filename), "data");
      }

      // Create manual backups
      await fs.promises.writeFile(
        path.join(tempDir, "jobs_manual_2026_01_01_12_00_00.db"),
        "manual",
      );
      await fs.promises.writeFile(
        path.join(tempDir, "jobs_manual_2026_01_02_12_00_00.db"),
        "manual",
      );

      backup.setBackupSettings({ maxCount: 5 });
      await backup.cleanupOldBackups();

      const remaining = await backup.listBackups();
      const autoBackups = remaining.filter((b) => b.type === "auto");
      const manualBackups = remaining.filter((b) => b.type === "manual");

      expect(autoBackups).toHaveLength(5);
      expect(manualBackups).toHaveLength(2);
    });

    it("should not delete if count is within limit", async () => {
      // Create 3 auto backups (max is 5)
      for (let i = 1; i <= 3; i++) {
        const filename = `jobs_2026_01_${String(i).padStart(2, "0")}.db`;
        await fs.promises.writeFile(path.join(tempDir, filename), "data");
      }

      backup.setBackupSettings({ maxCount: 5 });
      await backup.cleanupOldBackups();

      const remaining = await backup.listBackups();
      expect(remaining).toHaveLength(3);
    });
  });

  describe("setBackupSettings", () => {
    it("should update settings", () => {
      backup.setBackupSettings({ enabled: true, hour: 4, maxCount: 3 });

      const settings = backup.getBackupSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.hour).toBe(4);
      expect(settings.maxCount).toBe(3);
    });

    it("should merge partial settings", () => {
      backup.setBackupSettings({ hour: 6 });

      const settings = backup.getBackupSettings();
      expect(settings.enabled).toBe(false); // unchanged
      expect(settings.hour).toBe(6); // updated
      expect(settings.maxCount).toBe(5); // unchanged
    });
  });

  describe("scheduler integration", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should start scheduler when enabled", () => {
      const now = new Date("2026-01-15T10:00:00Z");
      vi.setSystemTime(now);

      expect(backup.isBackupSchedulerRunning()).toBe(false);

      backup.setBackupSettings({ enabled: true, hour: 14 });

      expect(backup.isBackupSchedulerRunning()).toBe(true);
      expect(backup.getNextBackupTime()).not.toBeNull();
    });

    it("should stop scheduler when disabled", () => {
      backup.setBackupSettings({ enabled: true, hour: 14 });
      expect(backup.isBackupSchedulerRunning()).toBe(true);

      backup.setBackupSettings({ enabled: false });
      expect(backup.isBackupSchedulerRunning()).toBe(false);
      expect(backup.getNextBackupTime()).toBeNull();
    });

    it("should restart scheduler when hour changes", () => {
      const now = new Date("2026-01-15T10:00:00Z");
      vi.setSystemTime(now);

      backup.setBackupSettings({ enabled: true, hour: 14 });
      const firstRun = backup.getNextBackupTime();

      backup.setBackupSettings({ hour: 16 });
      const secondRun = backup.getNextBackupTime();

      expect(secondRun).not.toBe(firstRun);
      expect(secondRun).not.toBeNull();
      expect(firstRun).not.toBeNull();
      if (secondRun && firstRun) {
        expect(new Date(secondRun).getTime()).toBeGreaterThan(
          new Date(firstRun).getTime(),
        );
      }
    });
  });
});
