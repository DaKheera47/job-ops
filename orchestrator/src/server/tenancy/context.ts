import { getTenantId } from "@infra/request-context";
import { DEFAULT_TENANT_ID } from "./constants";

export function getActiveTenantId(): string {
  return getTenantId() ?? DEFAULT_TENANT_ID;
}
