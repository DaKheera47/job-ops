import fs from "node:fs";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Backup API routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  describe("GET /api/backups", () => {
    it("should return empty array when no backups exist", async () => {
      const res = await fetch(`${baseUrl}/api/backups`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.backups).toEqual([]);
      expect(body.data.nextScheduled).toBeNull();
    });

    it("should list backups with metadata", async () => {
      // Create a backup first
      await fetch(`${baseUrl}/api/backups`, { method: "POST" });

      const res = await fetch(`${baseUrl}/api/backups`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.backups).toHaveLength(1);
      expect(body.data.backups[0]).toHaveProperty("filename");
      expect(body.data.backups[0]).toHaveProperty("type", "manual");
      expect(body.data.backups[0]).toHaveProperty("size");
      expect(body.data.backups[0]).toHaveProperty("createdAt");
    });
  });

  describe("POST /api/backups", () => {
    it("should create a manual backup", async () => {
      const res = await fetch(`${baseUrl}/api/backups`, { method: "POST" });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.type).toBe("manual");
      expect(body.data.filename).toMatch(
        /^jobs_manual_\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2}\.db$/,
      );
      expect(body.data.size).toBeGreaterThan(0);
    });

    it("should return error if database does not exist", async () => {
      // Delete the database
      await fs.promises.unlink(`${tempDir}/jobs.db`);

      const res = await fetch(`${baseUrl}/api/backups`, { method: "POST" });
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
      expect(body.error.message).toContain("Database file not found");
    });
  });

  describe("DELETE /api/backups/:filename", () => {
    it("should delete a backup", async () => {
      // Create a backup first
      const createRes = await fetch(`${baseUrl}/api/backups`, {
        method: "POST",
      });
      const createBody = await createRes.json();
      const filename = createBody.data.filename;

      // Delete the backup
      const deleteRes = await fetch(`${baseUrl}/api/backups/${filename}`, {
        method: "DELETE",
      });
      const deleteBody = await deleteRes.json();

      expect(deleteRes.status).toBe(200);
      expect(deleteBody.ok).toBe(true);
      expect(deleteBody.data.message).toContain("deleted successfully");

      // Verify it's gone
      const listRes = await fetch(`${baseUrl}/api/backups`);
      const listBody = await listRes.json();
      expect(listBody.data.backups).toHaveLength(0);
    });

    it("should return 404 for non-existent backup", async () => {
      const res = await fetch(`${baseUrl}/api/backups/jobs_2026_01_01.db`, {
        method: "DELETE",
      });
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.ok).toBe(false);
      expect(body.error.message).toContain("not found");
    });

    it("should return 400 for invalid filename", async () => {
      const res = await fetch(`${baseUrl}/api/backups/invalid_filename.txt`, {
        method: "DELETE",
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error.message).toContain("Invalid");
    });
  });
});
