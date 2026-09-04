import { badRequest, notFound } from "@infra/errors";
import { asyncRoute, ok } from "@infra/http";
import { getJobOpsAppConfig } from "@server/config/app-mode";
import { getCurrentAccountEntitlements } from "@server/services/account-entitlements";
import {
  createCheckoutSession,
  createPortalSession,
  handleStripeWebhook,
} from "@server/services/billing";
import { getHostedUsageSummary } from "@server/services/hosted-usage";
import type { BillingStatusResponse } from "@shared/types";
import { Router } from "express";

export const billingRouter = Router();

billingRouter.use((_req, _res, next) => {
  next(
    getJobOpsAppConfig().appMode === "hosted"
      ? undefined
      : notFound("Route not found"),
  );
});

billingRouter.get(
  "/status",
  asyncRoute(async (_req, res) => {
    const [entitlements, usage] = await Promise.all([
      getCurrentAccountEntitlements(),
      getHostedUsageSummary(),
    ]);
    const data: BillingStatusResponse = {
      ...entitlements,
      priceGbpMonthly: 30,
      usage,
    };
    ok(res, data);
  }),
);

billingRouter.post(
  "/checkout",
  asyncRoute(async (_req, res) => {
    ok(res, await createCheckoutSession());
  }),
);

billingRouter.post(
  "/portal",
  asyncRoute(async (_req, res) => {
    ok(res, await createPortalSession());
  }),
);

billingRouter.post(
  "/webhook",
  asyncRoute(async (req, res) => {
    if (!Buffer.isBuffer(req.body)) {
      throw badRequest("Stripe webhook body must be raw JSON.");
    }
    await handleStripeWebhook(req.body, req.header("stripe-signature"));
    ok(res, { received: true });
  }),
);
