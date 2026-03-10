import rateLimit from "express-rate-limit";

/** Login endpoint: 5 attempts per 15 minutes */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: "rate_limited", message: "Too many login attempts. Try again later." } },
  keyGenerator: (req) => req.ip || "unknown",
});

/** WebAuthn endpoints: 10 attempts per 15 minutes */
export const webauthnLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: "rate_limited", message: "Too many attempts. Try again later." } },
  keyGenerator: (req) => req.ip || "unknown",
});

/** Re-auth endpoint: 5 attempts per 15 minutes */
export const reauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: "rate_limited", message: "Too many re-auth attempts. Try again later." } },
  keyGenerator: (req) => req.ip || "unknown",
});

/** General API: 120 requests per minute */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: { code: "rate_limited", message: "Too many requests. Slow down." } },
  keyGenerator: (req) => req.ip || "unknown",
});
