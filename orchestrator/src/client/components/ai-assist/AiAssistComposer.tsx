import { getMetaShortcutLabel, isMetaKeyPressed } from "@client/lib/meta-key";
import { createId } from "@paralleldrive/cuid2";
import type { JobChatImageAttachment } from "@shared/types";
import { Eraser, ImagePlus, Send, Square } from "lucide-react";
import type React from "react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScreenshotAttachmentPreview } from "./ScreenshotAttachmentPreview";

const MAX_SCREENSHOTS = 3;
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type AiAssistComposerProps = {
  disabled?: boolean;
  isStreaming: boolean;
  canReset?: boolean;
  contextSlot?: React.ReactNode;
  placeholder?: string;
  allowScreenshots?: boolean;
  onStop?: () => Promise<void>;
  onSend: (
    content: string,
    attachments: JobChatImageAttachment[],
  ) => Promise<void>;
  onReset?: () => void;
};

export const AiAssistComposer: React.FC<AiAssistComposerProps> = ({
  disabled,
  isStreaming,
  canReset = false,
  contextSlot,
  placeholder = "Ask for a better draft...",
  allowScreenshots = false,
  onStop,
  onSend,
  onReset,
}) => {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<JobChatImageAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = async (files: FileList | File[] | null) => {
    if (!files?.length || !allowScreenshots) return;

    const remainingSlots = MAX_SCREENSHOTS - attachments.length;
    if (remainingSlots <= 0) {
      toast.error(`Attach up to ${MAX_SCREENSHOTS} screenshots.`);
      return;
    }

    const nextFiles = Array.from(files).slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      toast.info(`Only ${MAX_SCREENSHOTS} screenshots can be attached.`);
    }

    const nextAttachments: JobChatImageAttachment[] = [];
    for (const file of nextFiles) {
      if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
        toast.error("Screenshots must be PNG, JPEG, or WebP images.");
        continue;
      }
      if (file.size > MAX_SCREENSHOT_BYTES) {
        toast.error(`${file.name} is larger than 2 MB.`);
        continue;
      }

      let dataUrl: string;
      try {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () =>
            reject(reader.error ?? new Error("Could not read screenshot"));
          reader.readAsDataURL(file);
        });
      } catch {
        toast.error(`Could not read ${file.name}.`);
        continue;
      }

      nextAttachments.push({
        id: createId(),
        name: file.name,
        mediaType: file.type as JobChatImageAttachment["mediaType"],
        dataUrl,
      });
    }

    if (nextAttachments.length) {
      setAttachments((current) => [...current, ...nextAttachments]);
    }
  };

  const addClipboardImages = async (clipboardData: DataTransfer) => {
    const imageFiles = Array.from(clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);

    if (imageFiles.length === 0) return false;
    await addFiles(imageFiles);
    return true;
  };

  const submit = async () => {
    const content = value.trim();
    if (!content || disabled) return;
    const attachmentsToSend = attachments;
    setValue("");
    setAttachments([]);
    await onSend(content, attachmentsToSend);
  };

  return (
    <div className="space-y-2">
      {attachments.length > 0 && (
        <ScreenshotAttachmentPreview
          attachments={attachments}
          onRemove={(attachment) =>
            setAttachments((current) =>
              current.filter((item) => item.id !== attachment.id),
            )
          }
        />
      )}
      <Textarea
        placeholder={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onPaste={(event) => {
          if (!allowScreenshots) return;
          const hasClipboardImage = Array.from(event.clipboardData.items).some(
            (item) => item.kind === "file" && item.type.startsWith("image/"),
          );
          if (!hasClipboardImage) return;

          event.preventDefault();
          void addClipboardImages(event.clipboardData);
        }}
        disabled={disabled}
        onKeyDown={(event) => {
          if (isMetaKeyPressed(event) && event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
        }}
        className="min-h-[84px]"
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {contextSlot}
          <div className="text-[10px] text-muted-foreground">
            {getMetaShortcutLabel("Enter")} to send
          </div>
        </div>
        <div className="flex items-center gap-1">
          {allowScreenshots ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={(event) => {
                  void addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <Button
                size="icon"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || attachments.length >= MAX_SCREENSHOTS}
                aria-label="Attach screenshots"
                title="Attach screenshots"
              >
                <ImagePlus className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : null}

          {onReset ? (
            <Button
              size="icon"
              variant="outline"
              onClick={onReset}
              disabled={disabled || !canReset}
              aria-label="Start over"
              title="Start over"
              className="text-destructive hover:text-destructive"
            >
              <Eraser className="h-3.5 w-3.5" />
            </Button>
          ) : null}

          {isStreaming && onStop ? (
            <Button
              size="icon"
              variant="outline"
              onClick={() => void onStop()}
              aria-label="Stop generating"
              title="Stop generating"
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : null}

          <Button
            size="icon"
            onClick={() => void submit()}
            disabled={disabled || !value.trim()}
            aria-label="Send message"
            title="Send message"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};
