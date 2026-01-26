/**
 * Express server entry point.
 */

import "./config/env.js";
import { createApp } from "./app.js";
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
  });
}

void startServer();
