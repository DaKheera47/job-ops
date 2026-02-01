/**
 * Express server entry point.
 */

import "./config/env.js";
import { createApp } from "./app.js";
import * as settingsRepo from "./repositories/settings.js";
import {
  getBackupSettings,
  setBackupSettings,
  startBackupScheduler,
} from "./services/backup/index.js";
import { applyStoredEnvOverrides } from "./services/envSettings.js";
import { initialize as initializeVisaSponsors } from "./services/visa-sponsors/index.js";

async function startServer() {
  await applyStoredEnvOverrides();

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
      await initializeVisaSponsors();
    } catch (error) {
      console.warn("⚠️ Failed to initialize visa sponsors service:", error);
    }

    // Initialize backup service (load settings and start scheduler if enabled)
    try {
      const backupEnabled = await settingsRepo.getSetting("backupEnabled");
      const backupHour = await settingsRepo.getSetting("backupHour");
      const backupMaxCount = await settingsRepo.getSetting("backupMaxCount");

      setBackupSettings({
        enabled: backupEnabled === "true" || backupEnabled === "1",
        hour: backupHour ? parseInt(backupHour, 10) : 2,
        maxCount: backupMaxCount ? parseInt(backupMaxCount, 10) : 5,
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
      console.warn("⚠️ Failed to initialize backup service:", error);
    }
  });
}

void startServer();
