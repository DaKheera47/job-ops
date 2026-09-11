import * as api from "@client/api";
import {
  isPasskeySupported,
  PasskeyCancelledError,
  registerPasskey,
} from "@client/lib/passkeys";
import { queryKeys } from "@client/lib/queryKeys";
import type { PasskeySummary } from "@shared/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fingerprint, Trash2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { showErrorToast } from "@/client/lib/error-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PasskeysSectionApi = {
  isSupported: () => boolean;
  list: () => Promise<PasskeySummary[]>;
  register: (name: string) => Promise<PasskeySummary>;
  rename: (id: string, name: string) => Promise<PasskeySummary>;
  remove: (id: string) => Promise<void>;
};

type PasskeysSectionProps = {
  passkeysApi?: PasskeysSectionApi;
};

const defaultPasskeysApi: PasskeysSectionApi = {
  isSupported: isPasskeySupported,
  list: api.listPasskeys,
  register: registerPasskey,
  rename: api.renamePasskey,
  remove: api.deletePasskey,
};

function formatCreatedAt(value: string): string {
  const created = new Date(value);
  return Number.isNaN(created.getTime())
    ? "unknown"
    : created.toLocaleDateString();
}

function formatLastUsedAt(value: number | null): string {
  return value ? new Date(value * 1000).toLocaleString() : "never";
}

export const PasskeysSection: React.FC<PasskeysSectionProps> = ({
  passkeysApi = defaultPasskeysApi,
}) => {
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newPasskeyName, setNewPasskeyName] = useState("");
  const [renamingPasskeyId, setRenamingPasskeyId] = useState<string | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");

  const isSupported = passkeysApi.isSupported();

  const passkeysQuery = useQuery({
    queryKey: queryKeys.auth.passkeys(),
    queryFn: passkeysApi.list,
  });

  const invalidatePasskeys = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.auth.passkeys() });

  const registerMutation = useMutation({
    mutationFn: (name: string) => passkeysApi.register(name),
    onSuccess: async (passkey) => {
      setIsAddDialogOpen(false);
      setNewPasskeyName("");
      await invalidatePasskeys();
      toast.success(`Added ${passkey.name}`);
    },
    onError: (error) => {
      // The browser prompt was dismissed; the user does not need telling.
      if (error instanceof PasskeyCancelledError) return;
      showErrorToast(error, "Failed to add passkey");
    },
  });

  const renameMutation = useMutation({
    mutationFn: (input: { id: string; name: string }) =>
      passkeysApi.rename(input.id, input.name),
    onSuccess: async () => {
      setRenamingPasskeyId(null);
      setRenameValue("");
      await invalidatePasskeys();
      toast.success("Passkey renamed");
    },
    onError: (error) => {
      showErrorToast(error, "Failed to rename passkey");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => passkeysApi.remove(id),
    onSuccess: async () => {
      await invalidatePasskeys();
      toast.success("Passkey removed");
    },
    onError: (error) => {
      showErrorToast(error, "Failed to remove passkey");
    },
  });

  const passkeys = passkeysQuery.data ?? [];
  const isListEmpty = passkeys.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-semibold">Passkeys</div>
          <p className="text-sm text-muted-foreground">
            Sign in with your device PIN, fingerprint or face instead of your
            password.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!isSupported || registerMutation.isPending}
          onClick={() => {
            setNewPasskeyName("");
            setIsAddDialogOpen(true);
          }}
        >
          <Fingerprint className="h-4 w-4" />
          Add passkey
        </Button>
      </div>

      {isSupported ? null : (
        <p className="text-sm text-muted-foreground">
          This browser cannot create passkeys. Passkeys need WebAuthn support
          and a secure (HTTPS) connection.
        </p>
      )}

      <div className="divide-y divide-border rounded-md border border-border">
        {passkeys.map((passkey) => {
          const isRenaming = renamingPasskeyId === passkey.id;
          return (
            <div
              className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              key={passkey.id}
            >
              <div className="min-w-0">
                {isRenaming ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      aria-label="Passkey name"
                      value={renameValue}
                      onChange={(event) =>
                        setRenameValue(event.currentTarget.value)
                      }
                      className="h-8 w-48"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        renameMutation.isPending ||
                        renameValue.trim().length === 0
                      }
                      onClick={() =>
                        renameMutation.mutate({
                          id: passkey.id,
                          name: renameValue.trim(),
                        })
                      }
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setRenamingPasskeyId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {passkey.name}
                    </span>
                    {passkey.backedUp ? (
                      <Badge variant="secondary">Synced</Badge>
                    ) : null}
                  </div>
                )}
                <div className="mt-1 text-xs text-muted-foreground">
                  Added {formatCreatedAt(passkey.createdAt)} · Last used{" "}
                  {formatLastUsedAt(passkey.lastUsedAt)}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isRenaming}
                  onClick={() => {
                    setRenamingPasskeyId(passkey.id);
                    setRenameValue(passkey.name);
                  }}
                >
                  Rename
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="sr-only">Remove {passkey.name}</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Remove {passkey.name}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This device will no longer be able to sign in with this
                        passkey. You can register it again later.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate(passkey.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          );
        })}
        {isListEmpty && passkeysQuery.isPending ? (
          <div className="p-3 text-sm text-muted-foreground">
            Loading passkeys...
          </div>
        ) : null}
        {isListEmpty && passkeysQuery.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-2 p-3">
            <p className="text-sm text-destructive">
              Couldn't load your passkeys.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void passkeysQuery.refetch();
              }}
            >
              Try again
            </Button>
          </div>
        ) : null}
        {isListEmpty && passkeysQuery.isSuccess ? (
          <div className="p-3 text-sm text-muted-foreground">
            No passkeys registered yet.
          </div>
        ) : null}
      </div>

      <Dialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) setNewPasskeyName("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a passkey</DialogTitle>
            <DialogDescription>
              Name this passkey so you can recognise it later, then follow your
              browser's prompt to confirm with your PIN, fingerprint or face.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-passkey-name">Name</Label>
            <Input
              id="new-passkey-name"
              value={newPasskeyName}
              onChange={(event) => setNewPasskeyName(event.currentTarget.value)}
              placeholder="e.g. Work laptop"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={registerMutation.isPending}
              onClick={() => registerMutation.mutate(newPasskeyName.trim())}
            >
              {registerMutation.isPending
                ? "Waiting for your device..."
                : "Create passkey"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
