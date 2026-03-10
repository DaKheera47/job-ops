import { ReauthModal } from "@client/components/ReauthModal";
import { authFetch } from "@client/lib/auth";
import { startRegistration } from "@simplewebauthn/browser";
import { Shield } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface Passkey {
  id: string;
  credentialId: string;
  friendlyName: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
}

interface Session {
  id: string;
  createdAt: string;
  expiresAt: string;
}

interface AuditEvent {
  id: string;
  action: string;
  adminId: string;
  ip: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export const SecuritySettingsSection: React.FC = () => {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Passkey registration
  const [passkeyName, setPasskeyName] = useState("");
  const [registering, setRegistering] = useState(false);

  // Passkey removal via ReauthModal
  const [reauthOpen, setReauthOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Session revocation via ReauthModal
  const [reauthRevokeOpen, setReauthRevokeOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);

  /* ---------------------------------------------------------------- */
  /*  Data loading                                                    */
  /* ---------------------------------------------------------------- */

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [passkeysRes, sessionsRes, auditRes] = await Promise.all([
        authFetch("/api/auth/passkeys"),
        authFetch("/api/auth/sessions"),
        authFetch("/api/auth/audit?limit=50"),
      ]);

      if (!passkeysRes.ok || !sessionsRes.ok || !auditRes.ok) {
        setError("Failed to load security data.");
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server JSON shape
      let passkeysData: any, sessionsData: any, auditData: any;
      try {
        [passkeysData, sessionsData, auditData] = await Promise.all([
          passkeysRes.json(),
          sessionsRes.json(),
          auditRes.json(),
        ]);
      } catch {
        setError("Failed to parse security data.");
        return;
      }

      setPasskeys(
        (passkeysData.data ?? passkeysData).passkeys ?? [],
      );
      setSessions(
        (sessionsData.data ?? sessionsData).sessions ?? [],
      );
      setAuditEvents(
        (auditData.data ?? auditData).events ?? [],
      );
    } catch {
      setError("Network error loading security data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  /* ---------------------------------------------------------------- */
  /*  Passkey registration                                            */
  /* ---------------------------------------------------------------- */

  const handleRegisterPasskey = useCallback(async () => {
    setRegistering(true);
    setError(null);
    setFeedback(null);

    try {
      const optionsRes = await authFetch(
        "/api/auth/webauthn/register/options",
        { method: "POST" },
      );

      if (!optionsRes.ok) {
        let message = "Failed to get registration options.";
        try {
          const errData = await optionsRes.json();
          message = errData.data?.message ?? errData.message ?? message;
        } catch {
          // non-JSON response
        }
        setError(message);
        return;
      }

      const optionsData = await optionsRes.json();
      const options = optionsData.data ?? optionsData;

      const attestation = await startRegistration({ optionsJSON: options });

      const verifyRes = await authFetch(
        "/api/auth/webauthn/register/verify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...attestation,
            friendlyName: passkeyName.trim() ?? undefined,
          }),
        },
      );

      if (!verifyRes.ok) {
        let message = "Passkey registration failed.";
        try {
          const errData = await verifyRes.json();
          message = errData.data?.message ?? errData.message ?? message;
        } catch {
          // non-JSON response
        }
        setError(message);
        return;
      }

      setPasskeyName("");
      setFeedback("Passkey registered successfully.");
      await loadData();
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("Passkey registration was cancelled.");
      } else {
        setError(
          err instanceof Error ? err.message : "Passkey registration failed.",
        );
      }
    } finally {
      setRegistering(false);
    }
  }, [passkeyName, loadData]);

  /* ---------------------------------------------------------------- */
  /*  Passkey deletion (via ReauthModal)                              */
  /* ---------------------------------------------------------------- */

  const handleRequestDelete = useCallback((passkeyId: string) => {
    setPendingDeleteId(passkeyId);
    setReauthOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(
    async (reauthToken: string) => {
      setReauthOpen(false);
      if (!pendingDeleteId || !/^[\w-]+$/.test(pendingDeleteId)) return;

      setDeleting(true);
      setError(null);
      setFeedback(null);

      try {
        const res = await authFetch(
          `/api/auth/passkeys/${pendingDeleteId}`,
          {
            method: "DELETE",
            headers: { "X-Reauth-Token": reauthToken },
          },
        );

        if (!res.ok) {
          let message = "Failed to remove passkey.";
          try {
            const errData = await res.json();
            message = errData.data?.message ?? errData.message ?? message;
          } catch {
            // non-JSON response
          }
          setError(message);
          return;
        }

        setFeedback("Passkey removed successfully.");
        await loadData();
      } catch {
        setError("Network error removing passkey.");
      } finally {
        setPendingDeleteId(null);
        setDeleting(false);
      }
    },
    [pendingDeleteId, loadData],
  );

  const handleCancelDelete = useCallback(() => {
    setReauthOpen(false);
    setPendingDeleteId(null);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Session revocation                                              */
  /* ---------------------------------------------------------------- */

  const handleRequestRevoke = useCallback(() => {
    setReauthRevokeOpen(true);
  }, []);

  const handleConfirmRevoke = useCallback(
    async (reauthToken: string) => {
      setReauthRevokeOpen(false);
      setRevoking(true);
      setError(null);
      setFeedback(null);

      try {
        const res = await authFetch("/api/auth/sessions/revoke-all", {
          method: "POST",
          headers: { "X-Reauth-Token": reauthToken },
        });

        if (!res.ok) {
          let message = "Failed to revoke sessions.";
          try {
            const errData = await res.json();
            message = errData.data?.message ?? errData.message ?? message;
          } catch {
            // non-JSON response
          }
          setError(message);
          return;
        }

        setFeedback("All sessions revoked.");
        await loadData();
      } catch {
        setError("Network error revoking sessions.");
      } finally {
        setRevoking(false);
      }
    },
    [loadData],
  );

  const handleCancelRevoke = useCallback(() => {
    setReauthRevokeOpen(false);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <>
      <AccordionItem value="security" className="border rounded-lg px-4">
        <AccordionTrigger className="hover:no-underline py-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span className="text-base font-semibold">Security</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          {loading ? (
            <p className="text-sm text-muted-foreground py-4">Loading...</p>
          ) : (
            <div className="space-y-8">
              {/* Error / Feedback */}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {feedback && (
                <p role="status" className="text-sm text-green-600">{feedback}</p>
              )}

              {/* -------------------------------------------------- */}
              {/*  Passkeys                                           */}
              {/* -------------------------------------------------- */}
              <div className="space-y-4">
                <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Passkeys
                </div>

                {passkeys.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No passkeys registered.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Device Type</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead><span className="sr-only">Actions</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {passkeys.map((pk) => (
                        <TableRow key={pk.id}>
                          <TableCell className="font-medium">
                            {pk.friendlyName ?? "Unnamed"}
                          </TableCell>
                          <TableCell>
                            {pk.deviceType}
                            {pk.backedUp ? " (synced)" : ""}
                          </TableCell>
                          <TableCell>
                            {new Date(pk.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => handleRequestDelete(pk.id)}
                              disabled={deleting}
                            >
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Passkey name (optional)"
                    value={passkeyName}
                    onChange={(e) => setPasskeyName(e.target.value)}
                    disabled={registering}
                    maxLength={64}
                    className="max-w-xs"
                  />
                  <Button
                    type="button"
                    onClick={handleRegisterPasskey}
                    disabled={registering}
                  >
                    {registering ? "Registering..." : "Register Passkey"}
                  </Button>
                </div>
              </div>

              <Separator />

              {/* -------------------------------------------------- */}
              {/*  Sessions                                           */}
              {/* -------------------------------------------------- */}
              <div className="space-y-4">
                <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Active Sessions
                </div>

                <p className="text-sm text-muted-foreground">
                  {sessions.length} active session
                  {sessions.length !== 1 ? "s" : ""}
                </p>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRequestRevoke}
                  disabled={revoking || sessions.length === 0}
                >
                  {revoking ? "Revoking..." : "Revoke All Sessions"}
                </Button>
              </div>

              <Separator />

              {/* -------------------------------------------------- */}
              {/*  Audit Log                                          */}
              {/* -------------------------------------------------- */}
              <div className="space-y-4">
                <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Audit Log
                </div>

                {auditEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No audit events.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>IP</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditEvents.map((evt) => (
                        <TableRow key={evt.id}>
                          <TableCell>
                            {new Date(evt.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {evt.action}
                          </TableCell>
                          <TableCell>{evt.ip}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>

      <ReauthModal
        open={reauthOpen}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        description="Re-authenticate to remove this passkey."
      />

      <ReauthModal
        open={reauthRevokeOpen}
        onConfirm={handleConfirmRevoke}
        onCancel={handleCancelRevoke}
        description="Re-authenticate to revoke all sessions."
      />
    </>
  );
};
