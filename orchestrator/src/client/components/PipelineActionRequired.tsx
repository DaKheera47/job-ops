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
  secondaryActionLabel?: string;
  secondaryPendingLabel?: string;
  secondaryPending?: boolean;
  onSecondaryAction?: () => void;
}

export const PipelineActionRequired = ({
  title,
  description,
  actionLabel,
  pendingLabel,
  pending = false,
  onAction,
  secondaryActionLabel,
  secondaryPendingLabel,
  secondaryPending = false,
  onSecondaryAction,
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
      <div className="flex shrink-0 flex-wrap gap-2 self-start sm:self-auto">
        <Button
          size="sm"
          variant="outline"
          disabled={pending || secondaryPending}
          onClick={onAction}
        >
          {pending ? <Loader2 data-icon="inline-start" /> : null}
          {pending ? pendingLabel : actionLabel}
        </Button>
        {secondaryActionLabel && onSecondaryAction ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending || secondaryPending}
            onClick={onSecondaryAction}
          >
            {secondaryPending ? <Loader2 data-icon="inline-start" /> : null}
            {secondaryPending
              ? (secondaryPendingLabel ?? secondaryActionLabel)
              : secondaryActionLabel}
          </Button>
        ) : null}
      </div>
    </div>
  </Alert>
);
