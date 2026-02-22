import { ok } from "@infra/http";
import { getDemoInfo } from "@server/config/demo";
import { type Request, type Response, Router } from "express";

export const demoRouter = Router();

demoRouter.get("/info", (_req: Request, res: Response) => {
  ok(res, getDemoInfo());
});
