/**
 * Database Backup Service
 *
 * Manages automatic and manual backups of the SQLite database.
 * Stores backups in the same directory as the original database.
 */

import fs from "node:fs";
import path from "node:path";
import type { BackupInfo } from "@shared/types.js";
import { getDataDir } from "../../config/dataDir.js";
import { createScheduler } from "../../utils/scheduler.js";

const DB_FILENAME = "jobs.db";
const AUTO_BACKUP_PREFIX = "jobs_";
const MANUAL_BACKUP_PREFIX = "jobs_manual_";
const AUTO_BACKUP_PATTERN = /^jobs_\d{4}_\d{2}_\d{2}\.db$/;
const MANUAL_BACKUP_PATTERN =
  /^jobs_manual_\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2}\.db$/;

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
    // Format: jobs_YYYY_MM_DD.db
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${AUTO_BACKUP_PREFIX}${year}_${month}_${day}.db`;
  } else {
    // Format: jobs_manual_YYYY_MM_DD_HH_MM_SS.db
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
  if (AUTO_BACKUP_PATTERN.test(filename)) {
    // Parse jobs_YYYY_MM_DD.db
    const match = filename.match(/^jobs_(\d{4})_(\d{2})_(\d{2})\.db$/);
    if (match) {
      const [, year, month, day] = match;
      return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
    }
  } else if (MANUAL_BACKUP_PATTERN.test(filename)) {
    // Parse jobs_manual_YYYY_MM_DD_HH_MM_SS.db
    const match = filename.match(
      /^jobs_manual_(\d{4})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})\.db$/,
    );
    if (match) {
      const [, year, month, day, hours, minutes, seconds] = match;
      return new Date(
        `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`,
      );
    }
  }
  return null;
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
  let filename = generateBackupFilename(type);
  let backupPath = path.join(backupDir, filename);

  // Check if database exists
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found: ${dbPath}`);
  }

  // Avoid overwriting existing backups
  if (fs.existsSync(backupPath)) {
    if (type === "auto") {
      console.log(
        `ℹ️ [backup] Auto backup already exists for today: ${filename}`,
      );
      return filename;
    }

    // Manual backups should be unique; add a sequence suffix
    const baseFilename = filename.replace(/\.db$/, "");
    let sequence = 1;
    while (fs.existsSync(backupPath) && sequence <= 100) {
      filename = `${baseFilename}_${sequence}.db`;
      backupPath = path.join(backupDir, filename);
      sequence += 1;
    }

    if (fs.existsSync(backupPath)) {
      throw new Error("Failed to create unique manual backup filename");
    }
  }

  // Copy database file
  await fs.promises.copyFile(dbPath, backupPath);

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
