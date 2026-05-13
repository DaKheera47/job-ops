import {
  GHOSTWRITER_DOCUMENT_CONTEXT_MAX_DOCUMENT_CHARS,
  GHOSTWRITER_DOCUMENT_CONTEXT_MAX_SELECTED,
  GHOSTWRITER_DOCUMENT_CONTEXT_MAX_TOTAL_CHARS,
} from "@shared/ghostwriter-document-context.js";
import {
  GHOSTWRITER_EMAIL_CONTEXT_MAX_SELECTED,
  GHOSTWRITER_EMAIL_CONTEXT_MAX_SNIPPET_CHARS,
  GHOSTWRITER_EMAIL_CONTEXT_MAX_TOTAL_CHARS,
} from "@shared/ghostwriter-email-context.js";
import {
  GHOSTWRITER_NOTE_CONTEXT_MAX_NOTE_CHARS,
  GHOSTWRITER_NOTE_CONTEXT_MAX_SELECTED,
  GHOSTWRITER_NOTE_CONTEXT_MAX_TOTAL_CHARS,
} from "@shared/ghostwriter-note-context.js";
import type {
  JobDocument,
  JobNote,
  PostApplicationJobEmailItem,
} from "@shared/types";
import { ChevronDown, FileText, Info, Mail, Paperclip } from "lucide-react";
import type React from "react";
import {
  canUseJobDocumentForTextContext,
  formatJobDocumentByteSize,
} from "@/client/lib/job-documents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, formatDateTime } from "@/lib/utils";

const APPROX_CHARS_PER_TOKEN = 4;
const tokenCountFormatter = new Intl.NumberFormat("en", {
  maximumFractionDigits: 1,
});

type GhostwriterContextSelectorProps = {
  notes: JobNote[];
  emails: PostApplicationJobEmailItem[];
  documents: JobDocument[];
  selectedNoteIds: string[];
  selectedEmailIds: string[];
  selectedDocumentIds: string[];
  disabled?: boolean;
  areNotesLoading?: boolean;
  areEmailsLoading?: boolean;
  areDocumentsLoading?: boolean;
  isSaving?: boolean;
  onNotesChange: (selectedNoteIds: string[]) => void;
  onEmailsChange: (selectedEmailIds: string[]) => void;
  onDocumentsChange: (selectedDocumentIds: string[]) => void;
};

type ContextGroupProps<TItem> = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: TItem[];
  selectedIds: string[];
  loadingLabel: string;
  emptyLabel: string;
  limitLabel: string;
  overflowLabel: string;
  maxSelected: number;
  maxItemChars: number;
  maxTotalChars: number;
  showTokenEstimate?: boolean;
  disabled?: boolean;
  isLoading?: boolean;
  isSaving?: boolean;
  getId: (item: TItem) => string;
  getTitle: (item: TItem) => string;
  getMeta: (item: TItem) => string;
  getContentLength: (item: TItem) => number;
  getCheckboxId: (item: TItem) => string;
  getUnavailableReason?: (item: TItem) => string | null;
  onChange: (selectedIds: string[]) => void;
};

function estimateTokensFromChars(chars: number): number {
  if (chars <= 0) return 0;
  return Math.ceil(chars / APPROX_CHARS_PER_TOKEN);
}

function formatTokenEstimate(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  return `${tokenCountFormatter.format(tokens / 1000)}k`;
}

function getSelectedItems<TItem>(
  items: TItem[],
  selectedIds: string[],
  getId: (item: TItem) => string,
) {
  const itemsById = new Map(items.map((item) => [getId(item), item]));
  return selectedIds
    .map((itemId) => itemsById.get(itemId))
    .filter((item): item is TItem => Boolean(item));
}

function estimateSelectedContextTokens<TItem>(input: {
  items: TItem[];
  selectedIds: string[];
  maxItemChars: number;
  maxTotalChars: number;
  getId: (item: TItem) => string;
  getContentLength: (item: TItem) => number;
  filterItem?: (item: TItem) => boolean;
}): { selectedContentChars: number; estimatedTokens: number } {
  const selectedContentChars = getSelectedItems(
    input.items,
    input.selectedIds,
    input.getId,
  )
    .filter((item) => input.filterItem?.(item) ?? true)
    .reduce(
      (total, item) =>
        total + Math.min(input.getContentLength(item), input.maxItemChars),
      0,
    );

  return {
    selectedContentChars,
    estimatedTokens: estimateTokensFromChars(
      Math.min(selectedContentChars, input.maxTotalChars),
    ),
  };
}

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

function canUseDocumentForGhostwriter(document: JobDocument): boolean {
  return canUseJobDocumentForTextContext(document);
}

function getDocumentMeta(document: JobDocument): string {
  return [
    document.mediaType || "Unknown type",
    formatJobDocumentByteSize(document.byteSize),
  ].join(" - ");
}

function ContextGroup<TItem>({
  title,
  icon: Icon,
  items,
  selectedIds,
  loadingLabel,
  emptyLabel,
  limitLabel,
  overflowLabel,
  maxSelected,
  maxItemChars,
  maxTotalChars,
  showTokenEstimate = true,
  disabled,
  isLoading,
  isSaving,
  getId,
  getTitle,
  getMeta,
  getContentLength,
  getCheckboxId,
  getUnavailableReason,
  onChange,
}: ContextGroupProps<TItem>) {
  const { selectedContentChars, estimatedTokens } = showTokenEstimate
    ? estimateSelectedContextTokens({
        items,
        selectedIds,
        maxItemChars,
        maxTotalChars,
        getId,
        getContentLength,
      })
    : { selectedContentChars: 0, estimatedTokens: 0 };
  const hasTotalOverflow =
    showTokenEstimate && selectedContentChars > maxTotalChars;
  const isAtSelectionLimit = selectedIds.length >= maxSelected;

  const toggleItem = (itemId: string) => {
    if (disabled || isLoading || isSaving) return;
    if (selectedIds.includes(itemId)) {
      onChange(selectedIds.filter((id) => id !== itemId));
      return;
    }
    if (isAtSelectionLimit) return;
    onChange([...selectedIds, itemId]);
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span>{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {estimatedTokens > 0 && (
            <Badge variant="outline" className="text-[10px]">
              ≈{formatTokenEstimate(estimatedTokens)} tokens
            </Badge>
          )}
          {selectedIds.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {selectedIds.length}/{maxSelected}
            </Badge>
          )}
        </div>
      </div>

      <div className="py-1">
        {isLoading ? (
          <div className="px-3 py-5 text-sm text-muted-foreground">
            {loadingLabel}
          </div>
        ) : items.length === 0 ? (
          <div className="px-3 py-5 text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          items.map((item) => {
            const itemId = getId(item);
            const isSelected = selectedIds.includes(itemId);
            const isTrimmed =
              showTokenEstimate && getContentLength(item) > maxItemChars;
            const unavailableReason = getUnavailableReason?.(item) ?? null;
            const isUnavailable =
              !isSelected && (isAtSelectionLimit || Boolean(unavailableReason));
            const checkboxId = getCheckboxId(item);

            return (
              <div
                key={itemId}
                className={cn(
                  "flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-muted/50",
                  isSelected && "bg-primary/5",
                  isUnavailable && "cursor-not-allowed opacity-55",
                )}
              >
                <Checkbox
                  id={checkboxId}
                  checked={isSelected}
                  disabled={disabled || isLoading || isSaving || isUnavailable}
                  className="mt-0.5"
                  onCheckedChange={() => toggleItem(itemId)}
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
                      {getTitle(item)}
                    </span>
                    {isSelected && isTrimmed && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        Trimmed for AI
                      </Badge>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {unavailableReason ?? getMeta(item)}
                  </span>
                </label>
              </div>
            );
          })
        )}
      </div>

      {(isAtSelectionLimit || hasTotalOverflow) && (
        <div className="border-t bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          {isAtSelectionLimit && (
            <div className="flex items-center gap-1.5">
              <Info className="h-3 w-3" />
              <span>{limitLabel}</span>
            </div>
          )}
          {hasTotalOverflow && (
            <div className="mt-1 flex items-start gap-1.5">
              <Info className="mt-0.5 h-3 w-3" />
              <span>{overflowLabel}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export const GhostwriterContextSelector: React.FC<
  GhostwriterContextSelectorProps
> = ({
  notes,
  emails,
  documents,
  selectedNoteIds,
  selectedEmailIds,
  selectedDocumentIds,
  disabled,
  areNotesLoading,
  areEmailsLoading,
  areDocumentsLoading,
  isSaving,
  onNotesChange,
  onEmailsChange,
  onDocumentsChange,
}) => {
  const selectedCount =
    selectedNoteIds.length +
    selectedEmailIds.length +
    selectedDocumentIds.length;
  const estimatedContextTokens =
    estimateSelectedContextTokens({
      items: notes,
      selectedIds: selectedNoteIds,
      maxItemChars: GHOSTWRITER_NOTE_CONTEXT_MAX_NOTE_CHARS,
      maxTotalChars: GHOSTWRITER_NOTE_CONTEXT_MAX_TOTAL_CHARS,
      getId: (note) => note.id,
      getContentLength: (note) => note.content.trim().length,
    }).estimatedTokens +
    estimateSelectedContextTokens({
      items: emails,
      selectedIds: selectedEmailIds,
      maxItemChars: GHOSTWRITER_EMAIL_CONTEXT_MAX_SNIPPET_CHARS,
      maxTotalChars: GHOSTWRITER_EMAIL_CONTEXT_MAX_TOTAL_CHARS,
      getId: (email) => email.message.id,
      getContentLength: (email) => email.message.snippet.trim().length,
    }).estimatedTokens;
  const triggerLabel =
    selectedCount > 0 ? `${selectedCount} context` : "Context";

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
            selectedCount > 0 && "border-primary/40 bg-primary/5",
          )}
        >
          <Paperclip className="h-3.5 w-3.5" />
          <span>{isSaving ? "Saving..." : triggerLabel}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[28rem] p-0">
        <div className="border-b px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">Ghostwriter context</div>
            <div className="flex shrink-0 items-center gap-1.5">
              {estimatedContextTokens > 0 && (
                <Badge variant="outline" className="text-[10px]">
                  ≈{formatTokenEstimate(estimatedContextTokens)} tokens
                </Badge>
              )}
              {selectedCount > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {selectedCount} selected
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div
          className="max-h-96 overflow-y-auto overscroll-contain"
          onWheelCapture={(event) => event.stopPropagation()}
          onTouchMoveCapture={(event) => event.stopPropagation()}
        >
          <ContextGroup
            title="Notes"
            icon={FileText}
            items={notes}
            selectedIds={selectedNoteIds}
            loadingLabel="Loading notes..."
            emptyLabel="No job notes yet."
            limitLabel={`${GHOSTWRITER_NOTE_CONTEXT_MAX_SELECTED} note limit`}
            overflowLabel="Selected notes exceed the AI context budget; later notes will be trimmed."
            maxSelected={GHOSTWRITER_NOTE_CONTEXT_MAX_SELECTED}
            maxItemChars={GHOSTWRITER_NOTE_CONTEXT_MAX_NOTE_CHARS}
            maxTotalChars={GHOSTWRITER_NOTE_CONTEXT_MAX_TOTAL_CHARS}
            disabled={disabled}
            isLoading={areNotesLoading}
            isSaving={isSaving}
            getId={(note) => note.id}
            getTitle={(note) => note.title}
            getMeta={(note) =>
              `Updated ${formatDateTime(note.updatedAt) ?? note.updatedAt}`
            }
            getContentLength={(note) => note.content.trim().length}
            getCheckboxId={(note) => `ghostwriter-note-context-${note.id}`}
            onChange={onNotesChange}
          />

          <ContextGroup
            title="Documents"
            icon={Paperclip}
            items={documents}
            selectedIds={selectedDocumentIds}
            loadingLabel="Loading documents..."
            emptyLabel="No uploaded documents yet."
            limitLabel={`${GHOSTWRITER_DOCUMENT_CONTEXT_MAX_SELECTED} document limit`}
            overflowLabel="Selected documents exceed the AI context budget; later document text will be trimmed."
            maxSelected={GHOSTWRITER_DOCUMENT_CONTEXT_MAX_SELECTED}
            maxItemChars={GHOSTWRITER_DOCUMENT_CONTEXT_MAX_DOCUMENT_CHARS}
            maxTotalChars={GHOSTWRITER_DOCUMENT_CONTEXT_MAX_TOTAL_CHARS}
            showTokenEstimate={false}
            disabled={disabled}
            isLoading={areDocumentsLoading}
            isSaving={isSaving}
            getId={(document) => document.id}
            getTitle={(document) => document.fileName}
            getMeta={getDocumentMeta}
            getContentLength={() => 0}
            getCheckboxId={(document) =>
              `ghostwriter-document-context-${document.id}`
            }
            getUnavailableReason={(document) =>
              canUseDocumentForGhostwriter(document)
                ? null
                : "PDF or text-like files only"
            }
            onChange={onDocumentsChange}
          />

          <ContextGroup
            title="Emails"
            icon={Mail}
            items={emails}
            selectedIds={selectedEmailIds}
            loadingLabel="Loading emails..."
            emptyLabel="No linked emails yet."
            limitLabel={`${GHOSTWRITER_EMAIL_CONTEXT_MAX_SELECTED} email limit`}
            overflowLabel="Selected emails exceed the AI context budget; later snippets will be trimmed."
            maxSelected={GHOSTWRITER_EMAIL_CONTEXT_MAX_SELECTED}
            maxItemChars={GHOSTWRITER_EMAIL_CONTEXT_MAX_SNIPPET_CHARS}
            maxTotalChars={GHOSTWRITER_EMAIL_CONTEXT_MAX_TOTAL_CHARS}
            disabled={disabled}
            isLoading={areEmailsLoading}
            isSaving={isSaving}
            getId={(email) => email.message.id}
            getTitle={(email) => email.message.subject || "No subject"}
            getMeta={getEmailMeta}
            getContentLength={(email) => email.message.snippet.trim().length}
            getCheckboxId={(email) =>
              `ghostwriter-email-context-${email.message.id}`
            }
            onChange={onEmailsChange}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};
