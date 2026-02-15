import { Loader2, RefreshCcw, Square } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";

type RunControlsProps = {
  isStreaming: boolean;
  canRegenerate: boolean;
  onStop: () => Promise<void>;
  onRegenerate: () => Promise<void>;
};

export const RunControls: React.FC<RunControlsProps> = ({
  isStreaming,
  canRegenerate,
  onStop,
  onRegenerate,
}) => {
  return (
    <div className="flex items-center justify-end gap-2">
      {isStreaming ? (
        <Button size="sm" variant="outline" onClick={() => void onStop()}>
          <Square className="mr-1 h-3.5 w-3.5" />
          Stop
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => void onRegenerate()}
          disabled={!canRegenerate}
        >
          <RefreshCcw className="mr-1 h-3.5 w-3.5" />
          Regenerate
        </Button>
      )}

      {isStreaming && (
        <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Generating
        </div>
      )}
    </div>
  );
};
