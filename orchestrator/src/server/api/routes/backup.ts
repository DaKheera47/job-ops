import { logger } from "@infra/logger";
import {
  createBackup,
  deleteBackup,
  getNextBackupTime,
  listBackups,
} from "@server/services/backup/index";
import { type Request, type Response, Router } from "express";
import { isDemoMode, sendDemoBlocked } from "../../config/demo";

export const backupRouter = Router();

/**
 * GET /api/backups - List all backups with metadata
 */
backupRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const backups = await listBackups();
    const nextScheduled = getNextBackupTime();

    res.json({
      success: true,
      data: {
        backups,
        nextScheduled,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to list backups", error);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/backups - Create a manual backup
 */
backupRouter.post("/", async (_req: Request, res: Response) => {
  try {
    if (isDemoMode()) {
      return sendDemoBlocked(
        res,
        "Manual backup creation is disabled in the public demo.",
        { route: "POST /api/backups" },
      );
    }

    const filename = await createBackup("manual");
    const backups = await listBackups();
    const backup = backups.find((b) => b.filename === filename);

    if (!backup) {
      throw new Error("Backup was created but not found in list");
    }

    res.json({
      success: true,
      data: backup,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to create backup", error);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * DELETE /api/backups/:filename - Delete a specific backup
 */
backupRouter.delete("/:filename", async (req: Request, res: Response) => {
  try {
    if (isDemoMode()) {
      return sendDemoBlocked(
        res,
        "Deleting backups is disabled in the public demo.",
        { route: "DELETE /api/backups/:filename", filename: req.params.filename },
      );
    }

    const { filename } = req.params;

    if (!filename) {
      res.status(400).json({
        success: false,
        error: "Filename is required",
      });
      return;
    }

    await deleteBackup(filename);

    res.json({
      success: true,
      message: `Backup ${filename} deleted successfully`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to delete backup", {
      filename: req.params.filename,
      error,
    });

    if (message.includes("not found")) {
      res.status(404).json({ success: false, error: message });
    } else if (message.includes("Invalid")) {
      res.status(400).json({ success: false, error: message });
    } else {
      res.status(500).json({ success: false, error: message });
    }
  }
});
