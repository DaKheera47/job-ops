import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("extractor deployment config", () => {
  it("ships the BambooHR career board package in Docker runtime images", async () => {
    const dockerfile = await readFile(resolve(process.cwd(), "../Dockerfile"), {
      encoding: "utf8",
    });

    expect(dockerfile).toContain(
      "COPY career-boards/bamboohr/package*.json ./career-boards/bamboohr/",
    );
    expect(dockerfile).toContain(
      "COPY career-boards/bamboohr ./career-boards/bamboohr",
    );
  });

  it("ships the Workday career board package in Docker runtime images", async () => {
    const dockerfile = await readFile(resolve(process.cwd(), "../Dockerfile"), {
      encoding: "utf8",
    });

    expect(dockerfile).toContain(
      "COPY career-boards/workday/package*.json ./career-boards/workday/",
    );
    expect(dockerfile).toContain(
      "COPY career-boards/workday ./career-boards/workday",
    );
  });

  it("ships the Naukri extractor in Docker runtime images", async () => {
    const dockerfile = await readFile(resolve(process.cwd(), "../Dockerfile"), {
      encoding: "utf8",
    });

    expect(dockerfile).toContain(
      "COPY extractors/naukri/package*.json ./extractors/naukri/",
    );
    expect(dockerfile).toContain("COPY extractors/naukri ./extractors/naukri");
  });

  it("ships the Jobindex extractor in Docker runtime images", async () => {
    const dockerfile = await readFile(resolve(process.cwd(), "../Dockerfile"), {
      encoding: "utf8",
    });

    expect(dockerfile).toContain(
      "COPY extractors/jobindex/package*.json ./extractors/jobindex/",
    );
    expect(dockerfile).toContain(
      "COPY extractors/jobindex ./extractors/jobindex",
    );
  });

  it("installs the Node Playwright Firefox binary for browser fallbacks", async () => {
    const dockerfile = await readFile(resolve(process.cwd(), "../Dockerfile"), {
      encoding: "utf8",
    });

    expect(dockerfile).toContain(
      "./node_modules/.bin/playwright install firefox",
    );
  });

  it("bakes Camoufox GeoLite data during Docker builds", async () => {
    const dockerfile = await readFile(resolve(process.cwd(), "../Dockerfile"), {
      encoding: "utf8",
    });
    const fetchScript = await readFile(
      resolve(process.cwd(), "../scripts/camoufox-fetch.mjs"),
      { encoding: "utf8" },
    );

    expect(dockerfile).toContain("node ./scripts/camoufox-fetch.mjs");
    expect(fetchScript).toContain(
      'import { downloadMMDB } from "camoufox-js/dist/locale.js";',
    );
    expect(fetchScript).toContain("await downloadMMDB();");
  });

  it("syncs the Naukri extractor in compose development mode", async () => {
    const composeFile = await readFile(
      resolve(process.cwd(), "../docker-compose.yml"),
      { encoding: "utf8" },
    );

    expect(composeFile).toContain("path: ./extractors/naukri");
    expect(composeFile).toContain("target: /app/extractors/naukri");
  });

  it("syncs the Jobindex extractor in compose development mode", async () => {
    const composeFile = await readFile(
      resolve(process.cwd(), "../docker-compose.yml"),
      { encoding: "utf8" },
    );

    expect(composeFile).toContain("path: ./extractors/jobindex/src");
    expect(composeFile).toContain("target: /app/extractors/jobindex/src");
  });

  it("syncs the Workday career board package in compose development mode", async () => {
    const composeFile = await readFile(
      resolve(process.cwd(), "../docker-compose.yml"),
      { encoding: "utf8" },
    );

    expect(composeFile).toContain("path: ./career-boards/workday/src");
    expect(composeFile).toContain("target: /app/career-boards/workday/src");
  });

  it("syncs the BambooHR career board package in compose development mode", async () => {
    const composeFile = await readFile(
      resolve(process.cwd(), "../docker-compose.yml"),
      { encoding: "utf8" },
    );

    expect(composeFile).toContain("path: ./career-boards/bamboohr/src");
    expect(composeFile).toContain("target: /app/career-boards/bamboohr/src");
  });
});
