/**
 * Database Backup Service
 *
 * Manages automatic and manual backups of the SQLite database.
 * Stores backups in the same directory as the original database.
 */

import fs from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { logger } from "@infra/logger";
import { getDataDir } from "@server/config/dataDir";
import { createScheduler } from "@server/utils/scheduler";
import type { BackupInfo } from "@shared/types";
import Database from "better-sqlite3";

const DB_FILENAME = "jobs.db";
const AUTO_BACKUP_PREFIX = "jobs_";
const MANUAL_BACKUP_PREFIX = "jobs_manual_";
const AUTO_BACKUP_PATTERN = /^jobs_\d{4}_\d{2}_\d{2}\.db$/;
const MANUAL_BACKUP_PATTERN =
  /^jobs_manual_\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2}(?:_\d+)?\.db$/;

const AUTO_BACKUP_REGEX = /^jobs_(\d{4})_(\d{2})_(\d{2})\.db$/;
const MANUAL_BACKUP_REGEX =
  /^jobs_manual_(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_\d+)?\.db$/;

type SqliteDatabase = InstanceType<typeof Database>;

interface BackupSettings {
  enabled: boolean;
  hour: number;
  maxCount: number;
}

let currentSettings: BackupSettings = {
  enabled: false,
  hour: 2,
  maxCount: 5,
};

const scheduler = createScheduler("backup", async () => {
  await createBackup("auto");
  await cleanupOldBackups();
});

function getDbPath(): string {
  return path.join(getDataDir(), DB_FILENAME);
}

function getBackupDir(): string {
  return getDataDir();
}

function generateBackupFilename(type: "auto" | "manual"): string {
  const now = new Date();
  if (type === "auto") {
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const day = String(now.getUTCDate()).padStart(2, "0");
    return `${AUTO_BACKUP_PREFIX}${year}_${month}_${day}.db`;
  }

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${MANUAL_BACKUP_PREFIX}${year}_${month}_${day}_${hours}_${minutes}_${seconds}.db`;
}

function parseBackupDate(filename: string): Date | null {
  const autoMatch = filename.match(AUTO_BACKUP_REGEX);
  if (autoMatch) {
    const [, year, month, day] = autoMatch;
    return buildUtcDate(year, month, day, "0", "0", "0");
  }

  const manualMatch = filename.match(MANUAL_BACKUP_REGEX);
  if (manualMatch) {
    const [, year, month, day, hours, minutes, seconds] = manualMatch;
    return buildUtcDate(year, month, day, hours, minutes, seconds);
  }

  return null;
}

function buildUtcDate(
  yearRaw: string,
  monthRaw: string,
  dayRaw: string,
  hourRaw: string,
  minuteRaw: string,
  secondRaw: string,
): Date | null {
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return null;
  }

  return date;
}

function getBackupType(filename: string): "auto" | "manual" | null {
  if (AUTO_BACKUP_PATTERN.test(filename)) return "auto";
  if (MANUAL_BACKUP_PATTERN.test(filename)) return "manual";
  return null;
}

export async function createBackup(type: "auto" | "manual"): Promise<string> {
  const dbPath = getDbPath();
  const backupDir = getBackupDir();
  const baseFilename = generateBackupFilename(type);
  let filename = baseFilename;
  let backupPath = path.join(backupDir, filename);
  let reservedHandle: FileHandle | null = null;

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found: ${dbPath}`);
  }

  const tryReserve = async (
    candidatePath: string,
  ): Promise<FileHandle | null> => {
    try {
      return await fs.promises.open(candidatePath, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return null;
      throw error;
    }
  };

  if (type === "auto") {
    reservedHandle = await tryReserve(backupPath);
    if (!reservedHandle) {
      logger.info("Automatic backup already exists for current day", {
        filename,
        type,
      });
      return filename;
    }
  } else {
    const baseName = baseFilename.replace(/\.db$/, "");
    let sequence = 0;

    while (!reservedHandle && sequence <= 100) {
      const candidate =
        sequence === 0 ? baseFilename : `${baseName}_${sequence}.db`;
      const candidatePath = path.join(backupDir, candidate);
      const reserved = await tryReserve(candidatePath);
      if (reserved) {
        reservedHandle = reserved;
        filename = candidate;
        backupPath = candidatePath;
      } else {
        sequence += 1;
      }
    }

    if (!reservedHandle) {
      throw new Error("Failed to create unique manual backup filename");
    }
  }

  await reservedHandle.close();

  let sqlite: SqliteDatabase | null = null;
  try {
    sqlite = new Database(dbPath, { readonly: true, fileMustExist: true });
    await sqlite.backup(backupPath);
  } catch (error) {
    await fs.promises.unlink(backupPath).catch(() => undefined);
    throw error;
  } finally {
    sqlite?.close();
  }

  logger.info("Created database backup", {
    filename,
    type,
    size: (await fs.promises.stat(backupPath)).size,
  });

  return filename;
}

export async function listBackups(): Promise<BackupInfo[]> {
  const backupDir = getBackupDir();

  if (!fs.existsSync(backupDir)) {
    return [];
  }

  const files = await fs.promises.readdir(backupDir);
  const backupFiles = files.filter(
    (file) =>
      AUTO_BACKUP_PATTERN.test(file) || MANUAL_BACKUP_PATTERN.test(file),
  );

  const backups: BackupInfo[] = [];
  for (const filename of backupFiles) {
    const filePath = path.join(backupDir, filename);
    const type = getBackupType(filename);
    const createdAt = parseBackupDate(filename);

    if (type && createdAt) {
      const stats = await fs.promises.stat(filePath);
      backups.push({
        filename,
        type,
        size: stats.size,
        createdAt: createdAt.toISOString(),
      });
    }
  }

  backups.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return backups;
}

export async function deleteBackup(filename: string): Promise<void> {
  if (
    !AUTO_BACKUP_PATTERN.test(filename) &&
    !MANUAL_BACKUP_PATTERN.test(filename)
  ) {
    throw new Error("Invalid backup filename");
  }

  const backupDir = getBackupDir();
  const filePath = path.join(backupDir, filename);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Backup not found: ${filename}`);
  }

  await fs.promises.unlink(filePath);
  logger.info("Deleted database backup", { filename });
}

export async function cleanupOldBackups(): Promise<void> {
  const backups = await listBackups();
  const autoBackups = backups.filter((b) => b.type === "auto");

  autoBackups.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const maxCount = currentSettings.maxCount;
  if (autoBackups.length > maxCount) {
    const toDelete = autoBackups.slice(0, autoBackups.length - maxCount);

    for (const backup of toDelete) {
      try {
        await deleteBackup(backup.filename);
      } catch (error) {
        logger.error("Failed to delete old automatic backup", {
          filename: backup.filename,
          error,
        });
      }
    }

    logger.info("Cleaned up old automatic backups", {
      deletedCount: toDelete.length,
      maxCount,
    });
  }
}

export function setBackupSettings(settings: Partial<BackupSettings>): void {
  const oldEnabled = currentSettings.enabled;
  const oldHour = currentSettings.hour;

  currentSettings = { ...currentSettings, ...settings };

  logger.info("Backup settings updated", currentSettings);

  if (currentSettings.enabled) {
    if (!oldEnabled || oldHour !== currentSettings.hour) {
      scheduler.start(currentSettings.hour);
    }
  } else if (oldEnabled && !currentSettings.enabled) {
    scheduler.stop();
  }
}

export function getBackupSettings(): BackupSettings {
  return { ...currentSettings };
}

export function getNextBackupTime(): string | null {
  return scheduler.getNextRun();
}

export function isBackupSchedulerRunning(): boolean {
  return scheduler.isRunning();
}

export function startBackupScheduler(): void {
  if (currentSettings.enabled) {
    scheduler.start(currentSettings.hour);
  }
}

export function stopBackupScheduler(): void {
  scheduler.stop();
}
