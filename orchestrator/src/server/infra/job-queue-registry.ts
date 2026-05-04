import type { JobQueue } from "./job-queue";
import { InMemoryJobQueue } from "./job-queue-memory";

let activeJobQueue: JobQueue = new InMemoryJobQueue();

export function getJobQueue(): JobQueue {
  return activeJobQueue;
}

export function setJobQueue(queue: JobQueue): void {
  activeJobQueue = queue;
}

export function __resetJobQueueForTests(): void {
  activeJobQueue = new InMemoryJobQueue();
}
