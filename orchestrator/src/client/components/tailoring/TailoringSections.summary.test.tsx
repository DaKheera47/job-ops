import {
  mockElementMeasurement,
  triggerElementResize,
} from "@client/test/dom-measurement";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  TAILOR_TEXTAREA_MAX_HEIGHT_PX,
  TAILOR_TEXTAREA_MIN_HEIGHT_PX,
} from "./summary-text-metrics";
import { TailoringSections } from "./TailoringSections";

type Props = React.ComponentProps<typeof TailoringSections>;

const renderSections = (summary: string) => {
  const props: Props = {
    catalog: [],
    isCatalogLoading: false,
    summary,
    headline: "",
    jobDescription: "",
    skillsDraft: [],
    selectedIds: new Set(),
    tracerLinksEnabled: false,
    tracerEnableBlocked: false,
    tracerEnableBlockedReason: null,
    generatingSection: null,
    openSkillGroupId: "",
    disableInputs: false,
    onGenerateSummary: vi.fn(),
    onGenerateHeadline: vi.fn(),
    onGenerateSkills: vi.fn(),
    onSummaryChange: vi.fn(),
    onHeadlineChange: vi.fn(),
    onUndoSummary: vi.fn(),
    onUndoHeadline: vi.fn(),
    onUndoSkills: vi.fn(),
    onRedoSummary: vi.fn(),
    onRedoHeadline: vi.fn(),
    onRedoSkills: vi.fn(),
    canUndoSummary: false,
    canUndoHeadline: false,
    canUndoSkills: false,
    canRedoSummary: false,
    canRedoHeadline: false,
    canRedoSkills: false,
    onDescriptionChange: vi.fn(),
    onSkillGroupOpenChange: vi.fn(),
    onAddSkillGroup: vi.fn(),
    onUpdateSkillGroup: vi.fn(),
    onRemoveSkillGroup: vi.fn(),
    onToggleProject: vi.fn(),
    onTracerLinksEnabledChange: vi.fn(),
  };

  const view = render(<TailoringSections {...props} />);

  // The Summary section starts collapsed, so its textarea is not mounted yet.
  fireEvent.click(screen.getByRole("button", { name: "Summary" }));

  return {
    getTextarea: () =>
      screen.getByLabelText("Tailored Summary") as HTMLTextAreaElement,
    setSummary: (next: string) =>
      view.rerender(<TailoringSections {...props} summary={next} />),
    toggleSummary: () =>
      fireEvent.click(screen.getByRole("button", { name: "Summary" })),
  };
};

describe("TailoringSections summary field", () => {
  it("shows a word count that toggles to characters and back on click", () => {
    renderSections("Tailored resume summary");

    fireEvent.click(screen.getByRole("button", { name: "3 words" }));
    expect(
      screen.getByRole("button", { name: "23 characters" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "23 characters" }));
    expect(screen.getByRole("button", { name: "3 words" })).toBeInTheDocument();
  });

  it("shows zero words for an empty summary", () => {
    renderSections("");
    expect(screen.getByRole("button", { name: "0 words" })).toBeInTheDocument();
  });

  it("grows the textarea to fit content and caps it at the shared maximum", () => {
    const { getTextarea, setSummary } = renderSections("short");
    const textarea = getTextarea();

    mockElementMeasurement(textarea, { width: 400, height: 180 });
    setSummary("a somewhat longer summary");
    expect(textarea.style.height).toBe("180px");

    mockElementMeasurement(textarea, { width: 400, height: 900 });
    setSummary("a very long summary that overflows the cap");
    expect(textarea.style.height).toBe(`${TAILOR_TEXTAREA_MAX_HEIGHT_PX}px`);
  });

  it("never shrinks the textarea below the shared minimum", () => {
    const { getTextarea, setSummary } = renderSections("short");
    const textarea = getTextarea();

    mockElementMeasurement(textarea, { width: 400, height: 20 });
    setSummary("s");
    expect(textarea.style.height).toBe(`${TAILOR_TEXTAREA_MIN_HEIGHT_PX}px`);
  });

  it("adds border height so the last line is not clipped", () => {
    const { getTextarea, setSummary } = renderSections("short");
    const textarea = getTextarea();

    mockElementMeasurement(textarea, { width: 400, height: 180 });
    // scrollHeight covers content and padding only; borders add 2px here.
    Object.defineProperty(textarea, "clientHeight", {
      configurable: true,
      get: () => 178,
    });
    setSummary("a somewhat longer summary");

    expect(textarea.style.height).toBe("182px");
  });

  it("keeps a manual drag-resize instead of snapping back to the auto height", () => {
    const { getTextarea, setSummary } = renderSections("short");
    const textarea = getTextarea();

    textarea.style.height = "600px";
    mockElementMeasurement(textarea, { width: 400, height: 180 });
    setSummary("edited after the manual resize");

    expect(textarea.style.height).toBe("600px");
  });

  it("keeps any manual nudge until returned to the minimum height", () => {
    const { getTextarea, setSummary } = renderSections("short");
    const textarea = getTextarea();

    mockElementMeasurement(textarea, { width: 400, height: 180 });
    setSummary("a somewhat longer summary");
    expect(textarea.style.height).toBe("180px");

    textarea.style.height = "181px";
    mockElementMeasurement(textarea, { width: 400, height: 210 });
    setSummary("a longer summary after the nudge");
    expect(textarea.style.height).toBe("181px");

    textarea.style.height = `${TAILOR_TEXTAREA_MIN_HEIGHT_PX}px`;
    mockElementMeasurement(textarea, { width: 400, height: 220 });
    setSummary("a longer summary after returning to the minimum");
    expect(textarea.style.height).toBe("220px");
  });

  it("returns to auto height after the Summary field remounts", () => {
    const { getTextarea, setSummary, toggleSummary } = renderSections("short");
    const textarea = getTextarea();

    mockElementMeasurement(textarea, { width: 400, height: 180 });
    setSummary("a somewhat longer summary");
    expect(textarea.style.height).toBe("180px");

    toggleSummary();
    toggleSummary();

    const remountedTextarea = getTextarea();
    mockElementMeasurement(remountedTextarea, { width: 400, height: 210 });
    setSummary("a longer summary after reopening");
    expect(remountedTextarea.style.height).toBe("210px");
  });

  it("shrinks trailing blank-line space after blur", () => {
    const { getTextarea, setSummary } = renderSections("short");
    const textarea = getTextarea();

    fireEvent.focus(textarea);
    mockElementMeasurement(textarea, { width: 400, height: 220 });
    setSummary("hello\n\n\n\n");
    expect(textarea.style.height).toBe("220px");

    mockElementMeasurement(textarea, { width: 400, height: 140 });
    fireEvent.blur(textarea);
    expect(textarea.style.height).toBe("140px");
  });

  it("remeasures the auto height when the field width changes", () => {
    const { getTextarea } = renderSections("short");
    const textarea = getTextarea();

    triggerElementResize(textarea, { width: 240, height: 200 });

    expect(textarea.style.height).toBe("200px");
  });
});
