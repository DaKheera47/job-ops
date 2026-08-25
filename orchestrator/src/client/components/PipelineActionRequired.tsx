import { Loader2, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface PipelineActionRequiredProps {
  title: string;
  description?: string;
  actionLabel: string;
  pendingLabel: string;
  pending?: boolean;
  onAction: () => void;
}

export const PipelineActionRequired = ({
  title,
  description,
  actionLabel,
  pendingLabel,
  pending = false,
  onAction,
}: PipelineActionRequiredProps) => (
  <Alert variant="warning">
    <ShieldAlert />
    <div className="flex min-w-0 size-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <AlertTitle className="mb-0">{title}</AlertTitle>
        {description ? (
          <AlertDescription>{description}</AlertDescription>
        ) : null}
      </div>
      <Button
        className="shrink-0 self-start sm:self-auto"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={onAction}
      >
        {pending ? <Loader2 data-icon="inline-start" /> : null}
        {pending ? pendingLabel : actionLabel}
      </Button>
    </div>
  </Alert>
);
