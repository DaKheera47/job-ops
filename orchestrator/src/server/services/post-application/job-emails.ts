import { notFound } from "@infra/errors";
import { getJobById } from "@server/repositories/jobs";
import { listPostApplicationMessagesForJob } from "@server/repositories/post-application-messages";
import type {
  PostApplicationJobEmailItem,
  PostApplicationJobEmailsResponse,
  PostApplicationMessage,
} from "@shared/types";

export const DEFAULT_JOB_EMAIL_LIMIT = 100;
export const MAX_JOB_EMAIL_LIMIT = 200;

function buildMessageSourceUrl(message: PostApplicationMessage): string | null {
  if (message.provider !== "gmail" || !message.externalThreadId) return null;
  return `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(
    message.externalThreadId,
  )}`;
}

export async function listJobPostApplicationEmails(
  jobId: string,
  limit = DEFAULT_JOB_EMAIL_LIMIT,
): Promise<PostApplicationJobEmailsResponse> {
  const job = await getJobById(jobId);
  if (!job) {
    throw notFound("Job not found");
  }

  const result = await listPostApplicationMessagesForJob(job.id, limit);
  const items: PostApplicationJobEmailItem[] = result.items.map((item) => ({
    ...item,
    sourceUrl: buildMessageSourceUrl(item.message),
  }));

  return {
    items,
    total: result.total,
  };
}
