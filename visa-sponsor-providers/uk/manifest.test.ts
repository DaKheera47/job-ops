import { afterEach, describe, expect, it, vi } from "vitest";
import manifest, {
  extractWorkerTemporaryWorkerCsvUrl,
  pickWorkerTemporaryWorkerCsvAttachment,
} from "./manifest";

const currentWorkerCsvUrl =
  "https://assets.publishing.service.gov.uk/media/6a43a38a1a04d4dae8b814a9/SP_-_Worker_and_Temporary_Worker_Web_Register_-_2026-06-30.csv";

// Shape mirrors the real GOV.UK Content API response for this publication.
const contentApiPayload = {
  details: {
    attachments: [
      {
        title: "Register of Worker and Temporary Worker licensed sponsors",
        url: currentWorkerCsvUrl,
        content_type: "text/csv",
      },
    ],
  },
};

const sponsorCsv = [
  "Organisation Name,Town/City,County,Type & Rating,Route",
  'ACME Robotics Ltd,London,Greater London,"Worker (A rating)",Skilled Worker',
].join("\n");

describe("UK visa sponsor provider manifest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts the current GOV.UK Worker and Temporary Worker CSV URL", () => {
    const html = `<a href="${currentWorkerCsvUrl}">Register of Worker and Temporary Worker licensed sponsors</a>`;

    expect(extractWorkerTemporaryWorkerCsvUrl(html)).toBe(currentWorkerCsvUrl);
  });

  it("ignores unrelated GOV.UK CSV links", () => {
    const html = `
      <a href="https://assets.publishing.service.gov.uk/media/123/Student_Sponsor_Register.csv">Student sponsors</a>
      <a href="/csv-preview/123/SP_-_Worker_and_Temporary_Worker_Web_Register_-_2026-06-30.csv">View online</a>
    `;

    expect(extractWorkerTemporaryWorkerCsvUrl(html)).toBeNull();
  });

  it("picks the Worker and Temporary Worker CSV attachment from the Content API payload", () => {
    expect(pickWorkerTemporaryWorkerCsvAttachment(contentApiPayload)).toBe(
      currentWorkerCsvUrl,
    );
  });

  it("ignores non-CSV and unrelated Content API attachments", () => {
    expect(
      pickWorkerTemporaryWorkerCsvAttachment({
        details: {
          attachments: [
            {
              title: "Sponsor guidance",
              url: "https://x/guide.pdf",
              content_type: "application/pdf",
            },
            {
              title: "Register of student sponsors",
              url: "https://x/students.csv",
              content_type: "text/csv",
            },
          ],
        },
      }),
    ).toBeNull();
    expect(pickWorkerTemporaryWorkerCsvAttachment(null)).toBeNull();
    expect(pickWorkerTemporaryWorkerCsvAttachment({})).toBeNull();
  });

  it("resolves the CSV via the Content API without touching the HTML page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(contentApiPayload))
      .mockResolvedValueOnce(new Response(sponsorCsv));
    vi.stubGlobal("fetch", fetchMock);

    const sponsors = await manifest.fetchSponsors();

    expect(sponsors).toHaveLength(1);
    expect(sponsors[0].organisationName).toBe("ACME Robotics Ltd");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(currentWorkerCsvUrl);
  });

  it("falls back to the HTML scrape when the Content API fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("upstream error", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(
          `<a href="${currentWorkerCsvUrl}">Register of Worker and Temporary Worker licensed sponsors</a>`,
        ),
      )
      .mockResolvedValueOnce(new Response(sponsorCsv));
    vi.stubGlobal("fetch", fetchMock);

    const sponsors = await manifest.fetchSponsors();

    expect(sponsors).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("falls back when the Content API returns invalid JSON", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("<html>not json</html>"))
      .mockResolvedValueOnce(
        new Response(
          `<a href="${currentWorkerCsvUrl}">Register of Worker and Temporary Worker licensed sponsors</a>`,
        ),
      )
      .mockResolvedValueOnce(new Response(sponsorCsv));
    vi.stubGlobal("fetch", fetchMock);

    await expect(manifest.fetchSponsors()).resolves.toHaveLength(1);
  });

  it("keeps the existing failure path when both sources miss the CSV link", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ details: { attachments: [] } }))
      .mockResolvedValueOnce(
        new Response(
          '<a href="https://assets.publishing.service.gov.uk/media/123/Student_Sponsor_Register.csv">Student sponsors</a>',
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(manifest.fetchSponsors()).rejects.toThrow(
      "Could not find Worker and Temporary Worker CSV link on gov.uk page",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
