import { type Request, type Response, Router } from "express";
import { clearDatabase } from "../../db/clear.js";

export const databaseRouter = Router();

/**
 * DELETE /api/database - Clear all data from the database
 */
databaseRouter.delete("/", async (_req: Request, res: Response) => {
  try {
    const result = clearDatabase();

    res.json({
      success: true,
      data: {
        message: "Database cleared",
        jobsDeleted: result.jobsDeleted,
        runsDeleted: result.runsDeleted,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});
