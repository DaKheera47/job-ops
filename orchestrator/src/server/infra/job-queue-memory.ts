import { randomUUID } from "node:crypto";
import type {
  EnqueueJobOptions,
  EnqueueJobResult,
  JobQueue,
  JobQueueName,
  JobQueuePayloadByName,
} from "./job-queue";

export interface InMemoryQueuedJob<K extends JobQueueName = JobQueueName> {
  id: string;
  queue: K;
  payload: JobQueuePayloadByName[K];
  acceptedAt: string;
  options?: EnqueueJobOptions;
}

export class InMemoryJobQueue implements JobQueue {
  private readonly queuedJobs: InMemoryQueuedJob[] = [];
  private readonly dedupeIndex = new Map<string, string>();

  async enqueue<K extends JobQueueName>(
    queue: K,
    payload: JobQueuePayloadByName[K],
    options?: EnqueueJobOptions,
  ): Promise<EnqueueJobResult> {
    const dedupeKey = options?.dedupeKey?.trim();
    const normalizedDedupeKey =
      dedupeKey && dedupeKey.length > 0 ? dedupeKey : undefined;

    if (normalizedDedupeKey) {
      const indexKey = this.toDedupeIndexKey(queue, normalizedDedupeKey);
      const existingId = this.dedupeIndex.get(indexKey);
      if (existingId) {
        const existingJob = this.queuedJobs.find(
          (job) => job.id === existingId,
        );
        if (existingJob) {
          return {
            id: existingJob.id,
            queue,
            acceptedAt: existingJob.acceptedAt,
            deduplicated: true,
            dedupeKey: normalizedDedupeKey,
          };
        }
      }
    }

    const acceptedAt = new Date().toISOString();
    const id = randomUUID();

    this.queuedJobs.push({
      id,
      queue,
      payload,
      acceptedAt,
      options,
    });

    if (normalizedDedupeKey) {
      this.dedupeIndex.set(
        this.toDedupeIndexKey(queue, normalizedDedupeKey),
        id,
      );
    }

    return {
      id,
      queue,
      acceptedAt,
      deduplicated: false,
      dedupeKey: normalizedDedupeKey,
    };
  }

  getQueuedJobs(): InMemoryQueuedJob[] {
    return [...this.queuedJobs];
  }

  clear(): void {
    this.queuedJobs.length = 0;
    this.dedupeIndex.clear();
  }

  private toDedupeIndexKey(queue: JobQueueName, dedupeKey: string): string {
    return `${queue}:${dedupeKey}`;
  }
}
