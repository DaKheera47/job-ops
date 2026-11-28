import { describe, expect, it, vi } from "vitest";
import {
  buildUpworkApifyInput,
  DEFAULT_UPWORK_APIFY_ACTOR_ID,
} from "../src/fetcher";
import { runUpwork } from "../src/run";
import type { UpworkApifyClient, UpworkApifyItem } from "../src/types";

function createApifyClient(items: UpworkApifyItem[] = []) {
  const call = vi.fn().mockResolvedValue({ defaultDatasetId: "dataset-id" });
  const listItems = vi.fn().mockResolvedValue({ items });
  const actor = vi.fn().mockReturnValue({ call });
  const dataset = vi.fn().mockReturnValue({ listItems });

  return {
    client: { actor, dataset } as UpworkApifyClient,
    actor,
    call,
    dataset,
    listItems,
  };
}

describe("runUpwork", () => {
  it("calls the Apify actor once per term and returns parsed jobs", async () => {
    const apify = createApifyClient([
      {
        id: "backend",
        title: "Backend Engineer",
        url: "https://www.upwork.com/jobs/~backend",
        budget: { amount: 300, currency: "USD" },
      },
    ]);

    const result = await runUpwork({
      searchTerms: ["backend engineer"],
      location: "United States",
      maxJobsPerTerm: 10,
      apifyClient: apify.client,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toHaveLength(1);
    expect(apify.actor).toHaveBeenCalledWith(DEFAULT_UPWORK_APIFY_ACTOR_ID);
    expect(apify.call).toHaveBeenCalledWith(
      buildUpworkApifyInput({
        query: "backend engineer",
        location: "United States",
        maxJobsPerTerm: 10,
      }),
    );
    expect(apify.dataset).toHaveBeenCalledWith("dataset-id");
    expect(apify.listItems).toHaveBeenCalledWith({ limit: 10 });
  });

  it("returns a descriptive error when the Apify actor fails", async () => {
    const apify = createApifyClient();
    apify.call.mockRejectedValue(new Error("Actor call failed with 429"));

    const result = await runUpwork({
      searchTerms: ["backend"],
      apifyClient: apify.client,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain(DEFAULT_UPWORK_APIFY_ACTOR_ID);
    expect(result.error).toContain("backend");
    expect(result.error).toContain("429");
  });

  it("does not call Apify when cancellation is already requested", async () => {
    const apify = createApifyClient();

    const result = await runUpwork({
      searchTerms: ["backend"],
      apifyClient: apify.client,
      shouldCancel: () => true,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toEqual([]);
    expect(apify.actor).not.toHaveBeenCalled();
  });
});
