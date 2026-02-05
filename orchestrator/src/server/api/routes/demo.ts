import { ok } from "@infra/http";
import { type Request, type Response, Router } from "express";
import { getDemoInfo } from "../../config/demo";

export const demoRouter = Router();

demoRouter.get("/info", (_req: Request, res: Response) => {
  ok(res, getDemoInfo());
});
