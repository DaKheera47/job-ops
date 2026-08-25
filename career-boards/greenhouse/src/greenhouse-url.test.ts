import { describe, expect, it } from "vitest";
import {
  extractGreenhouseTokenFromHtml,
  greenhouseJobApiUrl,
  greenhouseTokenToLabel,
  guessTokensFromHostname,
  isGreenhouseUrl,
  parseGreenhouseJobApiUrl,
  parseGreenhouseUrl,
} from "./greenhouse-url";

describe("parseGreenhouseUrl", () => {
  it("parses a job-boards.greenhouse.io URL", () => {
    const parsed = parseGreenhouseUrl(
      "https://job-boards.greenhouse.io/riotgames",
    );
    expect(parsed.token).toBe("riotgames");
    expect(parsed.canonicalCareersUrl).toBe(
      "https://job-boards.greenhouse.io/riotgames",
    );
    expect(parsed.boardJobsUrl).toBe(
      "https://boards-api.greenhouse.io/v1/boards/riotgames/jobs",
    );
  });

  it("parses a legacy boards.greenhouse.io URL with a job path", () => {
    expect(
      parseGreenhouseUrl(
        "https://boards.greenhouse.io/epicgames/jobs/6103058004",
      ).token,
    ).toBe("epicgames");
  });

  it("parses an embed URL that carries the token in ?for=", () => {
    expect(
      parseGreenhouseUrl(
        "https://boards.greenhouse.io/embed/job_board?for=stripe",
      ).token,
    ).toBe("stripe");
  });

  it("parses a boards-api URL", () => {
    expect(
      parseGreenhouseUrl(
        "https://boards-api.greenhouse.io/v1/boards/riotgames/jobs",
      ).token,
    ).toBe("riotgames");
  });

  it("rejects non-greenhouse hosts", () => {
    expect(() =>
      parseGreenhouseUrl("https://www.riotgames.com/en/work-with-us"),
    ).toThrow(/Unsupported Greenhouse host/);
    expect(isGreenhouseUrl("https://www.riotgames.com/en/work-with-us")).toBe(
      false,
    );
  });

  it("rejects empty and malformed input", () => {
    expect(() => parseGreenhouseUrl("   ")).toThrow(/empty/i);
    expect(() => parseGreenhouseUrl("not a url")).toThrow(/Invalid URL/);
  });
});

describe("parseGreenhouseJobApiUrl", () => {
  it("extracts token + job id", () => {
    expect(
      parseGreenhouseJobApiUrl(greenhouseJobApiUrl("epicgames", "6103058004")),
    ).toEqual({ token: "epicgames", jobId: "6103058004" });
  });

  it("throws on a non-job URL", () => {
    expect(() =>
      parseGreenhouseJobApiUrl("https://job-boards.greenhouse.io/epicgames"),
    ).toThrow(/Greenhouse job API URL/);
  });
});

describe("extractGreenhouseTokenFromHtml", () => {
  it("extracts the token from the classic embed script", () => {
    const html = `<script src="https://boards.greenhouse.io/embed/job_board/js?for=riotgames"></script>`;
    expect(extractGreenhouseTokenFromHtml(html)).toBe("riotgames");
  });

  it("extracts the token from a board API reference", () => {
    const html = `fetch("https://boards-api.greenhouse.io/v1/boards/epicgames/jobs")`;
    expect(extractGreenhouseTokenFromHtml(html)).toBe("epicgames");
  });

  it("returns null when no board is embedded", () => {
    expect(extractGreenhouseTokenFromHtml("<html>no board here</html>")).toBe(
      null,
    );
  });

  it("never returns a structural path segment as a token", () => {
    const html = `<a href="https://job-boards.greenhouse.io/embed/job_board?for=stripe">`;
    expect(extractGreenhouseTokenFromHtml(html)).toBe("stripe");
  });
});

describe("guessTokensFromHostname", () => {
  it("derives the registrable label first", () => {
    expect(guessTokensFromHostname("www.epicgames.com")[0]).toBe("epicgames");
    expect(guessTokensFromHostname("riotgames.com")[0]).toBe("riotgames");
  });

  it("handles multi-part public suffixes", () => {
    expect(guessTokensFromHostname("careers.example.co.uk")).toContain(
      "example",
    );
  });

  it("returns an empty list for empty input", () => {
    expect(guessTokensFromHostname("")).toEqual([]);
  });
});

describe("greenhouseTokenToLabel", () => {
  it("title-cases hyphenated tokens", () => {
    expect(greenhouseTokenToLabel("acme-corp")).toBe("Acme Corp");
  });
});
