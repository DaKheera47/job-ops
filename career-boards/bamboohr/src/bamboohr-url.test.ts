import { describe, expect, it } from "vitest";
import {
  bamboohrUrlToCompanyLabel,
  bamboohrUrlToSourceKey,
  parseBamboohrJobUrl,
  parseBamboohrUrl,
} from "./bamboohr-url";

describe("parseBamboohrUrl", () => {
  it("canonicalizes careers list and detail URLs to the careers root", () => {
    expect(
      parseBamboohrUrl("https://ashteadtechnology.bamboohr.com/careers/list"),
    ).toMatchObject({
      canonicalCareersUrl: "https://ashteadtechnology.bamboohr.com/careers",
      listUrl: "https://ashteadtechnology.bamboohr.com/careers/list",
      companyInfoUrl:
        "https://ashteadtechnology.bamboohr.com/careers/company-info",
    });

    expect(
      parseBamboohrUrl(
        "https://ashteadtechnology.bamboohr.com/careers/134/detail",
      ).canonicalCareersUrl,
    ).toBe("https://ashteadtechnology.bamboohr.com/careers");
  });

  it("derives the company label and source key from the BambooHR subdomain", () => {
    expect(
      bamboohrUrlToCompanyLabel("https://acme-inc.bamboohr.com/careers"),
    ).toBe("Acme Inc");
    expect(
      bamboohrUrlToSourceKey("https://acme-inc.bamboohr.com/careers"),
    ).toBe("bamboohr:acme-inc");
  });

  it("parses job URLs into canonical detail endpoints", () => {
    expect(
      parseBamboohrJobUrl("https://ashteadtechnology.bamboohr.com/careers/134"),
    ).toMatchObject({
      jobId: "134",
      canonicalJobUrl: "https://ashteadtechnology.bamboohr.com/careers/134",
      detailUrl: "https://ashteadtechnology.bamboohr.com/careers/134/detail",
    });
  });
});
