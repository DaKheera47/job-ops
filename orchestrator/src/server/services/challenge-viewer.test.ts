import { describe, expect, it } from "vitest";
import {
  createChallengeViewerSession,
  revokeChallengeViewerSessions,
} from "./challenge-viewer";

describe("challenge viewer tenant ownership", () => {
  it("issues a viewer token only while its private scope owns the desktop", () => {
    const first = createChallengeViewerSession("scope-a");
    expect(first?.token).toBeTruthy();
    expect(createChallengeViewerSession("scope-b")).toBeNull();

    revokeChallengeViewerSessions("scope-a");
    expect(createChallengeViewerSession("scope-b")?.token).toBeTruthy();
    revokeChallengeViewerSessions("scope-b");
  });
});
