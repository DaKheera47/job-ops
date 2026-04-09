import { badRequest, notFound, toAppError } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import {
  deleteDesignResumePicture,
  exportDesignResume,
  getCurrentDesignResume,
  getDesignResumeStatus,
  importDesignResumeFromReactiveResume,
  readDesignResumeAssetContent,
  updateCurrentDesignResume,
  uploadDesignResumePicture,
} from "@server/services/design-resume";
import { generateDesignResumePdf } from "@server/services/pdf";
import { clearProfileCache } from "@server/services/profile";
import type { DesignResumeJson, DesignResumePatchRequest } from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const designResumeRouter = Router();

const jsonPointerSchema = z
  .string()
  .refine((value) => value === "" || value.startsWith("/"), {
    message: "Patch paths must be valid JSON Pointers.",
  });

function resolveRequestOrigin(req: Request): string | null {
  const configuredBaseUrl = process.env.JOBOPS_PUBLIC_BASE_URL?.trim();
  if (configuredBaseUrl) {
    try {
      const parsed = new URL(configuredBaseUrl);
      if (parsed.protocol && parsed.host) {
        return `${parsed.protocol}//${parsed.host}`;
      }
    } catch {
      // Ignore invalid env and fall back to request-derived origin.
    }
  }

  const trustProxy = Boolean(req.app?.get("trust proxy"));
  let protocol = (req.protocol || "").trim();
  let host = (req.header("host") || "").trim();

  if (trustProxy) {
    const forwardedProto =
      req.header("x-forwarded-proto")?.split(",")[0]?.trim() ?? "";
    const forwardedHost =
      req.header("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
    if (forwardedProto) protocol = forwardedProto;
    if (forwardedHost) host = forwardedHost;
  }

  if (!host || !protocol) return null;
  return `${protocol}://${host}`;
}

const addOperationSchema = z
  .object({
    op: z.literal("add"),
    path: jsonPointerSchema,
    value: z.unknown().optional(),
  })
  .superRefine((value, ctx) => {
    if (!("value" in value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Patch add operations require a value.",
      });
    }
  });

const replaceOperationSchema = z
  .object({
    op: z.literal("replace"),
    path: jsonPointerSchema,
    value: z.unknown().optional(),
  })
  .superRefine((value, ctx) => {
    if (!("value" in value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Patch replace operations require a value.",
      });
    }
  });

const testOperationSchema = z
  .object({
    op: z.literal("test"),
    path: jsonPointerSchema,
    value: z.unknown().optional(),
  })
  .superRefine((value, ctx) => {
    if (!("value" in value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Patch test operations require a value.",
      });
    }
  });

const moveOperationSchema = z
  .object({
    op: z.literal("move"),
    path: jsonPointerSchema,
    from: jsonPointerSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (!("from" in value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["from"],
        message: "Patch move operations require a from path.",
      });
    }
  });

const copyOperationSchema = z
  .object({
    op: z.literal("copy"),
    path: jsonPointerSchema,
    from: jsonPointerSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (!("from" in value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["from"],
        message: "Patch copy operations require a from path.",
      });
    }
  });

const patchOperationSchema = z.union([
  addOperationSchema,
  z.object({
    op: z.literal("remove"),
    path: jsonPointerSchema,
  }),
  replaceOperationSchema,
  moveOperationSchema,
  copyOperationSchema,
  testOperationSchema,
]);

export const designResumePatchSchema = z.object({
  baseRevision: z.number().int().min(1),
  document: z.unknown().optional(),
  operations: z.array(patchOperationSchema).optional(),
});

const pictureMutationSchema = z.object({
  baseRevision: z.number().int().min(1).optional(),
  document: z.unknown().optional(),
});

const uploadSchema = pictureMutationSchema.extend({
  fileName: z.string().trim().min(1).max(255),
  dataUrl: z.string().trim().min(1),
});

function asDesignResumeJson(value: unknown): DesignResumeJson | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DesignResumeJson)
    : undefined;
}

designResumeRouter.get(
  "/",
  asyncRoute(async (_req: Request, res: Response) => {
    const document = await getCurrentDesignResume();
    if (!document) {
      fail(res, notFound("Design Resume has not been imported yet."));
      return;
    }
    ok(res, document);
  }),
);

designResumeRouter.get(
  "/status",
  asyncRoute(async (_req: Request, res: Response) => {
    ok(res, await getDesignResumeStatus());
  }),
);

designResumeRouter.post(
  "/import/rxresume",
  asyncRoute(async (_req: Request, res: Response) => {
    const document = await importDesignResumeFromReactiveResume();
    clearProfileCache();
    ok(res, document, 201);
  }),
);

designResumeRouter.patch(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    const input = designResumePatchSchema.parse(
      req.body,
    ) as DesignResumePatchRequest;
    const document = await updateCurrentDesignResume(input);
    clearProfileCache();
    ok(res, document);
  }),
);

designResumeRouter.post(
  "/assets",
  asyncRoute(async (req: Request, res: Response) => {
    const input = uploadSchema.parse(req.body);
    const document = await uploadDesignResumePicture({
      fileName: input.fileName,
      dataUrl: input.dataUrl,
      baseRevision: input.baseRevision,
      document: asDesignResumeJson(input.document),
    });
    clearProfileCache();
    ok(res, document, 201);
  }),
);

designResumeRouter.delete(
  "/assets/picture",
  asyncRoute(async (req: Request, res: Response) => {
    const input = pictureMutationSchema.parse(req.body ?? {});
    const document = await deleteDesignResumePicture({
      baseRevision: input.baseRevision,
      document: asDesignResumeJson(input.document),
    });
    clearProfileCache();
    ok(res, document);
  }),
);

designResumeRouter.get(
  "/assets/:assetId/content",
  asyncRoute(async (req: Request, res: Response) => {
    const assetId = req.params.assetId?.trim();
    if (!assetId) {
      fail(res, badRequest("Asset id is required."));
      return;
    }

    const { asset, content } = await readDesignResumeAssetContent(assetId);
    res.setHeader("Content-Type", asset.mimeType);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.send(content);
  }),
);

designResumeRouter.get(
  "/export",
  asyncRoute(async (_req: Request, res: Response) => {
    ok(res, await exportDesignResume());
  }),
);

designResumeRouter.post(
  "/generate-pdf",
  asyncRoute(async (req: Request, res: Response) => {
    ok(
      res,
      await generateDesignResumePdf({
        requestOrigin: resolveRequestOrigin(req),
      }),
    );
  }),
);

designResumeRouter.use(
  (error: unknown, _req: Request, res: Response, _next: () => void) => {
    fail(res, toAppError(error));
  },
);
