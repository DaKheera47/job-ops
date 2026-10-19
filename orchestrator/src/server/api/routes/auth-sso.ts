import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  badRequest,
  notFound,
  serviceUnavailable,
  unauthorized,
} from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { getTenantId, getUserId } from "@infra/request-context";
import {
  createSsoAuthorizationRequest,
  exchangeSsoAuthorizationCode,
} from "@server/auth/sso/client";
import {
  getSsoProviderConfig,
  listEnabledSsoProviders,
  resolveSsoBaseUrl,
  type SsoProviderConfig,
} from "@server/auth/sso/config";
import {
  consumeSsoFlow,
  rememberSsoFlow,
  type SsoFlowMode,
  type SsoFlowState,
} from "@server/auth/sso/flow-store";
import {
  completeSsoLogin,
  linkSsoIdentity,
  toSsoIdentitySummary,
  unlinkSsoIdentity,
} from "@server/auth/sso/service";
import { getJobOpsAppConfig } from "@server/config/app-mode";
import { isDemoMode } from "@server/config/demo";
import * as ssoIdentitiesRepo from "@server/repositories/sso-identities";
import * as usersRepo from "@server/repositories/users";
import { SSO_PROVIDERS, type SsoStartResponse } from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const authSsoRouter = Router();

const providerParamsSchema = z.object({
  provider: z.enum(SSO_PROVIDERS),
});

const callbackBodySchema = z.object({
  state: z.string().min(1).max(512),
  flowToken: z.string().min(1).max(512),
  callbackSearch: z.string().min(1).max(4096).startsWith("?"),
});

// A callback that cannot be matched to a stored flow is indistinguishable to
// the user from an expired one, and saying more would help an attacker probe.
const FLOW_UNUSABLE_MESSAGE = "SSO session expired, try again";
const PROVIDER_UNAVAILABLE_MESSAGE = "SSO provider is not enabled";

function requireUserContext(
  res: Response,
): { userId: string; tenantId: string } | null {
  const userId = getUserId();
  const tenantId = getTenantId();
  if (!userId || !tenantId) {
    fail(res, unauthorized("Authentication required"));
    return null;
  }
  return { userId, tenantId };
}

/** Unknown and disabled providers answer alike so the enabled set stays private. */
function requireEnabledProvider(
  req: Request,
  res: Response,
): SsoProviderConfig | null {
  const parsed = providerParamsSchema.safeParse(req.params);
  const config = parsed.success
    ? getSsoProviderConfig(parsed.data.provider)
    : null;
  if (!config) {
    fail(res, notFound(PROVIDER_UNAVAILABLE_MESSAGE));
    return null;
  }
  return config;
}

function flowTokenMatches(expected: string, received: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  if (expectedBytes.length !== receivedBytes.length) return false;
  return timingSafeEqual(expectedBytes, receivedBytes);
}

async function startSsoFlow(args: {
  req: Request;
  res: Response;
  config: SsoProviderConfig;
  mode: SsoFlowMode;
  userId: string | null;
  tenantId: string | null;
}): Promise<void> {
  const baseUrl = resolveSsoBaseUrl(args.req);
  if (!baseUrl) {
    fail(
      args.res,
      serviceUnavailable(
        "Set SSO_REDIRECT_BASE_URL (or JOBOPS_PUBLIC_BASE_URL) to the public URL of this JobOps instance",
      ),
    );
    return;
  }

  const redirectUri = `${baseUrl}/sso/callback/${args.config.id}`;
  const authorizationRequest = await createSsoAuthorizationRequest({
    provider: args.config.id,
    redirectUri,
  });

  // The browser hands this back on the callback, so a stolen `state` alone
  // cannot complete somebody else's sign-in.
  const flowToken = randomBytes(32).toString("base64url");
  rememberSsoFlow(authorizationRequest.state, {
    provider: args.config.id,
    mode: args.mode,
    flowToken,
    codeVerifier: authorizationRequest.codeVerifier,
    nonce: authorizationRequest.nonce,
    redirectUri,
    userId: args.userId,
    tenantId: args.tenantId,
  });

  const response: SsoStartResponse = {
    provider: args.config.id,
    authorizationUrl: authorizationRequest.authorizationUrl,
    state: authorizationRequest.state,
    flowToken,
  };
  ok(args.res, response);
}

function consumeCallbackFlow(args: {
  res: Response;
  config: SsoProviderConfig;
  mode: SsoFlowMode;
  state: string;
  flowToken: string;
  userId: string | null;
}): SsoFlowState | null {
  const flow = consumeSsoFlow(args.state);
  if (!flow) {
    fail(args.res, badRequest(FLOW_UNUSABLE_MESSAGE));
    return null;
  }

  if (
    flow.provider !== args.config.id ||
    flow.mode !== args.mode ||
    flow.userId !== args.userId ||
    !flowTokenMatches(flow.flowToken, args.flowToken)
  ) {
    logger.warn("Rejected an SSO callback that did not match its flow", {
      provider: args.config.id,
      flowProvider: flow.provider,
      mode: args.mode,
      flowMode: flow.mode,
    });
    fail(args.res, badRequest(FLOW_UNUSABLE_MESSAGE));
    return null;
  }

  return flow;
}

authSsoRouter.get(
  "/providers",
  asyncRoute(async (_req: Request, res: Response) => {
    ok(res, listEnabledSsoProviders());
  }),
);

authSsoRouter.post(
  "/:provider/start",
  asyncRoute(async (req: Request, res: Response) => {
    if (isDemoMode()) {
      fail(
        res,
        serviceUnavailable("Single sign-on is disabled in the public demo."),
      );
      return;
    }

    const config = requireEnabledProvider(req, res);
    if (!config) return;

    // The first admin owns the instance, so the setup wizard has to run before
    // an identity provider can hand out the first account.
    if (
      getJobOpsAppConfig().appMode !== "hosted" &&
      (await usersRepo.countUsers()) === 0
    ) {
      fail(res, badRequest("Initial setup is required"));
      return;
    }

    await startSsoFlow({
      req,
      res,
      config,
      mode: "login",
      userId: null,
      tenantId: null,
    });
  }),
);

authSsoRouter.post(
  "/:provider/callback",
  asyncRoute(async (req: Request, res: Response) => {
    const config = requireEnabledProvider(req, res);
    if (!config) return;

    const parsed = callbackBodySchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid request body", parsed.error.flatten()));
      return;
    }

    const flow = consumeCallbackFlow({
      res,
      config,
      mode: "login",
      state: parsed.data.state,
      flowToken: parsed.data.flowToken,
      userId: null,
    });
    if (!flow) return;

    const claims = await exchangeSsoAuthorizationCode({
      provider: config.id,
      redirectUri: flow.redirectUri,
      callbackSearch: parsed.data.callbackSearch,
      expectedState: parsed.data.state,
      codeVerifier: flow.codeVerifier,
      nonce: flow.nonce,
    });

    ok(res, await completeSsoLogin({ provider: config.id, claims }));
  }),
);

authSsoRouter.post(
  "/:provider/link/start",
  asyncRoute(async (req: Request, res: Response) => {
    const context = requireUserContext(res);
    if (!context) return;

    const config = requireEnabledProvider(req, res);
    if (!config) return;

    await startSsoFlow({
      req,
      res,
      config,
      mode: "link",
      userId: context.userId,
      tenantId: context.tenantId,
    });
  }),
);

authSsoRouter.post(
  "/:provider/link/callback",
  asyncRoute(async (req: Request, res: Response) => {
    const context = requireUserContext(res);
    if (!context) return;

    const config = requireEnabledProvider(req, res);
    if (!config) return;

    const parsed = callbackBodySchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, badRequest("Invalid request body", parsed.error.flatten()));
      return;
    }

    const flow = consumeCallbackFlow({
      res,
      config,
      mode: "link",
      state: parsed.data.state,
      flowToken: parsed.data.flowToken,
      userId: context.userId,
    });
    if (!flow) return;

    const claims = await exchangeSsoAuthorizationCode({
      provider: config.id,
      redirectUri: flow.redirectUri,
      callbackSearch: parsed.data.callbackSearch,
      expectedState: parsed.data.state,
      codeVerifier: flow.codeVerifier,
      nonce: flow.nonce,
    });

    const { identity, created } = await linkSsoIdentity({
      provider: config.id,
      claims,
      userId: context.userId,
      tenantId: flow.tenantId ?? context.tenantId,
    });
    ok(res, identity, created ? 201 : 200);
  }),
);

authSsoRouter.get(
  "/identities",
  asyncRoute(async (_req: Request, res: Response) => {
    const context = requireUserContext(res);
    if (!context) return;

    const identities = await ssoIdentitiesRepo.listSsoIdentitiesForUser(
      context.userId,
    );
    ok(res, identities.map(toSsoIdentitySummary));
  }),
);

authSsoRouter.delete(
  "/identities/:id",
  asyncRoute(async (req: Request, res: Response) => {
    const context = requireUserContext(res);
    if (!context) return;

    const identityId = req.params.id;
    if (!identityId) {
      fail(res, badRequest("Connected account id is required"));
      return;
    }

    await unlinkSsoIdentity({ id: identityId, userId: context.userId });
    ok(res, { deleted: true });
  }),
);
