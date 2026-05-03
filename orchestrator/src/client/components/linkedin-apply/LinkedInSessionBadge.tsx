import {
  useLinkedInSessionStatus,
  useStartLinkedInLoginMutation,
  useLogoutLinkedInMutation,
} from "@client/hooks/queries/useLinkedInApply";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function LinkedInSessionBadge() {
  const { data: session, isLoading } = useLinkedInSessionStatus();
  const loginMutation = useStartLinkedInLoginMutation();
  const logoutMutation = useLogoutLinkedInMutation();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking LinkedIn...
      </div>
    );
  }

  const connected = session?.authenticated ?? false;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        <div
          className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-rose-500"}`}
        />
        <span className="text-xs text-muted-foreground">
          LinkedIn: {connected ? "Connected" : "Not connected"}
        </span>
      </div>

      {connected ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => {
            logoutMutation.mutate(undefined, {
              onSuccess: () => toast.success("LinkedIn disconnected"),
            });
          }}
          disabled={logoutMutation.isPending}
        >
          Disconnect
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => {
            loginMutation.mutate(undefined, {
              onSuccess: () =>
                toast.info(
                  "Browser opened — log in to LinkedIn via the viewer window",
                ),
              onError: (err) =>
                toast.error(
                  err instanceof Error ? err.message : "Failed to start login",
                ),
            });
          }}
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Opening...
            </>
          ) : (
            "Connect"
          )}
        </Button>
      )}
    </div>
  );
}
