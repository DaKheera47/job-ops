import type { DesignResumeJson } from "@shared/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DesignResumeFieldAssistant } from "./DesignResumeFieldAssistant";

const apiMocks = vi.hoisted(() => ({
  generateDesignResumeFieldSuggestion: vi.fn(),
}));

vi.mock("@client/api", () => ({
  generateDesignResumeFieldSuggestion:
    apiMocks.generateDesignResumeFieldSuggestion,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
  },
}));

function makeResumeJson(): DesignResumeJson {
  return {
    basics: {
      name: "Taylor Quinn",
      headline: "Engineer",
      email: "",
      phone: "",
      location: "",
      website: { label: "", url: "" },
      customFields: [],
    },
    summary: {
      title: "Summary",
      columns: 1,
      hidden: false,
      content: "",
    },
    sections: {},
  } as unknown as DesignResumeJson;
}

function dispatchPointerEvent(
  element: Element,
  type: string,
  init: MouseEventInit & { pointerId: number },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  Object.defineProperty(event, "pointerId", { value: init.pointerId });
  fireEvent(element, event);
}

describe("DesignResumeFieldAssistant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("auto-fills an empty field when the suggestion returns", async () => {
    const onApply = vi.fn();
    apiMocks.generateDesignResumeFieldSuggestion.mockResolvedValue({
      message: "Drafted a headline.",
      suggestion: "Platform Engineer",
      valueType: "plain_text",
    });

    render(
      <DesignResumeFieldAssistant
        resumeJson={makeResumeJson()}
        fieldPath="basics.headline"
        label="Headline"
        value=""
        valueType="plain_text"
        section="Basics"
        onApply={onApply}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /open ai assistant for headline/i }),
    );
    fireEvent.change(
      screen.getByPlaceholderText(/ask for a concise rewrite/i),
      {
        target: { value: "Make it stronger" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith("Platform Engineer");
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Headline filled with AI draft.",
    );
    expect(
      screen.queryByRole("button", { name: "Apply" }),
    ).not.toBeInTheDocument();
  });

  it("requires explicit apply when a field already has content", async () => {
    const onApply = vi.fn();
    apiMocks.generateDesignResumeFieldSuggestion.mockResolvedValue({
      message: "Drafted a headline.",
      suggestion: "Senior Platform Engineer",
      valueType: "plain_text",
    });

    render(
      <DesignResumeFieldAssistant
        resumeJson={makeResumeJson()}
        fieldPath="basics.headline"
        label="Headline"
        value="Platform Engineer"
        valueType="plain_text"
        section="Basics"
        onApply={onApply}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /open ai assistant for headline/i }),
    );
    fireEvent.change(
      screen.getByPlaceholderText(/ask for a concise rewrite/i),
      {
        target: { value: "Make it more senior" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    const applyButton = await screen.findByRole("button", { name: "Apply" });
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(applyButton);
    expect(onApply).toHaveBeenCalledWith("Senior Platform Engineer");
  });

  it("lets the AI assistant popover be dragged away from the trigger", () => {
    render(
      <DesignResumeFieldAssistant
        resumeJson={makeResumeJson()}
        fieldPath="basics.headline"
        label="Headline"
        value="Platform Engineer"
        valueType="plain_text"
        section="Basics"
        onApply={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /open ai assistant for headline/i }),
    );

    const handle = screen.getByTestId("design-resume-ai-assistant-drag-handle");
    dispatchPointerEvent(handle, "pointerdown", {
      button: 0,
      clientX: 100,
      clientY: 120,
      pointerId: 1,
    });
    dispatchPointerEvent(handle, "pointermove", {
      clientX: 140,
      clientY: 150,
      pointerId: 1,
    });
    dispatchPointerEvent(handle, "pointerup", { pointerId: 1 });

    expect(
      screen.getByTestId("design-resume-ai-assistant-popover"),
    ).toHaveStyle({ translate: "40px 30px" });
  });
});
