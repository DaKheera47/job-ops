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
        tasks: [
          { id: "jobspy", unitsPerRole: 9 },
          { id: "gradcracker", unitsPerRole: 3 },
        ],
        locations: ["Manchester", "London", "Leeds"],
        sources: ["indeed", "linkedin", "glassdoor", "gradcracker"],
        locationCount: 3,
        sourceCount: 4,
        capacity: 3,
      });
      progressHelpers.startFanoutTask("jobspy");
      progressHelpers.updateFanoutTaskTerms("jobspy", 1, 6);
      progressHelpers.settleFanoutTask("gradcracker", "check");
      progressHelpers.updateFanoutResults(12, 9);

      expect(getProgress().fanout).toEqual({
        termCount: 2,
        locationCount: 3,
        sourceCount: 4,
        locations: ["Manchester", "London", "Leeds"],
        sources: ["indeed", "linkedin", "glassdoor", "gradcracker"],
        total: 24,
        capacity: 3,
        results: 12,
        unique: 9,
        roles: [
          { role: "Backend", complete: 3, running: 3, queued: 3, check: 3 },
          { role: "Platform", complete: 0, running: 0, queued: 9, check: 3 },
        ],
      });
    });
  });

  it("does not leak fanout state across tenants", () => {
    inTenant("fanout-a", () => {
      resetProgress();
      progressHelpers.initializeFanout({
        roles: ["Backend"],
        tasks: [{ id: "jobspy", unitsPerRole: 3 }],
        locations: ["Manchester"],
        sources: ["indeed", "linkedin", "glassdoor"],
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
