import type { JobChatThread } from "@shared/types";
import type React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ThreadListProps = {
  threads: JobChatThread[];
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onCreateThread: () => void;
  disabled?: boolean;
};

export const ThreadList: React.FC<ThreadListProps> = ({
  threads,
  activeThreadId,
  onSelectThread,
  onCreateThread,
  disabled,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Threads
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onCreateThread}
          disabled={disabled}
        >
          New
        </Button>
      </div>

      <div className="max-h-40 space-y-1 overflow-auto rounded-md border border-border/50 p-1">
        {threads.length === 0 ? (
          <div className="p-2 text-xs text-muted-foreground">
            No threads yet
          </div>
        ) : (
          threads.map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => onSelectThread(thread.id)}
              className={cn(
                "w-full rounded px-2 py-1.5 text-left text-xs transition-colors",
                activeThreadId === thread.id
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted",
              )}
            >
              {thread.title || "Untitled thread"}
            </button>
          ))
        )}
      </div>
    </div>
  );
};
