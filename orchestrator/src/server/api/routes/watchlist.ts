import {
  workdayUrlToCompanyLabel,
  workdayUrlToCxsJobsUrl,
} from "@career-boards/workday";
import { badRequest, unprocessableEntity } from "@infra/errors";
import { fail, ok } from "@infra/http";
import {
  getCareerBoardSourceById,
  listCareerBoardSources,
} from "@server/config/career-boards";
import * as watchlistRepo from "@server/repositories/watchlist";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const watchlistRouter = Router();

const watchlistStateParamsSchema = z.object({
  source: z.string().trim().min(1).max(120),
  sourceJobId: z.string().trim().min(1).max(500),
});

const watchlistCheckSchema = z.object({
  checks: z
    .array(
      z.object({
        source: z.string().trim().min(1).max(120),
        sourceJobIds: z.array(z.string().trim().min(1).max(500)).max(200),
      }),
    )
    .max(20),
});

const updateWatchlistSelectionsSchema = z.object({
  selections: z
    .array(
      z.object({
        catalogSourceId: z
          .string()
          .trim()
          .min(1)
          .max(500)
          .nullable()
          .optional(),
        sourceType: z.string().trim().min(1).max(120),
        label: z.string().trim().min(1).max(200).nullable().optional(),
        careersUrl: z.string().trim().url().max(2000),
      }),
    )
    .max(10),
});

function hydrateSelectedSources(
  selectedSources: Awaited<
    ReturnType<typeof watchlistRepo.listWatchlistSelectedSources>
  >,
) {
  return selectedSources.map((source) => ({
    ...source,
    label: getHydratedWatchlistLabel(source),
    cxsJobsUrl:
      source.sourceType === "workday"
        ? workdayUrlToCxsJobsUrl(source.careersUrl)
        : source.cxsJobsUrl,
  }));
}

function getHydratedWatchlistLabel(source: {
  sourceType: string;
  label: string;
  careersUrl: string;
}): string {
  if (
    source.sourceType === "workday" &&
    (!source.label.trim() || source.label.trim() === source.careersUrl.trim())
  ) {
    return workdayUrlToCompanyLabel(source.careersUrl);
  }

  return source.label;
}

watchlistRouter.get("/states", async (_req: Request, res: Response) => {
  ok(res, { states: await watchlistRepo.listWatchlistJobStates() });
});

watchlistRouter.get("/sources", async (_req: Request, res: Response) => {
  const [catalogSources, selectedSources] = await Promise.all([
    listCareerBoardSources(),
    watchlistRepo.listWatchlistSelectedSources(),
  ]);

  ok(res, {
    catalogSources,
    selectedSources: hydrateSelectedSources(selectedSources),
  });
});

watchlistRouter.post("/checks", async (req: Request, res: Response) => {
  const parsedBody = watchlistCheckSchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return fail(
      res,
      badRequest("Invalid watchlist check payload", parsedBody.error.flatten()),
    );
  }

  ok(res, await watchlistRepo.recordWatchlistCheck(parsedBody.data));
});

watchlistRouter.put("/sources", async (req: Request, res: Response) => {
  const parsedBody = updateWatchlistSelectionsSchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return fail(
      res,
      badRequest(
        "Invalid watchlist source selections",
        parsedBody.error.flatten(),
      ),
    );
  }

  const normalizedSelections = [];
  const seenUrls = new Set<string>();

  for (const selection of parsedBody.data.selections) {
    const normalizedUrl = selection.careersUrl.trim();
    if (seenUrls.has(normalizedUrl)) {
      return fail(
        res,
        unprocessableEntity("Duplicate watchlist URLs are not allowed", {
          careersUrl: normalizedUrl,
        }),
      );
    }
    seenUrls.add(normalizedUrl);

    if (selection.catalogSourceId) {
      const catalogSource = await getCareerBoardSourceById(
        selection.catalogSourceId,
      );
      if (!catalogSource) {
        return fail(
          res,
          unprocessableEntity("Selected watchlist source was not found", {
            catalogSourceId: selection.catalogSourceId,
          }),
        );
      }

      if (catalogSource.careersUrl !== normalizedUrl) {
        return fail(
          res,
          unprocessableEntity(
            "Selected watchlist source URL does not match the catalog",
            {
              catalogSourceId: selection.catalogSourceId,
              careersUrl: normalizedUrl,
            },
          ),
        );
      }

      normalizedSelections.push({
        catalogSourceId: catalogSource.id,
        sourceType: catalogSource.sourceType,
        label: catalogSource.label,
        careersUrl: catalogSource.careersUrl,
      });
      continue;
    }

    if (selection.sourceType === "workday") {
      try {
        const companyLabel = workdayUrlToCompanyLabel(normalizedUrl);
        normalizedSelections.push({
          catalogSourceId: null,
          sourceType: selection.sourceType,
          label:
            selection.label?.trim() && selection.label.trim() !== normalizedUrl
              ? selection.label.trim()
              : companyLabel,
          careersUrl: normalizedUrl,
        });
        continue;
      } catch (error) {
        return fail(
          res,
          unprocessableEntity(
            `Invalid Workday URL: ${error instanceof Error ? error.message : String(error)}`,
            { careersUrl: normalizedUrl },
          ),
        );
      }
    }

    normalizedSelections.push({
      catalogSourceId: null,
      sourceType: selection.sourceType,
      label: selection.label?.trim() || normalizedUrl,
      careersUrl: normalizedUrl,
    });
  }

  const selectedSources = await watchlistRepo.replaceWatchlistSelectedSources({
    selections: normalizedSelections,
  });
  const catalogSources = await listCareerBoardSources();

  ok(res, {
    catalogSources,
    selectedSources: hydrateSelectedSources(selectedSources),
  });
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
