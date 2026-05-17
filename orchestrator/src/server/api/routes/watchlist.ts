import { badRequest } from "@infra/errors";
import { fail, ok } from "@infra/http";
import * as watchlistRepo from "@server/repositories/watchlist";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const watchlistRouter = Router();

const watchlistStateParamsSchema = z.object({
  source: z.string().trim().min(1).max(120),
  sourceJobId: z.string().trim().min(1).max(500),
});

watchlistRouter.get("/states", async (_req: Request, res: Response) => {
  ok(res, { states: await watchlistRepo.listWatchlistJobStates() });
});

watchlistRouter.put(
  "/states/:source/:sourceJobId",
  async (req: Request, res: Response) => {
    const parsedParams = watchlistStateParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return fail(
        res,
        badRequest(
          "Invalid watchlist state parameters",
          parsedParams.error.flatten(),
        ),
      );
    }

    const state = await watchlistRepo.setWatchlistJobState({
      ...parsedParams.data,
      state: "ignored",
    });

    ok(res, { state });
  },
);

watchlistRouter.delete(
  "/states/:source/:sourceJobId",
  async (req: Request, res: Response) => {
    const parsedParams = watchlistStateParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return fail(
        res,
        badRequest(
          "Invalid watchlist state parameters",
          parsedParams.error.flatten(),
        ),
      );
    }

    await watchlistRepo.clearWatchlistJobState(parsedParams.data);
    ok(res, { cleared: true });
  },
);
