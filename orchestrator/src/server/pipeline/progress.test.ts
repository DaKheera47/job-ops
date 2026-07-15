import { runWithRequestContext } from "@infra/request-context";
import { describe, expect, it } from "vitest";
import { getProgress, progressHelpers, resetProgress } from "./progress";

const inTenant = <T>(tenantId: string, run: () => T) =>
  runWithRequestContext({ requestId: `test-${tenantId}`, tenantId }, run);

describe("pipeline fanout progress", () => {
  it("tracks task and term transitions", () => {
    inTenant("fanout-a", () => {
      resetProgress();
      progressHelpers.initializeFanout({
        roles: ["Backend", "Platform"],
        taskIds: ["jobspy", "gradcracker"],
        locationCount: 3,
        sourceCount: 4,
        capacity: 3,
      });
      progressHelpers.startFanoutTask("jobspy");
      progressHelpers.updateFanoutTaskTerms("jobspy", 1);
      progressHelpers.settleFanoutTask("gradcracker", "check");
      progressHelpers.updateFanoutResults(12, 9);

      expect(getProgress().fanout).toEqual({
        termCount: 2,
        locationCount: 3,
        sourceCount: 4,
        total: 4,
        capacity: 3,
        results: 12,
        unique: 9,
        roles: [
          { role: "Backend", complete: 1, running: 0, queued: 0, check: 1 },
          { role: "Platform", complete: 0, running: 1, queued: 0, check: 1 },
        ],
      });
    });
  });

  it("does not leak fanout state across tenants", () => {
    inTenant("fanout-a", () => {
      resetProgress();
      progressHelpers.initializeFanout({
        roles: ["Backend"],
        taskIds: ["jobspy"],
        locationCount: 1,
        sourceCount: 3,
        capacity: 3,
      });
    });

    inTenant("fanout-b", () => {
      resetProgress();
      expect(getProgress().fanout).toBeUndefined();
    });

    inTenant("fanout-a", () => {
      expect(getProgress().fanout?.roles[0]?.role).toBe("Backend");
    });
  });
});
