import { join } from "node:path";
import { getDataDir } from "@server/config/dataDir";
import { getActiveTenantId } from "@server/tenancy/context";
import { getPrivateDataScope } from "@server/tenancy/private-scope";

export function getTenantPdfDir(tenantId = getActiveTenantId()): string {
  const scope = getPrivateDataScope();
  if (
    scope.enforceUserIsolation &&
    scope.userId &&
    tenantId === scope.tenantId
  ) {
    return join(getDataDir(), "pdfs", tenantId, "users", scope.userId);
  }
  return join(getDataDir(), "pdfs", tenantId);
}

export function getLegacyPdfDir(): string {
  return join(getDataDir(), "pdfs");
}

export function getTenantJobPdfPath(jobId: string): string {
  return join(getTenantPdfDir(), `resume_${jobId}.pdf`);
}

export function getLegacyJobPdfPath(jobId: string): string {
  return join(getLegacyPdfDir(), `resume_${jobId}.pdf`);
}

export function getTenantDesignResumePdfPath(): string {
  return join(getTenantPdfDir(), "design_resume_current.pdf");
}
