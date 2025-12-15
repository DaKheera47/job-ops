import type { Job } from "@shared/types";

const pushLine = (lines: string[], label: string, value: unknown) => {
  if (value == null) return;
  const normalized = typeof value === "string" ? value.trim() : String(value);
  if (!normalized) return;
  lines.push(`${label}: ${normalized}`);
};

const pushBlock = (lines: string[], heading: string, value: string | null | undefined) => {
  const normalized = value?.trim();
  if (!normalized) return;
  lines.push("");
  lines.push(`${heading}:`);
  lines.push(normalized);
};

export const formatJobForLlmContext = (job: Job) => {
  const jobLink = job.applicationLink || job.jobUrl;

  const lines: string[] = [];
  lines.push("JOB CONTEXT");

  pushLine(lines, "Title", job.title);
  pushLine(lines, "Company", job.employer);
  pushLine(lines, "Source", job.source);
  pushLine(lines, "Status", job.status);

  pushLine(lines, "Job URL", job.jobUrl);
  pushLine(lines, "Application link", job.applicationLink);
  pushLine(lines, "Best link", jobLink);
  pushLine(lines, "Direct URL", job.jobUrlDirect);
  pushLine(lines, "Source job id", job.sourceJobId);

  pushLine(lines, "Location", job.location);
  pushLine(lines, "Remote", job.isRemote);
  pushLine(lines, "Disciplines", job.disciplines);
  pushLine(lines, "Job type", job.jobType);
  pushLine(lines, "Job level", job.jobLevel);
  pushLine(lines, "Job function", job.jobFunction);
  pushLine(lines, "Listing type", job.listingType);

  pushLine(lines, "Salary", job.salary);
  if (job.salaryMinAmount != null || job.salaryMaxAmount != null) {
    pushLine(
      lines,
      "Salary range",
      [
        job.salaryMinAmount != null ? String(job.salaryMinAmount) : null,
        job.salaryMaxAmount != null ? String(job.salaryMaxAmount) : null,
      ]
        .filter(Boolean)
        .join(" - "),
    );
  }
  pushLine(lines, "Salary interval", job.salaryInterval);
  pushLine(lines, "Salary currency", job.salaryCurrency);
  pushLine(lines, "Salary source", job.salarySource);

  pushLine(lines, "Degree required", job.degreeRequired);
  pushLine(lines, "Starting", job.starting);
  pushLine(lines, "Deadline", job.deadline);
  pushLine(lines, "Date posted", job.datePosted);

  pushLine(lines, "Skills", job.skills);
  pushLine(lines, "Experience", job.experienceRange);
  pushLine(lines, "Emails", job.emails);

  pushLine(lines, "Company industry", job.companyIndustry);
  pushLine(lines, "Company URL", job.companyUrlDirect || job.employerUrl);
  pushLine(lines, "Company employees", job.companyNumEmployees);
  pushLine(lines, "Company revenue", job.companyRevenue);
  pushLine(lines, "Company rating", job.companyRating);
  pushLine(lines, "Company reviews", job.companyReviewsCount);
  pushLine(lines, "Company addresses", job.companyAddresses);

  pushLine(lines, "Discovered", job.discoveredAt);
  pushLine(lines, "Processed", job.processedAt);

  pushBlock(lines, "Job description", job.jobDescription);
  pushBlock(lines, "Company description", job.companyDescription);

  return lines.join("\n").trim() + "\n";
};

export async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!ok) {
    throw new Error("Copy failed");
  }
}
