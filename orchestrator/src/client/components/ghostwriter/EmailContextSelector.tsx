import {
  GHOSTWRITER_EMAIL_CONTEXT_MAX_SELECTED,
  GHOSTWRITER_EMAIL_CONTEXT_MAX_SNIPPET_CHARS,
  GHOSTWRITER_EMAIL_CONTEXT_MAX_TOTAL_CHARS,
} from "@shared/ghostwriter-email-context.js";
import type { PostApplicationJobEmailItem } from "@shared/types";
import { Mail } from "lucide-react";
import type React from "react";
import { formatDateTime } from "@/lib/utils";
import { ContextSelectorPopover } from "./ContextSelectorPopover";

type EmailContextSelectorProps = {
  emails: PostApplicationJobEmailItem[];
  selectedEmailIds: string[];
  disabled?: boolean;
  isLoading?: boolean;
  isSaving?: boolean;
  onChange: (selectedEmailIds: string[]) => void;
};

function getSenderLabel(email: PostApplicationJobEmailItem): string {
  const senderName = email.message.senderName?.trim();
  if (senderName) return senderName;
  const address = email.message.fromAddress.trim();
  return address || "Unknown sender";
}

function getEmailMeta(email: PostApplicationJobEmailItem): string {
  const receivedAt = email.message.receivedAt
    ? formatDateTime(new Date(email.message.receivedAt).toISOString())
    : null;
  return `${getSenderLabel(email)}${receivedAt ? ` - ${receivedAt}` : ""}`;
}

export const EmailContextSelector: React.FC<EmailContextSelectorProps> = ({
  emails,
  selectedEmailIds,
  disabled,
  isLoading,
  isSaving,
  onChange,
}) => (
  <ContextSelectorPopover
    items={emails}
    selectedIds={selectedEmailIds}
    icon={Mail}
    defaultTriggerLabel="Emails"
    selectedTriggerLabel={(count) => `${count} emails`}
    headerLabel="Ghostwriter emails"
    loadingLabel="Loading emails..."
    emptyLabel="No linked emails yet."
    limitLabel={`${GHOSTWRITER_EMAIL_CONTEXT_MAX_SELECTED} email limit`}
    overflowLabel="Selected emails exceed the AI context budget; later snippets will be trimmed."
    maxSelected={GHOSTWRITER_EMAIL_CONTEXT_MAX_SELECTED}
    maxItemChars={GHOSTWRITER_EMAIL_CONTEXT_MAX_SNIPPET_CHARS}
    maxTotalChars={GHOSTWRITER_EMAIL_CONTEXT_MAX_TOTAL_CHARS}
    disabled={disabled}
    isLoading={isLoading}
    isSaving={isSaving}
    popoverClassName="w-96"
    getId={(email) => email.message.id}
    getTitle={(email) => email.message.subject || "No subject"}
    getMeta={getEmailMeta}
    getContentLength={(email) => email.message.snippet.trim().length}
    getCheckboxId={(email) => `ghostwriter-email-context-${email.message.id}`}
    onChange={onChange}
  />
);
