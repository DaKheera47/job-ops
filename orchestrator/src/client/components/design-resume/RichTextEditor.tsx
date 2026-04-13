import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Link2, List, ListOrdered, Unlink } from "lucide-react";
import type React from "react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  editorClassName?: string;
  formatLabel?: string | null;
};

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write something useful...",
  className,
  editorClassName,
  formatLabel = "HTML",
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          HTMLAttributes: {
            rel: "noreferrer noopener",
            target: "_blank",
          },
        },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: cn(
          "min-h-[160px] rounded-b-xl border border-t-0 border-border/60 bg-background/60 px-4 py-3 text-sm leading-6 text-foreground outline-none focus-visible:ring-0 [&>*:first-child]:mt-0 [&_h1]:mt-6 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mt-5 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:mt-4 [&_h3]:text-xl [&_h3]:font-semibold [&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-border/70 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_code]:rounded [&_code]:bg-muted/80 [&_code]:px-1 [&_code]:py-0.5",
          editorClassName,
        ),
      },
    },
    onUpdate: ({ editor: current }) => {
      onChange(current.getHTML());
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() === value) return;
    editor.commands.setContent(value || "<p></p>", { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return null;

  const applyLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const next = window.prompt("Enter link URL", previous ?? "");
    if (next === null) return;
    if (!next.trim()) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: next.trim() }).run();
  };

  const toolbarButton = (
    active: boolean,
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
  ) => (
    <Button
      key={label}
      type="button"
      size="sm"
      variant="ghost"
      className={cn(
        "h-8 rounded-md px-2.5 text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        active &&
          "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
      )}
      onClick={onClick}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </Button>
  );

  return (
    <div
      className={cn("rounded-xl border border-border/60 bg-card/40", className)}
    >
      <div className="flex flex-wrap items-center gap-1 rounded-t-xl border-b border-border/60 bg-muted/20 px-2 py-2">
        {toolbarButton(
          editor.isActive("heading", { level: 1 }),
          "Heading 1",
          <span className="text-[11px] font-semibold">H1</span>,
          () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
        )}
        {toolbarButton(
          editor.isActive("heading", { level: 2 }),
          "Heading 2",
          <span className="text-[11px] font-semibold">H2</span>,
          () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        )}
        {toolbarButton(
          editor.isActive("heading", { level: 3 }),
          "Heading 3",
          <span className="text-[11px] font-semibold">H3</span>,
          () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        )}
        {toolbarButton(
          editor.isActive("bold"),
          "Bold",
          <Bold className="h-4 w-4" />,
          () => editor.chain().focus().toggleBold().run(),
        )}
        {toolbarButton(
          editor.isActive("italic"),
          "Italic",
          <Italic className="h-4 w-4" />,
          () => editor.chain().focus().toggleItalic().run(),
        )}
        {toolbarButton(
          editor.isActive("bulletList"),
          "Bullet list",
          <List className="h-4 w-4" />,
          () => editor.chain().focus().toggleBulletList().run(),
        )}
        {toolbarButton(
          editor.isActive("orderedList"),
          "Ordered list",
          <ListOrdered className="h-4 w-4" />,
          () => editor.chain().focus().toggleOrderedList().run(),
        )}
        {toolbarButton(
          editor.isActive("link"),
          "Set link",
          <Link2 className="h-4 w-4" />,
          applyLink,
        )}
        {toolbarButton(
          false,
          "Remove link",
          <Unlink className="h-4 w-4" />,
          () => editor.chain().focus().unsetLink().run(),
        )}
        {formatLabel ? (
          <div className="ml-auto px-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            {formatLabel}
          </div>
        ) : null}
      </div>
      <div className="relative">
        {!value && (
          <div className="pointer-events-none absolute left-4 top-3 text-sm text-muted-foreground/70">
            {placeholder}
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
