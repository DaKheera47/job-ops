import type { ResumeCertificationCatalogItem } from "@shared/types";
import { describe, expect, it } from "vitest";
import * as rc from "./resumeCertifications";

describe("Resume Certifications Logic", () => {
  describe("extractCertificationsFromProfile", () => {
    it("should return empty catalog if profile is invalid", () => {
      const result = rc.extractCertificationsFromProfile({});
      expect(result.catalog).toEqual([]);
    });

    it("should extract valid certifications and map visible flag", () => {
      const profile = {
        sections: {
          certifications: {
            items: [
              {
                id: "c1",
                title: "Cert 1",
                issuer: "Issuer 1",
                date: "2024",
                description: "Desc 1",
                visible: true,
              },
              {
                id: "c2",
                title: "Cert 2",
                issuer: "Issuer 2",
                date: "2023",
                description: "Desc 2",
                visible: false,
              },
              { title: "No ID" } as any, // Should be skipped
            ],
          },
        },
      } as any;

      const { catalog } = rc.extractCertificationsFromProfile(profile);

      expect(catalog).toHaveLength(2);
      expect(catalog[0].id).toBe("c1");
      expect(catalog[0].isVisibleInBase).toBe(true);
      expect(catalog[1].id).toBe("c2");
      expect(catalog[1].isVisibleInBase).toBe(false);
    });
  });

  describe("normalizeResumeCertificationsSettings", () => {
    const allowedIds = new Set(["a", "b", "c", "d"]);

    it("should remove duplicates and enforce allowed IDs", () => {
      const input = {
        maxCertifications: 10,
        lockedCertificationIds: ["a", "a", "z"], // z invalid
        aiSelectableCertificationIds: ["b", "b", "b", "a"], // b valid, a is already locked
      };

      const result = rc.normalizeResumeCertificationsSettings(
        input,
        allowedIds,
      );

      expect(result.lockedCertificationIds).toEqual(["a"]);
      expect(result.aiSelectableCertificationIds).toEqual(["b"]);
    });

    it("should ensure maxCertifications is at least len(locked)", () => {
      const input = {
        maxCertifications: 1, // Too small
        lockedCertificationIds: ["a", "b"],
        aiSelectableCertificationIds: [],
      };

      const result = rc.normalizeResumeCertificationsSettings(
        input,
        allowedIds,
      );
      expect(result.maxCertifications).toBe(2);
    });

    it("should clamp maxCertifications to catalog size", () => {
      const smallAllowed = new Set(["a"]);
      const input = {
        maxCertifications: 5,
        lockedCertificationIds: [],
        aiSelectableCertificationIds: ["a"],
      };

      const result = rc.normalizeResumeCertificationsSettings(
        input,
        smallAllowed,
      );
      expect(result.maxCertifications).toBe(1);
    });
  });

  describe("resolveResumeCertificationsSettings", () => {
    const mockCatalog: ResumeCertificationCatalogItem[] = [
      {
        id: "c1",
        title: "C1",
        issuer: "",
        date: "",
        isVisibleInBase: true,
      },
      {
        id: "c2",
        title: "C2",
        issuer: "",
        date: "",
        isVisibleInBase: false,
      },
      {
        id: "c3",
        title: "C3",
        issuer: "",
        date: "",
        isVisibleInBase: false,
      },
    ];

    it("should return defaults when no override is provided", () => {
      const result = rc.resolveResumeCertificationsSettings({
        catalog: mockCatalog,
        overrideRaw: null,
      });

      // c1 is visible in base, so it should be locked by default
      expect(result.resumeCertifications.lockedCertificationIds).toEqual([
        "c1",
      ]);
      expect(result.resumeCertifications.aiSelectableCertificationIds).toEqual([
        "c2",
        "c3",
      ]);
      expect(result.resumeCertifications.maxCertifications).toBe(3);
    });

    it("should apply valid overrides", () => {
      const validOverride = JSON.stringify({
        maxCertifications: 2,
        lockedCertificationIds: ["c2"],
        aiSelectableCertificationIds: ["c1", "c3"],
      });

      const result = rc.resolveResumeCertificationsSettings({
        catalog: mockCatalog,
        overrideRaw: validOverride,
      });

      expect(result.resumeCertifications.lockedCertificationIds).toEqual(["c2"]);
      expect(result.resumeCertifications.aiSelectableCertificationIds).toContain(
        "c1",
      );
      expect(result.resumeCertifications.aiSelectableCertificationIds).toContain(
        "c3",
      );
      expect(result.resumeCertifications.maxCertifications).toBe(2);
    });

    it("should handle invalid overrides by falling back to defaults", () => {
      const result = rc.resolveResumeCertificationsSettings({
        catalog: mockCatalog,
        overrideRaw: '{"broken json',
      });

      expect(result.overrideResumeCertifications).toBeNull();
      expect(result.resumeCertifications.lockedCertificationIds).toEqual([
        "c1",
      ]);
    });
  });
});
