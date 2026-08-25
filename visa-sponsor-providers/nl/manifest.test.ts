import { afterEach, describe, expect, it, vi } from "vitest";
import manifest, { parseIndRegisterHtml } from "./manifest";

// Mirrors the real IND register table markup (verified 2026-07-11).
const registerHtml = `
  <table>
    <thead>
      <tr>
        <th scope="col">Organisation</th>
        <th scope="col">KvK number</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <th scope="row">Machinefabriek en Staalbouw Nederland B.V.</th>
        <td>16051874</td>
      </tr>
      <tr>
        <th scope="row">@EasePay B.V.</th>
        <td>83892869</td>
      </tr>
      <tr>
        <th scope="row">Adyen N.V.</th>
        <td>34259528</td>
      </tr>
      <tr>
        <th scope="row">Ampersand &amp; Co</th>
        <td></td>
      </tr>
    </tbody>
  </table>
`;

describe("NL visa sponsor provider manifest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses organisation rows from the IND register table", () => {
    const sponsors = parseIndRegisterHtml(registerHtml);

    expect(sponsors).toHaveLength(4);
    expect(sponsors[0]).toEqual({
      organisationName: "Machinefabriek en Staalbouw Nederland B.V.",
      townCity: "",
      county: "",
      typeRating: "Recognised sponsor (KvK 16051874)",
      route: "Work / Highly skilled migrant",
    });
    expect(sponsors[2].organisationName).toBe("Adyen N.V.");
  });

  it("decodes HTML entities and tolerates a missing KvK number", () => {
    const sponsors = parseIndRegisterHtml(registerHtml);

    expect(sponsors[3].organisationName).toBe("Ampersand & Co");
    expect(sponsors[3].typeRating).toBe("Recognised sponsor");
  });

  it("ignores header rows and non-row markup", () => {
    const sponsors = parseIndRegisterHtml(
      '<th scope="col">Organisation</th><td>ignored</td>',
    );

    expect(sponsors).toHaveLength(0);
  });

  it("fetches and parses the register page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(registerHtml));
    vi.stubGlobal("fetch", fetchMock);

    const sponsors = await manifest.fetchSponsors();

    expect(sponsors).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws an actionable error when the page yields no sponsors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("<html><body>maintenance</body></html>"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(manifest.fetchSponsors()).rejects.toThrow(
      "Could not find any recognised sponsors in the IND register page",
    );
  });

  it("throws when the register page is unreachable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("gone", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(manifest.fetchSponsors()).rejects.toThrow(
      "Failed to fetch IND register page: 503",
    );
  });
});
