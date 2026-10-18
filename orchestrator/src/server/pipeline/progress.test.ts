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
      progressHelpers.updateFanoutTaskTerms("jobspy", "Backend", 0, 6);
      progressHelpers.updateFanoutTaskTerms("jobspy", "Backend", 0, 6);
      progressHelpers.updateFanoutTaskTerms("jobspy", "Backend", 1, 6);
      progressHelpers.updateFanoutTaskTerms("jobspy", "Platform", 1, 6);
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
          { role: "Backend", complete: 3, running: 0, queued: 6, check: 3 },
          { role: "Platform", complete: 0, running: 3, queued: 6, check: 3 },
        ],
      });
    });
  });

  it("keeps completed searches complete through a later challenge and retry", () => {
    inTenant("fanout-challenge", () => {
      resetProgress();
      progressHelpers.initializeFanout({
        roles: ["Backend", "Platform", "Data"],
        tasks: [{ id: "hiringcafe", unitsPerRole: 1 }],
        locations: ["Amsterdam"],
        sources: ["hiringcafe"],
        locationCount: 1,
        sourceCount: 1,
        capacity: 1,
      });

      progressHelpers.startFanoutTask("hiringcafe");
      progressHelpers.updateFanoutTaskTerms("hiringcafe", "Backend", 0, 3);
      progressHelpers.updateFanoutTaskTerms("hiringcafe", "Backend", 1, 3);
      progressHelpers.updateFanoutTaskTerms("hiringcafe", "Platform", 1, 3);
      progressHelpers.settleFanoutTask("hiringcafe", "check");

      expect(getProgress().fanout?.roles).toEqual([
        { role: "Backend", complete: 1, running: 0, queued: 0, check: 0 },
        { role: "Platform", complete: 0, running: 0, queued: 0, check: 1 },
        { role: "Data", complete: 0, running: 0, queued: 1, check: 0 },
      ]);

      progressHelpers.startFanoutTask("hiringcafe");
      progressHelpers.updateFanoutTaskTerms("hiringcafe", "Platform", 1, 3);
      expect(getProgress().fanout?.roles).toEqual([
        { role: "Backend", complete: 1, running: 0, queued: 0, check: 0 },
        { role: "Platform", complete: 0, running: 1, queued: 0, check: 0 },
        { role: "Data", complete: 0, running: 0, queued: 1, check: 0 },
      ]);

      progressHelpers.updateFanoutTaskTerms("hiringcafe", "Platform", 2, 3);
      progressHelpers.updateFanoutTaskTerms("hiringcafe", "Data", 2, 3);
      progressHelpers.updateFanoutTaskTerms("hiringcafe", "Data", 3, 3);
      progressHelpers.settleFanoutTask("hiringcafe", "complete");
      expect(
        getProgress().fanout?.roles.every((role) => role.complete === 1),
      ).toBe(true);
    });
  });

  it("does not reopen completed searches for a detail-page challenge", () => {
    inTenant("fanout-detail-challenge", () => {
      resetProgress();
      progressHelpers.initializeFanout({
        roles: ["Backend"],
        tasks: [{ id: "hiringcafe", unitsPerRole: 1 }],
        locations: ["Amsterdam"],
        sources: ["hiringcafe"],
        locationCount: 1,
        sourceCount: 1,
        capacity: 1,
      });

      progressHelpers.startFanoutTask("hiringcafe");
      progressHelpers.updateFanoutTaskTerms("hiringcafe", "Backend", 0, 1);
      progressHelpers.updateFanoutTaskTerms("hiringcafe", "Backend", 1, 1);
      progressHelpers.settleFanoutTask("hiringcafe", "check");
      progressHelpers.startFanoutTask("hiringcafe");

      expect(getProgress().fanout?.roles).toEqual([
        { role: "Backend", complete: 1, running: 0, queued: 0, check: 0 },
      ]);
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
