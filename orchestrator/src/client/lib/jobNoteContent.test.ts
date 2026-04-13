import { describe, expect, it } from "vitest";
import { editorHtmlToMarkdown, markdownToEditorHtml } from "./jobNoteContent";

describe("job note content bridge", () => {
  it("renders markdown into TipTap-friendly html", () => {
    const html = markdownToEditorHtml(
      "## Fit\n\n- mission\n- team\n\n[site](https://example.com)",
    );

    expect(html).toContain("<h2>Fit</h2>");
    expect(html).toContain("<ul>");
    expect(html).toContain('<a href="https://example.com">site</a>');
  });

  it("serializes TipTap html back to markdown", () => {
    const markdown = editorHtmlToMarkdown(
      `<h2>Fit</h2>
       <p>Because <strong>yes</strong> and <a href="https://example.com/docs">docs</a>.</p>
       <ul><li>mission</li><li>team</li></ul>`,
    );

    expect(markdown).toContain("## Fit");
    expect(markdown).toContain(
      "Because **yes** and [docs](https://example.com/docs).",
    );
    expect(markdown).toContain("- mission");
    expect(markdown).toContain("- team");
  });

  it("preserves backslashes without double escaping them", () => {
    const markdown = editorHtmlToMarkdown(`<p>C:\\temp\\notes\\draft.md</p>`);

    expect(markdown).toBe(String.raw`C:\\temp\\notes\\draft.md`);
  });

  it("serializes balanced parentheses in link urls safely", () => {
    const markdown = editorHtmlToMarkdown(
      `<p><a href="https://example.com/foo(bar)">Docs</a></p>`,
    );

    expect(markdown).toBe("[Docs](https://example.com/foo%28bar%29)");
  });

  it("keeps br tags as hard breaks instead of collapsing them to spaces", () => {
    const markdown = editorHtmlToMarkdown(`<p>line one<br>line two</p>`);

    expect(markdown).toBe("line one  \nline two");
  });
});
