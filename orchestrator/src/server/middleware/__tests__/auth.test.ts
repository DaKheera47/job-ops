import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { requireAuth, requireReauth } from "../auth";
import { issueAccessToken, issueReauthToken } from "@server/lib/tokens";

// Set env before importing
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-chars!!";

function createTestApp(middleware: express.RequestHandler) {
  const app = express();
  app.use(express.json());
  app.use(middleware);
  app.get("/test", (req, res) => {
    res.json({ auth: (req as any).auth });
  });
  return app;
}

describe("requireAuth", () => {
  it("returns 401 without Authorization header", async () => {
    const app = createTestApp(requireAuth);
    const res = await request(app).get("/test");
    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid token", async () => {
    const app = createTestApp(requireAuth);
    const res = await request(app)
      .get("/test")
      .set("Authorization", "Bearer invalid-token");
    expect(res.status).toBe(401);
  });

  it("passes with valid access token", async () => {
    const app = createTestApp(requireAuth);
    const token = issueAccessToken("admin-1", process.env.JWT_SECRET!);
    const res = await request(app)
      .get("/test")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.auth.adminId).toBe("admin-1");
  });

  it("rejects refresh token used as access token", async () => {
    const { issueRefreshToken } = await import("@server/lib/tokens");
    const app = createTestApp(requireAuth);
    const { token } = issueRefreshToken("admin-1", process.env.JWT_SECRET!);
    const res = await request(app)
      .get("/test")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe("requireReauth", () => {
  const secret = process.env.JWT_SECRET!;

  it("returns 403 without X-Reauth-Token", async () => {
    const app = createTestApp(requireReauth);
    const accessToken = issueAccessToken("admin-1", secret);
    const res = await request(app)
      .get("/test")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it("passes with valid access + reauth tokens", async () => {
    const app = createTestApp(requireReauth);
    const accessToken = issueAccessToken("admin-1", secret);
    const reauthToken = issueReauthToken("admin-1", secret);
    const res = await request(app)
      .get("/test")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("X-Reauth-Token", reauthToken);
    expect(res.status).toBe(200);
  });

  it("rejects mismatched admin IDs", async () => {
    const app = createTestApp(requireReauth);
    const accessToken = issueAccessToken("admin-1", secret);
    const reauthToken = issueReauthToken("admin-2", secret);
    const res = await request(app)
      .get("/test")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("X-Reauth-Token", reauthToken);
    expect(res.status).toBe(403);
  });
});
