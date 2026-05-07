export const JOB_QUEUE_NAMES = ["auto_pdf_regeneration"] as const;

export type JobQueueName = (typeof JOB_QUEUE_NAMES)[number];

export type AutoPdfRegenerationReason =
  | "design_resume_updated"
  | "tailoring_updated"
  | "settings_changed"
  | "manual_refresh";

export interface AutoPdfRegenerationJobPayload {
  tenantId: string;
  jobId: string;
  reason: AutoPdfRegenerationReason;
  requestedAt: string;
  requestedBy: "system" | "user";
}

export interface JobQueuePayloadByName {
  auto_pdf_regeneration: AutoPdfRegenerationJobPayload;
}

export interface EnqueueJobOptions {
  dedupeKey?: string;
  delayMs?: number;
  priority?: number;
}

export interface EnqueueJobResult {
  id: string;
  queue: JobQueueName;
  acceptedAt: string;
  deduplicated: boolean;
  dedupeKey?: string;
}

export interface QueueJobRecord<K extends JobQueueName = JobQueueName> {
  id: string;
  queue: K;
  payload: JobQueuePayloadByName[K];
  acceptedAt: string;
  options?: EnqueueJobOptions;
}

export interface JobQueue {
  enqueue<K extends JobQueueName>(
    queue: K,
    payload: JobQueuePayloadByName[K],
    options?: EnqueueJobOptions,
  ): Promise<EnqueueJobResult>;

  reserveNext<K extends JobQueueName>(
    queue: K,
  ): Promise<QueueJobRecord<K> | null>;

  acknowledge(jobId: string): Promise<void>;

  reject(jobId: string): Promise<void>;
}
