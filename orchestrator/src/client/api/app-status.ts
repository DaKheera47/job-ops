import type { JobOpsAppStatusResponse } from "@shared/types";
import { fetchApi } from "./core";

export async function getAppStatus(): Promise<JobOpsAppStatusResponse> {
  return fetchApi<JobOpsAppStatusResponse>("/app/status");
}
