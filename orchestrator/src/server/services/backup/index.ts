/**
 * Database Backup Service
 *
 * Manages automatic and manual backups of the SQLite database.
 * Stores backups in the same directory as the original database.
 */

import fs from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import type { BackupInfo } from "@shared/types.js";
import Database from "better-sqlite3";
import { getDataDir } from "../../config/dataDir.js";
import { createScheduler } from "../../utils/scheduler.js";

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

// Current settings (updated by setBackupSettings)
let currentSettings: BackupSettings = {
  enabled: false,
  hour: 2,
  maxCount: 5,
};

// Create scheduler for automatic backups
const scheduler = createScheduler("backup", async () => {
  await createBackup("auto");
  await cleanupOldBackups();
});

/**
 * Get the path to the database file
 */
function getDbPath(): string {
  return path.join(getDataDir(), DB_FILENAME);
}

/**
 * Get the data directory path
 */
function getBackupDir(): string {
  return getDataDir();
}

/**
 * Generate filename for a backup
 */
function generateBackupFilename(type: "auto" | "manual"): string {
  const now = new Date();
  if (type === "auto") {
    // Format: jobs_YYYY_MM_DD.db (UTC date to match UTC scheduler)
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const day = String(now.getUTCDate()).padStart(2, "0");
    return `${AUTO_BACKUP_PREFIX}${year}_${month}_${day}.db`;
  } else {
    // Format: jobs_manual_YYYY_MM_DD_HH_MM_SS.db (local time for manual backups)
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    return `${MANUAL_BACKUP_PREFIX}${year}_${month}_${day}_${hours}_${minutes}_${seconds}.db`;
  }
}

/**
 * Parse backup filename to extract creation date
 */
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

/**
 * Determine backup type from filename
 */
function getBackupType(filename: string): "auto" | "manual" | null {
  if (AUTO_BACKUP_PATTERN.test(filename)) return "auto";
  if (MANUAL_BACKUP_PATTERN.test(filename)) return "manual";
  return null;
}

/**
 * Create a backup of the database
 * @param type - 'auto' for scheduled backups, 'manual' for user-triggered
 * @returns The filename of the created backup
 */
export async function createBackup(type: "auto" | "manual"): Promise<string> {
  const dbPath = getDbPath();
  const backupDir = getBackupDir();
  const baseFilename = generateBackupFilename(type);
  let filename = baseFilename;
  let backupPath = path.join(backupDir, filename);
  let reservedHandle: FileHandle | null = null;

  // Check if database exists
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
      console.log(
        `ℹ️ [backup] Auto backup already exists for today: ${filename}`,
      );
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

  // Close the reserved file handle before running SQLite backup
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

  console.log(
    `✅ [backup] Created ${type} backup: ${filename} (${(await fs.promises.stat(backupPath)).size} bytes)`,
  );

  return filename;
}

/**
 * List all backups with metadata
 * @returns Array of backup information
 */
export async function listBackups(): Promise<BackupInfo[]> {
  const backupDir = getBackupDir();

  // Check if directory exists
  if (!fs.existsSync(backupDir)) {
    return [];
  }

  // Read directory and filter backup files
  const files = await fs.promises.readdir(backupDir);
  const backupFiles = files.filter((file) => {
    return AUTO_BACKUP_PATTERN.test(file) || MANUAL_BACKUP_PATTERN.test(file);
  });

  // Get metadata for each backup
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

  // Sort by creation date (newest first)
  backups.sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return backups;
}

/**
 * Delete a specific backup
 * @param filename - Name of the backup file to delete
 */
export async function deleteBackup(filename: string): Promise<void> {
  // Validate filename to prevent path traversal
  if (
    !AUTO_BACKUP_PATTERN.test(filename) &&
    !MANUAL_BACKUP_PATTERN.test(filename)
  ) {
    throw new Error("Invalid backup filename");
  }

  const backupDir = getBackupDir();
  const filePath = path.join(backupDir, filename);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`Backup not found: ${filename}`);
  }

  // Delete file
  await fs.promises.unlink(filePath);
  console.log(`🗑️ [backup] Deleted backup: ${filename}`);
}

/**
 * Clean up old automatic backups
 * Keeps only the most recent N automatic backups (where N = maxCount)
 * Manual backups are never deleted automatically
 */
export async function cleanupOldBackups(): Promise<void> {
  const backups = await listBackups();

  // Filter to only automatic backups
  const autoBackups = backups.filter((b) => b.type === "auto");

  // Sort by creation date (oldest first for deletion)
  autoBackups.sort((a, b) => {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  // Delete oldest backups if we exceed max count
  const maxCount = currentSettings.maxCount;
  if (autoBackups.length > maxCount) {
    const toDelete = autoBackups.slice(0, autoBackups.length - maxCount);

    for (const backup of toDelete) {
      try {
        await deleteBackup(backup.filename);
      } catch (error) {
        console.error(
          `❌ [backup] Failed to delete old backup ${backup.filename}:`,
          error,
        );
      }
    }

    console.log(
      `🧹 [backup] Cleaned up ${toDelete.length} old automatic backups (max: ${maxCount})`,
    );
  }
}

/**
 * Update backup settings and restart scheduler if needed
 * @param settings - New backup settings
 */
export function setBackupSettings(settings: Partial<BackupSettings>): void {
  const oldEnabled = currentSettings.enabled;
  const oldHour = currentSettings.hour;

  // Update settings
  currentSettings = { ...currentSettings, ...settings };

  console.log(`⚙️ [backup] Settings updated:`, currentSettings);

  // Restart scheduler if settings changed
  if (currentSettings.enabled) {
    if (!oldEnabled || oldHour !== currentSettings.hour) {
      // Start or restart with new hour
      scheduler.start(currentSettings.hour);
    }
  } else if (oldEnabled && !currentSettings.enabled) {
    // Stop scheduler
    scheduler.stop();
  }
}

/**
 * Get current backup settings
 */
export function getBackupSettings(): BackupSettings {
  return { ...currentSettings };
}

/**
 * Get the next scheduled backup time
 * @returns ISO string of next backup time, or null if disabled
 */
export function getNextBackupTime(): string | null {
  return scheduler.getNextRun();
}

/**
 * Check if automatic backup scheduler is running
 */
export function isBackupSchedulerRunning(): boolean {
  return scheduler.isRunning();
}

/**
 * Start the backup scheduler manually (used on server startup)
 * Only starts if backup is enabled
 */
export function startBackupScheduler(): void {
  if (currentSettings.enabled) {
    scheduler.start(currentSettings.hour);
  }
}

/**
 * Stop the backup scheduler
 */
export function stopBackupScheduler(): void {
  scheduler.stop();
}
