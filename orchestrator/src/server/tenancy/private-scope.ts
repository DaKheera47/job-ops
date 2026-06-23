import { unauthorized } from "@infra/errors";
import {
  getRequestContext,
  getUserId,
  requireTenantId,
} from "@infra/request-context";
import { getJobOpsAppConfig } from "@server/config/app-mode";
import { and, eq, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { getActiveTenantId } from "./context";

export type PrivateDataScope = {
  tenantId: string;
  userId: string | null;
  enforceUserIsolation: boolean;
  scopeKey: string;
};

type UserScopedTable = {
  tenantId: AnySQLiteColumn;
  userId: AnySQLiteColumn;
};

export function isHostedUserIsolationEnabled(): boolean {
  return getJobOpsAppConfig().appMode === "hosted";
}

export function getPrivateDataScope(): PrivateDataScope {
  const tenantId = getActiveTenantId();
  const userId = getUserId() ?? null;
  const enforceUserIsolation = isHostedUserIsolationEnabled();

  if (enforceUserIsolation && !userId) {
    throw unauthorized("Authentication required");
  }

  return {
    tenantId,
    userId,
    enforceUserIsolation,
    scopeKey:
      enforceUserIsolation && userId ? `${tenantId}:${userId}` : tenantId,
  };
}

export function requirePrivateTenantId(): string {
  return requireTenantId();
}

export function getPrivateDataOwnerId(): string | null {
  return getRequestContext()?.userId ?? null;
}

export function privateDataScopeFilter(table: UserScopedTable): SQL {
  const scope = getPrivateDataScope();
  const filters = [eq(table.tenantId, scope.tenantId)];
  if (scope.enforceUserIsolation && scope.userId) {
    filters.push(eq(table.userId, scope.userId));
  }
  return and(...filters) as SQL;
}
