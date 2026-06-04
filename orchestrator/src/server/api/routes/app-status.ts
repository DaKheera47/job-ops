import { asyncRoute, ok } from "@infra/http";
import { getJobOpsAppStatus } from "@server/config/app-mode";
import type { Request, Response } from "express";
import { Router } from "express";

export const appStatusRouter = Router();

appStatusRouter.get(
  "/status",
  asyncRoute(async (_req: Request, res: Response) => {
    ok(res, getJobOpsAppStatus());
  }),
);
