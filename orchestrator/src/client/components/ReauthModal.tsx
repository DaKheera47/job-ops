import React, { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authFetch } from "@client/lib/auth";

interface ReauthModalProps {
  open: boolean;
  onConfirm: (reauthToken: string) => void;
  onCancel: () => void;
  description?: string;
}

export const ReauthModal: React.FC<ReauthModalProps> = ({
  open,
  onConfirm,
  onCancel,
  description = "Please re-enter your credentials to continue with this action.",
}) => {
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const clearFields = () => {
    setPassword("");
    setTotpCode("");
    setError(null);
  };

  const handleCancel = () => {
    clearFields();
    onCancel();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await authFetch("/api/auth/reauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, totpCode }),
      });

      if (!res.ok) {
        let message = "Re-authentication failed.";
        try {
          const errData = await res.json();
          message = errData.data?.message ?? errData.message ?? message;
        } catch {
          // Response was not JSON — use default message
        }
        setError(message);
        return;
      }

      const data = await res.json();
      const token = data.data?.reauthToken ?? data.reauthToken;

      if (!token) {
        setError("No re-auth token received.");
        return;
      }

      clearFields();
      onConfirm(token);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Your Identity</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reauth-password">Password</Label>
            <Input
              id="reauth-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reauth-totp">Authentication Code</Label>
            <Input
              id="reauth-totp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              maxLength={6}
              value={totpCode}
              onChange={(e) =>
                setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              required
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <AlertDialogFooter className="pt-4">
            <AlertDialogCancel type="button" onClick={handleCancel}>
              Cancel
            </AlertDialogCancel>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Verifying..." : "Confirm"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
};
