import { createId } from "@paralleldrive/cuid2";
import { db } from "@server/db";
import { auditLog } from "@server/db/schema";
import { logger } from "@infra/logger";

export type AuditAction =
  | "login.success"
  | "login.failed"
  | "login.locked"
  | "webauthn.register"
  | "webauthn.login.success"
  | "webauthn.login.failed"
  | "token.refresh"
  | "token.revoke"
  | "reauth.success"
  | "reauth.failed"
  | "passkey.register"
  | "passkey.remove"
  | "database.clear"
  | "backup.restore"
  | "backup.download"
  | "settings.credentials.update";

export interface AuditEventInput {
  action: AuditAction;
  adminId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Log an audit event. Fire-and-forget — errors are logged but never thrown.
 */
export function logAuditEvent(input: AuditEventInput): void {
  try {
    db.insert(auditLog)
      .values({
        id: createId(),
        action: input.action,
        adminId: input.adminId,
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      })
      .run();
  } catch (error) {
    logger.error("Failed to write audit log", { error, input });
  }
}
