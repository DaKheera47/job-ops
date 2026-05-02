import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { showErrorToast } from "./error-toast";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(() => "toast-id"),
  },
}));

describe("error-toast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("formats unknown errors before showing an error toast", () => {
    const id = showErrorToast(
      new Error(
        `${JSON.stringify([
          {
            validation: "url",
            code: "invalid_string",
            message: "Invalid url",
            path: ["job", "jobUrl"],
          },
        ])} (requestId: 541baba5-26cf-4e23-8e8b-5bd9f7a5f68e)`,
      ),
      "Failed to import job",
      { id: "import-job" },
    );

    expect(id).toBe("toast-id");
    expect(toast.error).toHaveBeenCalledWith("Please enter a valid job URL.", {
      id: "import-job",
    });
  });
});
