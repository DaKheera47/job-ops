import { afterEach, describe, expect, it, vi } from "vitest";
import manifest, { extractWorkerTemporaryWorkerCsvUrl } from "./manifest";

const currentWorkerCsvUrl =
  "https://assets.publishing.service.gov.uk/media/6a43a38a1a04d4dae8b814a9/SP_-_Worker_and_Temporary_Worker_Web_Register_-_2026-06-30.csv";
const legacyWorkerCsvUrl =
  "https://assets.publishing.service.gov.uk/media/123/Worker_and_Temporary_Worker.csv";

describe("UK visa sponsor provider manifest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts the current GOV.UK Worker and Temporary Worker CSV URL", () => {
    const html = `<a href="${currentWorkerCsvUrl}">Register of Worker and Temporary Worker licensed sponsors</a>`;

    expect(extractWorkerTemporaryWorkerCsvUrl(html)).toBe(currentWorkerCsvUrl);
  });

  it("extracts the older exact-style Worker and Temporary Worker CSV URL", () => {
    const html = `<a href="${legacyWorkerCsvUrl}">Download CSV</a>`;

    expect(extractWorkerTemporaryWorkerCsvUrl(html)).toBe(legacyWorkerCsvUrl);
  });

  it("ignores unrelated GOV.UK CSV links", () => {
    const html = `
      <a href="https://assets.publishing.service.gov.uk/media/123/Student_Sponsor_Register.csv">Student sponsors</a>
      <a href="/csv-preview/123/SP_-_Worker_and_Temporary_Worker_Web_Register_-_2026-06-30.csv">View online</a>
    `;

    expect(extractWorkerTemporaryWorkerCsvUrl(html)).toBeNull();
  });

  it("keeps the existing failure path when the matching CSV link is missing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          '<a href="https://assets.publishing.service.gov.uk/media/123/Student_Sponsor_Register.csv">Student sponsors</a>',
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(manifest.fetchSponsors()).rejects.toThrow(
      "Could not find Worker and Temporary Worker CSV link on gov.uk page",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
