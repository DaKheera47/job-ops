import { join } from "node:path";
import { getDataDir } from "@server/config/dataDir";
import { getActiveTenantId } from "@server/tenancy/context";

function safeFilePart(value: string, maxLen = 40): string {
  return value
    .replace(/[^a-zA-Z0-9\u0400-\u04FF _-]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, maxLen)
    .replace(/_+$/, "");
}

export function getTenantPdfDir(tenantId = getActiveTenantId()): string {
  return join(getDataDir(), "pdfs", tenantId);
}

export function getLegacyPdfDir(): string {
  return join(getDataDir(), "pdfs");
}

export function getTenantJobPdfPath(
  jobId: string,
  meta?: { personName?: string; employer?: string },
): string {
  if (meta?.personName && meta?.employer) {
    const name = safeFilePart(meta.personName);
    const company = safeFilePart(meta.employer);
    if (name && company) {
      const shortId = jobId.slice(0, 8);
      return join(getTenantPdfDir(), `${name}_${company}_${shortId}_CV.pdf`);
    }
  }
  return join(getTenantPdfDir(), `resume_${jobId}.pdf`);
}

export function getLegacyJobPdfPath(jobId: string): string {
  return join(getLegacyPdfDir(), `resume_${jobId}.pdf`);
}

export function getTenantDesignResumePdfPath(): string {
  return join(getTenantPdfDir(), "design_resume_current.pdf");
}
