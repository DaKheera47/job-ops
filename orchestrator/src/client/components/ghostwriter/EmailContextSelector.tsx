import {
  GHOSTWRITER_EMAIL_CONTEXT_MAX_SELECTED,
  GHOSTWRITER_EMAIL_CONTEXT_MAX_SNIPPET_CHARS,
  GHOSTWRITER_EMAIL_CONTEXT_MAX_TOTAL_CHARS,
} from "@shared/ghostwriter-email-context.js";
import type { PostApplicationJobEmailItem } from "@shared/types";
import { ChevronDown, Info, Mail } from "lucide-react";
import type React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, formatDateTime } from "@/lib/utils";

type EmailContextSelectorProps = {
  emails: PostApplicationJobEmailItem[];
  selectedEmailIds: string[];
  disabled?: boolean;
  isLoading?: boolean;
  isSaving?: boolean;
  onChange: (selectedEmailIds: string[]) => void;
};

function getSelectedEmails(
  emails: PostApplicationJobEmailItem[],
  selectedEmailIds: string[],
) {
  const emailsById = new Map(emails.map((email) => [email.message.id, email]));
  return selectedEmailIds
    .map((emailId) => emailsById.get(emailId))
    .filter((email): email is PostApplicationJobEmailItem => Boolean(email));
}

function getSenderLabel(email: PostApplicationJobEmailItem): string {
  const senderName = email.message.senderName?.trim();
  if (senderName) return senderName;
  const address = email.message.fromAddress.trim();
  return address || "Unknown sender";
}

export const EmailContextSelector: React.FC<EmailContextSelectorProps> = ({
  emails,
  selectedEmailIds,
  disabled,
  isLoading,
  isSaving,
  onChange,
}) => {
  const selectedEmails = getSelectedEmails(emails, selectedEmailIds);
  const selectedSnippetChars = selectedEmails.reduce(
    (total, email) =>
      total +
      Math.min(
        email.message.snippet.trim().length,
        GHOSTWRITER_EMAIL_CONTEXT_MAX_SNIPPET_CHARS,
      ),
    0,
  );
  const hasTotalOverflow =
    selectedSnippetChars > GHOSTWRITER_EMAIL_CONTEXT_MAX_TOTAL_CHARS;
  const isAtSelectionLimit =
    selectedEmailIds.length >= GHOSTWRITER_EMAIL_CONTEXT_MAX_SELECTED;

  const toggleEmail = (emailId: string) => {
    if (disabled || isLoading || isSaving) return;
    if (selectedEmailIds.includes(emailId)) {
      onChange(selectedEmailIds.filter((id) => id !== emailId));
      return;
    }
    if (isAtSelectionLimit) return;
    onChange([...selectedEmailIds, emailId]);
  };

  const triggerLabel =
    selectedEmailIds.length > 0
      ? `${selectedEmailIds.length} emails`
      : "Emails";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            "h-8 gap-1.5 px-2.5 text-xs",
            selectedEmailIds.length > 0 && "border-primary/40 bg-primary/5",
          )}
        >
          <Mail className="h-3.5 w-3.5" />
          <span>{isSaving ? "Saving..." : triggerLabel}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="border-b px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">Ghostwriter emails</div>
            {selectedEmailIds.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {selectedEmailIds.length}/
                {GHOSTWRITER_EMAIL_CONTEXT_MAX_SELECTED}
              </Badge>
            )}
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto py-1">
          {isLoading ? (
            <div className="px-3 py-6 text-sm text-muted-foreground">
              Loading emails...
            </div>
          ) : emails.length === 0 ? (
            <div className="px-3 py-6 text-sm text-muted-foreground">
              No linked emails yet.
            </div>
          ) : (
            emails.map((email) => {
              const isSelected = selectedEmailIds.includes(email.message.id);
              const isTrimmed =
                email.message.snippet.trim().length >
                GHOSTWRITER_EMAIL_CONTEXT_MAX_SNIPPET_CHARS;
              const isUnavailable = !isSelected && isAtSelectionLimit;
              const receivedAt = email.message.receivedAt
                ? formatDateTime(
                    new Date(email.message.receivedAt).toISOString(),
                  )
                : null;
              const checkboxId = `ghostwriter-email-context-${email.message.id}`;

              return (
                <div
                  key={email.message.id}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-muted/50",
                    isSelected && "bg-primary/5",
                    isUnavailable && "cursor-not-allowed opacity-55",
                  )}
                >
                  <Checkbox
                    id={checkboxId}
                    checked={isSelected}
                    disabled={
                      disabled || isLoading || isSaving || isUnavailable
                    }
                    className="mt-0.5"
                    onCheckedChange={() => toggleEmail(email.message.id)}
                  />
                  <label
                    htmlFor={checkboxId}
                    className={cn(
                      "min-w-0 flex-1 cursor-pointer",
                      (disabled || isLoading || isSaving || isUnavailable) &&
                        "cursor-not-allowed",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {email.message.subject || "No subject"}
                      </span>
                      {isSelected && isTrimmed && (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[10px]"
                        >
                          Trimmed for AI
                        </Badge>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {getSenderLabel(email)}
                      {receivedAt ? ` - ${receivedAt}` : ""}
                    </span>
                  </label>
                </div>
              );
            })
          )}
        </div>

        {(isAtSelectionLimit || hasTotalOverflow) && (
          <div className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {isAtSelectionLimit && (
              <div className="flex items-center gap-1.5">
                <Info className="h-3 w-3" />
                <span>
                  {GHOSTWRITER_EMAIL_CONTEXT_MAX_SELECTED} email limit
                </span>
              </div>
            )}
            {hasTotalOverflow && (
              <div className="mt-1 flex items-start gap-1.5">
                <Info className="mt-0.5 h-3 w-3" />
                <span>
                  Selected emails exceed the AI context budget; later snippets
                  will be trimmed.
                </span>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
