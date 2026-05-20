import {
  badRequest,
  notFound,
  toAppError,
  unprocessableEntity,
} from "@infra/errors";
import { fail, ok } from "@infra/http";
import {
  getCareerBoardSourceById,
  listCareerBoardSources,
} from "@server/config/career-boards";
import * as jobsRepo from "@server/repositories/jobs";
import * as watchlistRepo from "@server/repositories/watchlist";
import {
  getWatchlistSourceAdapter,
  listWatchlistSourceAdapters,
} from "@server/watchlist/adapters";
import type {
  JobListItem,
  WatchlistCheckResponse,
  WatchlistJobResult,
  WatchlistResultsResponse,
  WatchlistSelectedSource,
  WatchlistSourceResult,
} from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const watchlistRouter = Router();

const WATCHLIST_SOURCE_TIMEOUT_MS = 30000;

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

const watchlistSourceJobSchema = z.object({
  selectedSourceId: z.string().trim().min(1).max(500),
  jobRef: z.string().trim().min(1).max(3000),
});

const watchlistSourceBrandingSchema = z.object({
  selectedSourceId: z.string().trim().min(1).max(500).nullable().optional(),
  sourceType: z.string().trim().min(1).max(120),
  careersUrl: z.string().trim().url().max(2000),
});

function getSourceTypeDescriptors() {
  return listWatchlistSourceAdapters().map((adapter) => adapter.descriptor);
}

function hydrateSelectedSource(
  source: WatchlistSelectedSource,
): WatchlistSelectedSource {
  const adapter = getWatchlistSourceAdapter(source.sourceType);
  return adapter?.hydrateSelectedSource(source) ?? source;
}

function hydrateSelectedSources(
  selectedSources: Awaited<
    ReturnType<typeof watchlistRepo.listWatchlistSelectedSources>
  >,
) {
  return selectedSources.map(hydrateSelectedSource);
}

function getWatchlistSourcesPayload(
  catalogSources: Awaited<ReturnType<typeof listCareerBoardSources>>,
  selectedSources: Awaited<
    ReturnType<typeof watchlistRepo.listWatchlistSelectedSources>
  >,
) {
  return {
    catalogSources,
    selectedSources: hydrateSelectedSources(selectedSources),
    availableSourceTypes: getSourceTypeDescriptors(),
  };
}

watchlistRouter.get("/states", async (_req: Request, res: Response) => {
  ok(res, { states: await watchlistRepo.listWatchlistJobStates() });
});

watchlistRouter.get("/sources", async (_req: Request, res: Response) => {
  const [catalogSources, selectedSources] = await Promise.all([
    listCareerBoardSources(),
    watchlistRepo.listWatchlistSelectedSources(),
  ]);

  ok(res, getWatchlistSourcesPayload(catalogSources, selectedSources));
});

watchlistRouter.post("/results", async (_req: Request, res: Response) => {
  const selectedSources = hydrateSelectedSources(
    await watchlistRepo.listWatchlistSelectedSources(),
  );

  if (selectedSources.length === 0) {
    return ok(res, {
      checkedAt: null,
      previousLastCheckedAt: null,
      sources: [],
    } satisfies WatchlistResultsResponse);
  }

  const fetchedSources = await Promise.all(
    selectedSources.map((source) => fetchWatchlistSource(source)),
  );
  const successfulSources = fetchedSources.filter(
    (item): item is Extract<WatchlistSourceResult, { status: "success" }> =>
      item.status === "success",
  );
  const checksBySource = new Map<string, Set<string>>();

  for (const item of successfulSources) {
    for (const job of item.jobs) {
      const sourceJobIds = checksBySource.get(job.source) ?? new Set<string>();
      sourceJobIds.add(job.sourceJobId);
      checksBySource.set(job.source, sourceJobIds);
    }
  }

  const check = await watchlistRepo.recordWatchlistCheck({
    checks: Array.from(checksBySource, ([source, sourceJobIds]) => ({
      source,
      sourceJobIds: Array.from(sourceJobIds),
    })),
  });
  const [states, workspaceJobs] = await Promise.all([
    watchlistRepo.listWatchlistJobStates(),
    jobsRepo.getJobListItems(),
  ]);

  ok(res, {
    checkedAt: check.checkedAt,
    previousLastCheckedAt: check.previousLastCheckedAt,
    sources: annotateSourceResults({
      sourceResults: fetchedSources,
      check,
      states,
      workspaceJobs,
    }),
  } satisfies WatchlistResultsResponse);
});

watchlistRouter.post("/job-details", async (req: Request, res: Response) => {
  const parsedBody = watchlistSourceJobSchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return fail(
      res,
      badRequest(
        "Invalid watchlist job details payload",
        parsedBody.error.flatten(),
      ),
    );
  }

  try {
    const source = await getSelectedSourceById(
      parsedBody.data.selectedSourceId,
    );
    const adapter = getWatchlistSourceAdapter(source.sourceType);
    if (!adapter) {
      return fail(
        res,
        unprocessableEntity("Unsupported watchlist source type", {
          sourceType: source.sourceType,
        }),
      );
    }
    ok(
      res,
      await withSourceTimeout((signal) =>
        adapter.fetchJobDetails({
          source,
          jobRef: parsedBody.data.jobRef,
          signal,
        }),
      ),
    );
  } catch (error) {
    fail(res, toAppError(error));
  }
});

watchlistRouter.post("/import-draft", async (req: Request, res: Response) => {
  const parsedBody = watchlistSourceJobSchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return fail(
      res,
      badRequest(
        "Invalid watchlist import payload",
        parsedBody.error.flatten(),
      ),
    );
  }

  try {
    const source = await getSelectedSourceById(
      parsedBody.data.selectedSourceId,
    );
    const adapter = getWatchlistSourceAdapter(source.sourceType);
    if (!adapter) {
      return fail(
        res,
        unprocessableEntity("Unsupported watchlist source type", {
          sourceType: source.sourceType,
        }),
      );
    }
    const result = await withSourceTimeout((signal) =>
      adapter.prepareImportDraft({
        source,
        jobRef: parsedBody.data.jobRef,
        signal,
      }),
    );

    ok(res, {
      ...result,
      sourceType: source.sourceType,
      catalogSourceId: source.catalogSourceId,
      careersUrl: source.careersUrl,
    });
  } catch (error) {
    fail(res, toAppError(error));
  }
});

watchlistRouter.post(
  "/source-branding",
  async (req: Request, res: Response) => {
    const parsedBody = watchlistSourceBrandingSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return fail(
        res,
        badRequest(
          "Invalid watchlist source branding payload",
          parsedBody.error.flatten(),
        ),
      );
    }

    try {
      const selectedSource = parsedBody.data.selectedSourceId
        ? await getSelectedSourceById(parsedBody.data.selectedSourceId)
        : null;
      const source = selectedSource ?? {
        sourceType: parsedBody.data.sourceType,
        careersUrl: parsedBody.data.careersUrl,
      };
      const adapter = getWatchlistSourceAdapter(source.sourceType);
      const fetchBranding = adapter?.fetchBranding;
      if (!fetchBranding) {
        return fail(
          res,
          unprocessableEntity("Watchlist source branding is not supported", {
            sourceType: source.sourceType,
          }),
        );
      }

      ok(
        res,
        await withSourceTimeout((signal) =>
          fetchBranding({
            source,
            signal,
          }),
        ),
      );
    } catch (error) {
      fail(res, toAppError(error));
    }
  },
);

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

    const adapter = getWatchlistSourceAdapter(selection.sourceType);
    if (!adapter) {
      return fail(
        res,
        unprocessableEntity("Unsupported watchlist source type", {
          sourceType: selection.sourceType,
        }),
      );
    }
    if (!adapter.descriptor.supportsCustomSource) {
      return fail(
        res,
        unprocessableEntity(
          "Custom sources are not supported for this source type",
          {
            sourceType: selection.sourceType,
          },
        ),
      );
    }

    try {
      const normalized = adapter.normalizeCustomSelection({
        label: selection.label,
        careersUrl: normalizedUrl,
      });
      normalizedSelections.push({
        catalogSourceId: null,
        sourceType: selection.sourceType,
        label: normalized.label,
        careersUrl: normalized.careersUrl,
      });
    } catch (error) {
      return fail(
        res,
        unprocessableEntity(
          `${adapter.descriptor.invalidUrlMessage}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { careersUrl: normalizedUrl },
        ),
      );
    }
  }

  const selectedSources = await watchlistRepo.replaceWatchlistSelectedSources({
    selections: normalizedSelections,
  });
  const catalogSources = await listCareerBoardSources();

  ok(res, getWatchlistSourcesPayload(catalogSources, selectedSources));
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

async function getSelectedSourceById(
  selectedSourceId: string,
): Promise<WatchlistSelectedSource> {
  const selectedSources = hydrateSelectedSources(
    await watchlistRepo.listWatchlistSelectedSources(),
  );
  const source = selectedSources.find((item) => item.id === selectedSourceId);
  if (!source) {
    throw notFound("Watchlist source was not found");
  }
  return source;
}

async function fetchWatchlistSource(
  source: WatchlistSelectedSource,
): Promise<WatchlistSourceResult> {
  const adapter = getWatchlistSourceAdapter(source.sourceType);
  if (!adapter) {
    return {
      status: "error",
      source,
      error: `Unsupported watchlist source type: ${source.sourceType}`,
    };
  }

  try {
    const result = await withSourceTimeout((signal) =>
      adapter.fetchJobs({ source, signal }),
    );
    return {
      status: "success",
      source,
      jobs: result.jobs.map((job) => ({
        ...job,
        rowState: "new",
        isNewSinceLastCheck: false,
        workspaceJob: null,
      })),
      total: result.total,
      fetched: result.fetched,
    };
  } catch (error) {
    return {
      status: "error",
      source,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function annotateSourceResults(input: {
  sourceResults: WatchlistSourceResult[];
  check: WatchlistCheckResponse;
  states: Awaited<ReturnType<typeof watchlistRepo.listWatchlistJobStates>>;
  workspaceJobs: JobListItem[];
}): WatchlistSourceResult[] {
  const ignoredKeys = new Set(
    input.states
      .filter((state) => state.state === "ignored")
      .map((state) => getJobKey(state.source, state.sourceJobId)),
  );
  const newJobKeys = new Set(
    input.check.jobs
      .filter((job) => job.isNewSinceLastCheck)
      .map((job) => getJobKey(String(job.source), job.sourceJobId)),
  );
  const importedByKey = new Map<string, JobListItem>();
  const importedByUrl = new Map<string, JobListItem>();
  for (const job of input.workspaceJobs) {
    if (job.sourceJobId) {
      importedByKey.set(getJobKey(String(job.source), job.sourceJobId), job);
    }
    importedByUrl.set(job.jobUrl, job);
  }

  return input.sourceResults.map((result) => {
    if (result.status === "error") return result;

    return {
      ...result,
      jobs: result.jobs.map((job): WatchlistJobResult => {
        const jobKey = getJobKey(String(job.source), job.sourceJobId);
        const workspaceJob =
          importedByKey.get(jobKey) ?? importedByUrl.get(job.jobUrl) ?? null;
        const rowState = workspaceJob
          ? "moved_to_workspace"
          : ignoredKeys.has(jobKey)
            ? "ignored"
            : "new";

        return {
          ...job,
          rowState,
          isNewSinceLastCheck: rowState === "new" && newJobKeys.has(jobKey),
          workspaceJob: workspaceJob
            ? { id: workspaceJob.id, status: workspaceJob.status }
            : null,
        };
      }),
    };
  });
}

async function withSourceTimeout<T>(
  callback: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    WATCHLIST_SOURCE_TIMEOUT_MS,
  );

  try {
    return await callback(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

function getJobKey(source: string, sourceJobId: string): string {
  return `${source}:${sourceJobId}`;
}
