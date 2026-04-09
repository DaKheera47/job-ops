import Link from "@tiptap/extension-link";
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
};

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write something useful...",
  className,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noreferrer noopener",
          target: "_blank",
        },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          "min-h-[160px] rounded-b-xl border border-t-0 border-border/60 bg-background/60 px-4 py-3 text-sm leading-6 text-foreground outline-none focus-visible:ring-0",
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
        <div className="ml-auto px-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
          HTML
        </div>
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
