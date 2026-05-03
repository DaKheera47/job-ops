import { describe, expect, it } from "vitest";
import {
  buildGhostwriterNoteContextItems,
  GHOSTWRITER_NOTE_CONTEXT_MAX_NOTE_CHARS,
  GHOSTWRITER_NOTE_CONTEXT_MAX_TOTAL_CHARS,
} from "./ghostwriter-note-context";
import type { JobNote } from "./types/jobs";

const makeNote = (overrides: Partial<JobNote>): JobNote => ({
  id: "note-1",
  jobId: "job-1",
  title: "Context note",
  content: "Helpful context.",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("buildGhostwriterNoteContextItems", () => {
  it("distinguishes per-note trimming from total-budget trimming", () => {
    const result = buildGhostwriterNoteContextItems([
      makeNote({
        content: "A".repeat(GHOSTWRITER_NOTE_CONTEXT_MAX_NOTE_CHARS + 1),
      }),
    ]);

    expect(result.items[0]?.wasTrimmed).toBe(true);
    expect(result.items[0]?.content).toHaveLength(
      GHOSTWRITER_NOTE_CONTEXT_MAX_NOTE_CHARS,
    );
    expect(result.wasTotalTrimmed).toBe(false);
  });

  it("reports total-budget trimming when capped note content exceeds the total", () => {
    const noteCount =
      GHOSTWRITER_NOTE_CONTEXT_MAX_TOTAL_CHARS /
        GHOSTWRITER_NOTE_CONTEXT_MAX_NOTE_CHARS +
      1;
    const result = buildGhostwriterNoteContextItems(
      Array.from({ length: noteCount }, (_, index) =>
        makeNote({
          id: `note-${index + 1}`,
          content: "A".repeat(GHOSTWRITER_NOTE_CONTEXT_MAX_NOTE_CHARS),
        }),
      ),
    );

    expect(result.wasTotalTrimmed).toBe(true);
    expect(result.items.at(-1)?.content).toHaveLength(0);
  });
});
