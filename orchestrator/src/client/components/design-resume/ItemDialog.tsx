import { TokenizedInput } from "@client/pages/orchestrator/TokenizedInput";
import { createId } from "@paralleldrive/cuid2";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { IconPickerField } from "./IconPickerField";
import { RichTextEditor } from "./RichTextEditor";

export type ItemFieldType =
  | "text"
  | "number"
  | "textarea"
  | "richtext"
  | "tags"
  | "toggle"
  | "icon";

export type ItemFieldConfig = {
  key: string;
  label: string;
  type: ItemFieldType;
  placeholder?: string;
  required?: boolean;
  min?: number;
  step?: number;
  /** When true on an icon field, render it inline to the left of the next field with no separate label */
  groupWithNext?: boolean;
};

type ItemDialogProps = {
  open: boolean;
  title: string;
  description: string;
  item: Record<string, unknown> | null;
  fields: ItemFieldConfig[];
  onOpenChange: (open: boolean) => void;
  onSave: (item: Record<string, unknown>) => void;
  onDelete?: () => void;
};

function getValue(source: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, source);
}

function setValue(
  source: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const next = structuredClone(source) as Record<string, unknown>;
  const segments = path.split(".");
  let cursor = next;
  for (const segment of segments.slice(0, -1)) {
    const current = cursor[segment];
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1] ?? path] = value;
  return next;
}

function coerceDraftValue(field: ItemFieldConfig, value: unknown) {
  if (field.type === "tags") {
    return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
  }
  if (field.type === "number") {
    return typeof value === "number" ? value : 0;
  }
  if (field.type === "toggle") {
    return typeof value === "boolean" ? value : false;
  }
  return typeof value === "string" ? value : "";
}

function fieldIdForPath(path: string): string {
  return `design-resume-item-${path.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function parseTagInput(input: string): string[] {
  return input
    .split(/[\n,]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeDraftForSave(
  draft: Record<string, unknown>,
  fields: ItemFieldConfig[],
): Record<string, unknown> {
  let next = structuredClone(draft) as Record<string, unknown>;
  for (const field of fields) {
    const currentValue = getValue(next, field.key);
    if (field.type === "text" || field.type === "textarea") {
      if (typeof currentValue === "string") {
        next = setValue(next, field.key, currentValue.trim());
      }
      continue;
    }
    if (field.type === "tags" && Array.isArray(currentValue)) {
      const normalizedTags = currentValue
        .map((entry) => String(entry).trim())
        .filter(Boolean);
      next = setValue(next, field.key, normalizedTags);
    }
  }
  return next;
}

function renderTextField(
  field: ItemFieldConfig,
  value: string | number,
  fieldErrors: Record<string, string>,
  updateField: (path: string, value: unknown) => void,
  setFieldErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  fieldId: string,
  iconPrefix?: React.ReactNode,
) {
  return (
    <div key={field.key} className="grid gap-2">
      <label className="text-sm font-medium" htmlFor={fieldId}>
        {field.label}
        {field.required ? <span className="ml-1 text-rose-400">*</span> : null}
      </label>
      {iconPrefix ? (
        <div
          className={`flex items-stretch overflow-hidden rounded-md border ${fieldErrors[field.key] ? "border-rose-500" : "border-input"} bg-background/60 focus-within:ring-1 focus-within:ring-ring`}
        >
          {/* icon square — borderless, flush left */}
          <div className="flex shrink-0 items-center border-r border-input">
            {iconPrefix}
          </div>
          <input
            id={fieldId}
            type={field.type === "number" ? "number" : "text"}
            value={
              field.type === "number"
                ? String(value as number)
                : (value as string)
            }
            min={field.min}
            step={field.step}
            placeholder={field.placeholder}
            onChange={(event) => {
              if (fieldErrors[field.key]) {
                setFieldErrors((current) => {
                  const next = { ...current };
                  delete next[field.key];
                  return next;
                });
              }
              updateField(
                field.key,
                field.type === "number"
                  ? Number(event.currentTarget.value || 0)
                  : event.currentTarget.value,
              );
            }}
            className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      ) : (
        <Input
          id={fieldId}
          type={field.type === "number" ? "number" : "text"}
          value={
            field.type === "number"
              ? String(value as number)
              : (value as string)
          }
          min={field.min}
          step={field.step}
          placeholder={field.placeholder}
          onChange={(event) => {
            if (fieldErrors[field.key]) {
              setFieldErrors((current) => {
                const next = { ...current };
                delete next[field.key];
                return next;
              });
            }
            updateField(
              field.key,
              field.type === "number"
                ? Number(event.currentTarget.value || 0)
                : event.currentTarget.value,
            );
          }}
          className={
            fieldErrors[field.key]
              ? "border-rose-500 bg-background/60"
              : "bg-background/60"
          }
        />
      )}
      {fieldErrors[field.key] ? (
        <p className="text-xs text-rose-400">{fieldErrors[field.key]}</p>
      ) : null}
    </div>
  );
}

function renderFields(
  fields: ItemFieldConfig[],
  draft: Record<string, unknown>,
  tagDrafts: Record<string, string>,
  fieldErrors: Record<string, string>,
  updateField: (path: string, value: unknown) => void,
  setTagDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  setFieldErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let i = 0;
  while (i < fields.length) {
    const field = fields[i];
    if (!field) break;
    const value = coerceDraftValue(field, getValue(draft, field.key));
    const fieldId = fieldIdForPath(field.key);

    if (field.type === "richtext") {
      nodes.push(
        <div key={field.key} className="grid gap-2">
          <span className="text-sm font-medium">{field.label}</span>
          <RichTextEditor
            value={value as string}
            onChange={(next) => updateField(field.key, next)}
            placeholder={field.placeholder}
          />
        </div>,
      );
      i++;
      continue;
    }

    if (field.type === "textarea") {
      nodes.push(
        <div key={field.key} className="grid gap-2">
          <label className="text-sm font-medium" htmlFor={fieldId}>
            {field.label}
          </label>
          <Textarea
            id={fieldId}
            value={value as string}
            placeholder={field.placeholder}
            onChange={(event) =>
              updateField(field.key, event.currentTarget.value)
            }
            className="min-h-[110px] bg-background/60"
          />
        </div>,
      );
      i++;
      continue;
    }

    if (field.type === "tags") {
      nodes.push(
        <div key={field.key} className="grid gap-2">
          <label className="text-sm font-medium" htmlFor={fieldId}>
            {field.label}
          </label>
          <TokenizedInput
            id={fieldId}
            values={value as string[]}
            draft={tagDrafts[field.key] ?? ""}
            parseInput={parseTagInput}
            onDraftChange={(next) =>
              setTagDrafts((current) => ({ ...current, [field.key]: next }))
            }
            onValuesChange={(next) => updateField(field.key, next)}
            placeholder={field.placeholder ?? "Add a value"}
            helperText="Press Enter, comma, or paste a list to add items."
            removeLabelPrefix="Remove tag"
          />
        </div>,
      );
      i++;
      continue;
    }

    if (field.type === "toggle") {
      nodes.push(
        <div
          key={field.key}
          className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-4 py-3"
        >
          <div>
            <div className="text-sm font-medium">{field.label}</div>
            {field.placeholder ? (
              <div className="text-xs text-muted-foreground">
                {field.placeholder}
              </div>
            ) : null}
          </div>
          <Switch
            checked={value as boolean}
            onCheckedChange={(checked) => updateField(field.key, checked)}
          />
        </div>,
      );
      i++;
      continue;
    }

    // Icon picker — grouped inline to the left of the next field (no separate label)
    if (field.type === "icon" && field.groupWithNext && i + 1 < fields.length) {
      const nextField = fields[i + 1];
      if (nextField) {
        const nextValue = coerceDraftValue(
          nextField,
          getValue(draft, nextField.key),
        );
        const nextFieldId = fieldIdForPath(nextField.key);
        const iconNode = (
          <IconPickerField
            value={value as string}
            onChange={(next) => updateField(field.key, next)}
          />
        );
        nodes.push(
          renderTextField(
            nextField,
            nextValue as string | number,
            fieldErrors,
            updateField,
            setFieldErrors,
            nextFieldId,
            iconNode,
          ),
        );
        i += 2;
        continue;
      }
    }

    // Icon picker — standalone (with label)
    if (field.type === "icon") {
      nodes.push(
        <div key={field.key} className="grid gap-2">
          <label className="text-sm font-medium" htmlFor={fieldId}>
            {field.label}
          </label>
          <IconPickerField
            id={fieldId}
            value={value as string}
            onChange={(next) => updateField(field.key, next)}
          />
        </div>,
      );
      i++;
      continue;
    }

    nodes.push(
      renderTextField(
        field,
        value as string | number,
        fieldErrors,
        updateField,
        setFieldErrors,
        fieldId,
      ),
    );
    i++;
  }
  return nodes;
}

export function ItemDialog({
  open,
  title,
  description,
  item,
  fields,
  onOpenChange,
  onSave,
  onDelete,
}: ItemDialogProps) {
  const initialDraft = useMemo(
    () =>
      structuredClone(
        item ?? {
          id: createId(),
          hidden: false,
          options: { showLinkInTitle: false },
        },
      ) as Record<string, unknown>,
    [item],
  );
  const [draft, setDraft] = useState<Record<string, unknown>>(initialDraft);
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setDraft(initialDraft);
    setTagDrafts({});
    setFieldErrors({});
  }, [initialDraft]);

  const updateField = (path: string, value: unknown) => {
    setDraft((current) => setValue(current, path, value));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto border-border/70 bg-background/95 px-6 pb-6 pt-6">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {renderFields(
            fields,
            draft,
            tagDrafts,
            fieldErrors,
            updateField,
            setTagDrafts,
            setFieldErrors,
          )}
        </div>

        <DialogFooter className="items-center justify-between gap-3 sm:justify-between">
          <div>
            {onDelete ? (
              <Button
                type="button"
                variant="ghost"
                className="text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                onClick={onDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                const normalized = normalizeDraftForSave(draft, fields);
                const errors: Record<string, string> = {};
                for (const field of fields) {
                  if (!field.required) continue;
                  const val = getValue(normalized, field.key);
                  if (
                    (typeof val === "string" && val.trim() === "") ||
                    val === undefined ||
                    val === null
                  ) {
                    errors[field.key] = `${field.label} is required.`;
                  }
                }
                if (Object.keys(errors).length > 0) {
                  setFieldErrors(errors);
                  return;
                }
                setFieldErrors({});
                onSave(normalized);
                onOpenChange(false);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Save item
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
