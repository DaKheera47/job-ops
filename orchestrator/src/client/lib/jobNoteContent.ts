import MarkdownIt from "markdown-it";

const markdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
});

const ESCAPE_RE = /([`*_{}()[\]#+>])/g;

const escapeMarkdownText = (value: string) =>
  value.replaceAll("\\", "\\\\").replace(ESCAPE_RE, "\\$1");

const escapeLinkTarget = (value: string) =>
  encodeURI(value.trim()).replaceAll("(", "%28").replaceAll(")", "%29");

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ");

const isElement = (node: Node): node is HTMLElement =>
  node.nodeType === Node.ELEMENT_NODE;

function serializeInlineNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeMarkdownText(normalizeWhitespace(node.textContent ?? ""));
  }

  if (!isElement(node)) return "";

  const tag = node.tagName.toLowerCase();
  switch (tag) {
    case "strong":
    case "b":
      return `**${serializeInlineChildren(node)}**`;
    case "em":
    case "i":
      return `*${serializeInlineChildren(node)}*`;
    case "code":
      return `\`${escapeMarkdownText(node.textContent ?? "")}\``;
    case "a": {
      const href = node.getAttribute("href")?.trim();
      const label = serializeInlineChildren(node).trim();
      if (!href) return label;
      return `[${label || escapeMarkdownText(href)}](${escapeLinkTarget(href)})`;
    }
    case "br":
      return "  \n";
    case "span":
    case "div":
    case "body":
      return serializeInlineChildren(node);
    default:
      return serializeInlineChildren(node);
  }
}

function serializeInlineChildren(node: ParentNode): string {
  return Array.from(node.childNodes)
    .map((child) => serializeInlineNode(child))
    .join("");
}

function serializeBlockNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = normalizeWhitespace(node.textContent ?? "").trim();
    return text ? escapeMarkdownText(text) : "";
  }

  if (!isElement(node)) return "";

  const tag = node.tagName.toLowerCase();
  switch (tag) {
    case "p":
      return serializeInlineChildren(node).trim();
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return `${"#".repeat(Number(tag.slice(1)))} ${serializeInlineChildren(node).trim()}`;
    case "ul":
      return serializeList(node, false);
    case "ol":
      return serializeList(node, true);
    case "blockquote": {
      const body = serializeBlockChildren(node).trim();
      return body
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    }
    case "pre": {
      const code = node.querySelector("code")?.textContent ?? node.textContent;
      return `\`\`\`\n${(code ?? "").replace(/\n$/, "")}\n\`\`\``;
    }
    case "li":
      return serializeListItem(node);
    case "hr":
      return "---";
    case "div":
    case "section":
    case "article":
    case "body":
      return serializeBlockChildren(node);
    default:
      return serializeInlineChildren(node).trim();
  }
}

function serializeBlockChildren(node: ParentNode): string {
  return Array.from(node.childNodes)
    .map((child) => serializeBlockNode(child))
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n");
}

function serializeList(node: HTMLElement, ordered: boolean): string {
  const items = Array.from(node.children).filter(
    (child): child is HTMLLIElement => child.tagName.toLowerCase() === "li",
  );

  return items
    .map((item, index) => {
      const content = serializeListItem(item);
      const prefix = ordered ? `${index + 1}. ` : "- ";
      return prefix + content.replaceAll("\n", "\n  ");
    })
    .join("\n");
}

function serializeListItem(node: HTMLElement): string {
  const parts = Array.from(node.childNodes)
    .map((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = (child as HTMLElement).tagName.toLowerCase();
        if (tag === "ul" || tag === "ol" || tag === "blockquote") {
          return serializeBlockNode(child);
        }
      }
      return serializeInlineNode(child);
    })
    .map((value) => value.trim())
    .filter(Boolean);

  return parts.join(" ").trim();
}

export function markdownToEditorHtml(markdown: string): string {
  return markdownIt.render(markdown ?? "");
}

export function editorHtmlToMarkdown(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  return serializeBlockChildren(template.content).trim();
}
