import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractPdfJobDescription } from "./pdf-job-description";

const { getDocument, destroy, getPage } = vi.hoisted(() => ({
  getDocument: vi.fn(),
  destroy: vi.fn(),
  getPage: vi.fn(),
}));
vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {}, getDocument }));

function file(name = "role.pdf", size = 100): File {
  return { name, size, arrayBuffer: async () => new ArrayBuffer(10) } as File;
}

describe("extractPdfJobDescription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    destroy.mockResolvedValue(undefined);
    getPage.mockImplementation(async (page: number) => ({
      getTextContent: async () => ({
        items:
          page === 1
            ? [
                { str: "Backend", hasEOL: false },
                { str: "Engineer", hasEOL: true },
                { str: "Acme Labs", hasEOL: true },
              ]
            : [{ str: "Apply by Friday", hasEOL: true }],
      }),
      cleanup: vi.fn(),
    }));
    getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 2, getPage }),
      destroy,
    });
  });

  it("extracts pages in order with readable word and line boundaries", async () => {
    expect(await extractPdfJobDescription(file())).toBe(
      "Backend Engineer\nAcme Labs\n\nApply by Friday",
    );
  });
  it.each([
    ["role.txt", 100],
    ["role.pdf", 10 * 1024 * 1024 + 1],
  ])("rejects unsupported files before parsing (%s)", async (name, size) => {
    await expect(extractPdfJobDescription(file(name, size))).rejects.toThrow(
      /PDF|10 MB/,
    );
    expect(getDocument).not.toHaveBeenCalled();
  });
  it("rejects image-only PDFs with an OCR explanation", async () => {
    getPage.mockResolvedValue({
      getTextContent: async () => ({ items: [] }),
      cleanup: vi.fn(),
    });
    await expect(extractPdfJobDescription(file())).rejects.toThrow(
      /scanned|OCR/,
    );
    expect(destroy).toHaveBeenCalledOnce();
  });
  it("rejects excessive page counts and releases the loading task", async () => {
    getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 101, getPage }),
      destroy,
    });
    await expect(extractPdfJobDescription(file())).rejects.toThrow(/100 pages/);
    expect(getPage).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledOnce();
  });
  it("rejects excessive text instead of truncating the job", async () => {
    getPage.mockResolvedValue({
      getTextContent: async () => ({ items: [{ str: "x".repeat(40001) }] }),
      cleanup: vi.fn(),
    });
    await expect(extractPdfJobDescription(file())).rejects.toThrow(/40,000/);
  });
  it("does not expose parser internals and cleans up failed loads", async () => {
    getDocument.mockImplementation(() => ({
      promise: Promise.reject(new Error("internal parser details")),
      destroy,
    }));
    await expect(extractPdfJobDescription(file())).rejects.toThrow(
      "Could not read this PDF. It may be damaged or password-protected.",
    );
    expect(destroy).toHaveBeenCalledOnce();
  });
});
