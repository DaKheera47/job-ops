import { describe, expect, it } from "vitest";
import type { JobQueue } from "./job-queue";
import { InMemoryJobQueue } from "./job-queue-memory";
import {
  __resetJobQueueForTests,
  getJobQueue,
  setJobQueue,
} from "./job-queue-registry";

describe("job queue registry", () => {
  it("allows overriding and resetting the active queue", () => {
    __resetJobQueueForTests();

    const replacement: JobQueue = new InMemoryJobQueue();
    setJobQueue(replacement);
    expect(getJobQueue()).toBe(replacement);

    __resetJobQueueForTests();
    expect(getJobQueue()).not.toBe(replacement);
    expect(getJobQueue()).toBeInstanceOf(InMemoryJobQueue);
  });
});
