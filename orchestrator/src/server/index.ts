/**
 * Express server entry point.
 */

import "./config/env";
import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import { createApp } from "./app";
import { initializeExtractorRegistry } from "./extractors/registry";
import { deleteExpiredOrRevokedAuthSessions } from "./repositories/auth-sessions";
import * as settingsRepo from "./repositories/settings";
import {
  getBackupSettings,
  setBackupSettings,
  startBackupScheduler,
} from "./services/backup/index";
import { initializeDemoModeServices } from "./services/demo-mode";
import { applyStoredEnvOverrides } from "./services/envSettings";
import { initialize as initializeVisaSponsors } from "./services/visa-sponsors/index";

const AUTH_SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

async function cleanupAuthSessions(trigger: "startup" | "interval") {
  try {
    await deleteExpiredOrRevokedAuthSessions();
    logger.debug("Auth session cleanup completed", { trigger });
  } catch (error) {
    logger.warn("Auth session cleanup failed", {
      trigger,
      error: sanitizeUnknown(error),
    });
  }
}

async function startServer() {
  await applyStoredEnvOverrides();
  try {
    await initializeExtractorRegistry();
  } catch (error) {
    const sanitizedError = sanitizeUnknown(error);
    logger.error("Failed to initialize extractor registry", {
      error: sanitizedError,
    });
    if (process.env.NODE_ENV === "production") {
      logger.error(
        "Extractor registry initialization failed in production. Shutting down server.",
      );
      process.exit(1);
    }

    logger.error(
      "Extractor registry initialization failed outside production. Server startup aborted.",
    );
    return;
  }

  const app = createApp();
  const PORT = process.env.PORT || 3001;

  // Start server
  app.listen(PORT, async () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 Job Ops Orchestrator                                 ║
║                                                           ║
║   Server running at: http://localhost:${PORT}               ║
║                                                           ║
║   API:     http://localhost:${PORT}/api                     ║
║   Health:  http://localhost:${PORT}/health                  ║
║   PDFs:    http://localhost:${PORT}/pdfs                    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);

    // Initialize visa sponsors service (downloads data if needed, starts scheduler)
    try {
      if (process.env.DEMO_MODE === "true") {
        console.log(
          "ℹ️ Demo mode enabled. Skipping visa sponsors initialization.",
        );
      } else {
        await initializeVisaSponsors();
      }
    } catch (error) {
      logger.warn("Failed to initialize visa sponsors service", {
        error: sanitizeUnknown(error),
      });
    }

    // Initialize backup service (load settings and start scheduler if enabled)
    try {
      const backupEnabled = await settingsRepo.getSetting("backupEnabled");
      const backupHour = await settingsRepo.getSetting("backupHour");
      const backupMaxCount = await settingsRepo.getSetting("backupMaxCount");

      const parsedHour = backupHour ? parseInt(backupHour, 10) : NaN;
      const parsedMaxCount = backupMaxCount
        ? parseInt(backupMaxCount, 10)
        : NaN;
      const safeHour = Number.isNaN(parsedHour)
        ? 2
        : Math.min(23, Math.max(0, parsedHour));
      const safeMaxCount = Number.isNaN(parsedMaxCount)
        ? 5
        : Math.min(5, Math.max(1, parsedMaxCount));

      setBackupSettings({
        enabled: backupEnabled === "true" || backupEnabled === "1",
        hour: safeHour,
        maxCount: safeMaxCount,
      });

      startBackupScheduler();

      const settings = getBackupSettings();
      if (settings.enabled) {
        console.log(
          `✅ Backup scheduler started (hour: ${settings.hour}, max: ${settings.maxCount})`,
        );
      } else {
        console.log(
          "ℹ️ Backups disabled. Enable in settings to schedule automatic backups.",
        );
      }
    } catch (error) {
      logger.warn("Failed to initialize backup service", {
        error: sanitizeUnknown(error),
      });
    }

    try {
      await cleanupAuthSessions("startup");
      setInterval(() => {
        void cleanupAuthSessions("interval");
      }, AUTH_SESSION_CLEANUP_INTERVAL_MS);
    } catch (error) {
      logger.warn("Failed to initialize auth session cleanup", {
        error: sanitizeUnknown(error),
      });
    }

    try {
      await initializeDemoModeServices();
    } catch (error) {
      logger.warn("Failed to initialize demo mode services", {
        error: sanitizeUnknown(error),
      });
    }
  });
}

void startServer();
