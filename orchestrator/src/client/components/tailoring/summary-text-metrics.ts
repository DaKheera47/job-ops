export type TextCountMode = "words" | "characters";

const graphemeSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function countCharacters(text: string): number {
  if (graphemeSegmenter) {
    let count = 0;
    for (const _ of graphemeSegmenter.segment(text)) {
      count += 1;
    }
    return count;
  }
  return Array.from(text).length;
}

export function formatTextCount(text: string, mode: TextCountMode): string {
  if (mode === "words") {
    const count = countWords(text);
    return `${count} ${count === 1 ? "word" : "words"}`;
  }

  const count = countCharacters(text);
  return `${count} ${count === 1 ? "character" : "characters"}`;
}

export const TAILOR_TEXTAREA_MIN_HEIGHT_PX = 120;
export const TAILOR_TEXTAREA_MAX_HEIGHT_PX = 250;

/** Strip trailing blank lines so empty space does not inflate auto-height. */
export function collapseTrailingBlankLines(text: string): string {
  return text.replace(/\n+$/, "");
}

export function measureTailorTextareaHeight(contentHeight: number): number {
  return Math.min(
    TAILOR_TEXTAREA_MAX_HEIGHT_PX,
    Math.max(TAILOR_TEXTAREA_MIN_HEIGHT_PX, contentHeight),
  );
}

export function applySummaryTextareaHeight(
  textarea: HTMLTextAreaElement,
  collapseTrailing = false,
): number {
  const originalValue = textarea.value;
  const measureValue = collapseTrailing
    ? collapseTrailingBlankLines(originalValue)
    : originalValue;

  try {
    if (measureValue !== originalValue) {
      textarea.value = measureValue;
    }

    textarea.style.height = "auto";
    // scrollHeight omits borders, which still count toward a border-box height.
    const borderHeight = textarea.offsetHeight - textarea.clientHeight;
    const height = measureTailorTextareaHeight(
      textarea.scrollHeight + borderHeight,
    );
    textarea.style.height = `${height}px`;
    return height;
  } finally {
    if (measureValue !== originalValue) {
      textarea.value = originalValue;
    }
  }
}

export function shouldPreserveManualHeight(
  autoHeightPx: number,
  currentHeightPx: number,
): boolean {
  if (!Number.isFinite(autoHeightPx) || !Number.isFinite(currentHeightPx)) {
    return true;
  }
  return (
    currentHeightPx > TAILOR_TEXTAREA_MIN_HEIGHT_PX &&
    currentHeightPx !== autoHeightPx
  );
}
