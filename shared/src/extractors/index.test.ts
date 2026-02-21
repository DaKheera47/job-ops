import { describe, expect, it } from "vitest";
import {
  EXTRACTOR_SOURCE_IDS,
  EXTRACTOR_SOURCE_METADATA,
  extractorSourceEnum,
  isExtractorSourceId,
} from "./index";

describe("extractor source catalog", () => {
  it("validates known source ids", () => {
    for (const source of EXTRACTOR_SOURCE_IDS) {
      expect(extractorSourceEnum.parse(source)).toBe(source);
      expect(isExtractorSourceId(source)).toBe(true);
    }
  });

  it("rejects unknown source ids", () => {
    expect(isExtractorSourceId("unknown-source")).toBe(false);
    expect(() => extractorSourceEnum.parse("unknown-source")).toThrow();
  });

  it("provides metadata for every known source", () => {
    for (const source of EXTRACTOR_SOURCE_IDS) {
      expect(EXTRACTOR_SOURCE_METADATA[source]).toBeDefined();
      expect(EXTRACTOR_SOURCE_METADATA[source].label.length).toBeGreaterThan(0);
    }
  });
});
