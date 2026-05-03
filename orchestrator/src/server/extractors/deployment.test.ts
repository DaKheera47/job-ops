import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("extractor deployment config", () => {
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
});
