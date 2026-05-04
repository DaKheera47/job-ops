import { randomUUID } from "node:crypto";
import type {
  EnqueueJobOptions,
  EnqueueJobResult,
  JobQueue,
  QueueJobRecord,
} from "./job-queue";

type InMemoryJobState = "pending" | "reserved";

type InMemoryJobRecord = QueueJobRecord & {
  state: InMemoryJobState;
  dedupeKey?: string;
};

export class InMemoryJobQueue implements JobQueue {
  private readonly jobs = new Map<string, InMemoryJobRecord>();
  private readonly queueOrder: string[] = [];
  private readonly dedupeIndex = new Map<string, string>();

  async enqueue<K extends QueueJobRecord["queue"]>(
    queue: K,
    payload: QueueJobRecord<K>["payload"],
    options?: EnqueueJobOptions,
  ): Promise<EnqueueJobResult> {
    const dedupeKey = options?.dedupeKey?.trim();
    const normalizedDedupeKey =
      dedupeKey && dedupeKey.length > 0 ? dedupeKey : undefined;

    if (normalizedDedupeKey) {
      const indexKey = this.toDedupeIndexKey(queue, normalizedDedupeKey);
      const existingId = this.dedupeIndex.get(indexKey);
      if (existingId) {
        const existingJob = this.jobs.get(existingId);
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

    this.jobs.set(id, {
      id,
      queue,
      payload,
      acceptedAt,
      options,
      state: "pending",
      dedupeKey: normalizedDedupeKey,
    });
    this.queueOrder.push(id);

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

  async reserveNext<K extends QueueJobRecord["queue"]>(
    queue: K,
  ): Promise<QueueJobRecord<K> | null> {
    for (const jobId of this.queueOrder) {
      const job = this.jobs.get(jobId);
      if (!job || job.state !== "pending") continue;
      if (job.queue !== queue) continue;

      job.state = "reserved";
      return {
        id: job.id,
        queue: job.queue as K,
        payload: job.payload as QueueJobRecord<K>["payload"],
        acceptedAt: job.acceptedAt,
        options: job.options,
      };
    }

    return null;
  }

  async acknowledge(jobId: string): Promise<void> {
    this.deleteJob(jobId);
  }

  async reject(jobId: string): Promise<void> {
    this.deleteJob(jobId);
  }

  getQueuedJobs(): QueueJobRecord[] {
    const queued: QueueJobRecord[] = [];
    for (const jobId of this.queueOrder) {
      const job = this.jobs.get(jobId);
      if (!job) continue;
      queued.push({
        id: job.id,
        queue: job.queue,
        payload: job.payload,
        acceptedAt: job.acceptedAt,
        options: job.options,
      });
    }
    return queued;
  }

  clear(): void {
    this.jobs.clear();
    this.queueOrder.length = 0;
    this.dedupeIndex.clear();
  }

  private deleteJob(jobId: string): void {
    const record = this.jobs.get(jobId);
    if (!record) return;
    this.jobs.delete(jobId);
    const index = this.queueOrder.indexOf(jobId);
    if (index >= 0) {
      this.queueOrder.splice(index, 1);
    }
    if (record.dedupeKey) {
      this.dedupeIndex.delete(
        this.toDedupeIndexKey(record.queue, record.dedupeKey),
      );
    }
  }

  private toDedupeIndexKey(
    queue: QueueJobRecord["queue"],
    dedupeKey: string,
  ): string {
    return `${queue}:${dedupeKey}`;
  }
}
