import { afterEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  instances: [] as Array<{
    read: ReturnType<typeof vi.fn>;
    canWaitForChallenge: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("hiringcafe-extractor/src/browser-pages", () => ({
  HiringCafeBrowserPages: class {
    read = vi.fn(async () => ({
      status: 200,
      html: "<html/>",
      challenged: false,
    }));
    waitForChallenge = vi.fn(async () => "clear");
    canWaitForChallenge = vi.fn(() => false);
    close = vi.fn(async () => undefined);
    constructor() {
      mock.instances.push(this);
    }
  },
}));

import {
  closeHiringCafeBrowser,
  readHiringCafeBrowserPage,
} from "./hiring-cafe-browser";

describe("Hiring Cafe browser scope", () => {
  afterEach(async () => {
    await closeHiringCafeBrowser("tenant-a:user-a");
    await closeHiringCafeBrowser("tenant-b:user-b");
    mock.instances.length = 0;
  });

  it("keeps separate browser sessions for two private scopes", async () => {
    const url = "https://hiringcafe.com/";
    await readHiringCafeBrowserPage("tenant-a:user-a", "/tmp/a", url);
    await readHiringCafeBrowserPage("tenant-b:user-b", "/tmp/b", url);
    await readHiringCafeBrowserPage("tenant-a:user-a", "/tmp/a", url);

    expect(mock.instances).toHaveLength(2);
    expect(mock.instances[0].read).toHaveBeenCalledTimes(2);
    expect(mock.instances[1].read).toHaveBeenCalledTimes(1);

    await closeHiringCafeBrowser("tenant-a:user-a");
    expect(mock.instances[0].close).toHaveBeenCalledOnce();
    expect(mock.instances[1].close).not.toHaveBeenCalled();
  });
});
