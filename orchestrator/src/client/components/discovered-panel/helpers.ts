import { stripHtml } from "@/lib/utils";
import type { Job } from "../../../shared/types";

export const getPlainDescription = (jobDescription?: string | null) => {
  if (!jobDescription) return "No description available.";
  if (jobDescription.includes("<") && jobDescription.includes(">")) {
    return stripHtml(jobDescription);
  }
  return jobDescription;
};
