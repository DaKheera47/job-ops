import { FileImage, ImagePlus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RichTextEditor } from "./RichTextEditor";
import { fieldId, getByPath, toBoolean, toNumber, toText } from "./utils";

const labelClassName =
  "text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground";
const fieldClassName = "bg-background/60";
const insetPanelClassName =
  "rounded-lg border border-border/60 bg-background/60";
const subtlePanelClassName =
  "rounded-lg border border-border/60 bg-muted/20 px-4 py-3";

function normalizeColorValue(value: string): string {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return "#000000";
}

type ColorFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function ColorField({ id, label, value, onChange }: ColorFieldProps) {
  const pickerValue = normalizeColorValue(value);

  return (
    <div className="grid gap-2">
      <label className={labelClassName} htmlFor={id}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={pickerValue}
          onChange={(event) => onChange(event.currentTarget.value)}
          className="h-10 w-12 cursor-pointer rounded-md border border-border/60 bg-background/60 p-1"
          aria-label={label}
        />
        <Input
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          className={fieldClassName}
        />
      </div>
    </div>
  );
}

type PictureSectionProps = {
  picture: Record<string, unknown>;
  pictureUploading: boolean;
  onUploadPicture: () => void;
  onDeletePicture: () => void;
  onUpdatePicture: (key: string, value: unknown) => void;
};

export function PictureSection({
  picture,
  pictureUploading,
  onUploadPicture,
  onDeletePicture,
  onUpdatePicture,
}: PictureSectionProps) {
  return (
    <div className="grid gap-3">
      {picture.url ? (
        <div
          className={`${insetPanelClassName} flex items-center gap-3 border-dashed p-3`}
        >
          <img
            src={toText(picture.url)}
            alt="Design Resume profile"
            className="h-16 w-16 rounded-lg border border-border/60 object-cover"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onUploadPicture}
              disabled={pictureUploading}
            >
              <ImagePlus className="mr-2 h-4 w-4" />
              Replace
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
              onClick={onDeletePicture}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="justify-start border-dashed"
          onClick={onUploadPicture}
          disabled={pictureUploading}
        >
          <FileImage className="mr-2 h-4 w-4" />
          {pictureUploading ? "Uploading..." : "Upload image"}
        </Button>
      )}

      <div className="grid gap-2">
        <label className={labelClassName} htmlFor={fieldId("picture", "url")}>
          Image URL
        </label>
        <Input
          id={fieldId("picture", "url")}
          value={toText(picture.url)}
          onChange={(event) =>
            onUpdatePicture("url", event.currentTarget.value)
          }
          className={fieldClassName}
        />
      </div>

      <div
        className={`${subtlePanelClassName} flex items-center justify-between`}
      >
        <div>
          <div className="text-sm font-medium text-foreground">
            Show picture
          </div>
          <div className="text-xs text-muted-foreground">
            Turn your photo on or off.
          </div>
        </div>
        <Switch
          checked={!toBoolean(picture.hidden, false)}
          onCheckedChange={(checked) => onUpdatePicture("hidden", !checked)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          ["size", "Size"],
          ["rotation", "Rotation"],
          ["aspectRatio", "Aspect ratio"],
          ["borderRadius", "Border radius"],
          ["borderWidth", "Border width"],
          ["shadowWidth", "Shadow width"],
        ].map(([key, label]) => (
          <div key={key} className="grid gap-2">
            <label className={labelClassName} htmlFor={fieldId("picture", key)}>
              {label}
            </label>
            <Input
              id={fieldId("picture", key)}
              type="number"
              value={String(toNumber(picture[key], 0))}
              onChange={(event) =>
                onUpdatePicture(key, Number(event.currentTarget.value || 0))
              }
              className={fieldClassName}
            />
          </div>
        ))}
        {[
          ["borderColor", "Border color"],
          ["shadowColor", "Shadow color"],
        ].map(([key, label]) => (
          <ColorField
            key={key}
            id={fieldId("picture", key)}
            label={label}
            value={toText(picture[key])}
            onChange={(nextValue) => onUpdatePicture(key, nextValue)}
          />
        ))}
      </div>
    </div>
  );
}

type BasicsSectionProps = {
  basics: Record<string, unknown>;
  onUpdateBasics: (path: string, value: unknown) => void;
};

export function BasicsSection({ basics, onUpdateBasics }: BasicsSectionProps) {
  return (
    <div className="grid gap-3">
      {[
        ["name", "Name"],
        ["headline", "Headline"],
        ["email", "Email"],
        ["phone", "Phone"],
        ["location", "Location"],
        ["website.url", "Website"],
      ].map(([path, label]) => (
        <div key={path} className="grid gap-2">
          <label className={labelClassName} htmlFor={fieldId("basics", path)}>
            {label}
          </label>
          <Input
            id={fieldId("basics", path)}
            value={toText(getByPath(basics, path))}
            onChange={(event) =>
              onUpdateBasics(path, event.currentTarget.value)
            }
            className={fieldClassName}
          />
        </div>
      ))}
    </div>
  );
}

type BasicsCustomFieldsSectionProps = {
  customFields: Record<string, unknown>[];
  onChange: (nextFields: Record<string, unknown>[]) => void;
};

export function BasicsCustomFieldsSection({
  customFields,
  onChange,
}: BasicsCustomFieldsSectionProps) {
  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= customFields.length) return;
    const nextFields = [...customFields];
    const [item] = nextFields.splice(index, 1);
    nextFields.splice(target, 0, item);
    onChange(nextFields);
  };

  return (
    <div className="space-y-3">
      {customFields.map((field, index) => (
        <div
          key={toText(field.id, `field-${index}`)}
          className={`${insetPanelClassName} p-3`}
        >
          <div className="grid gap-3">
            {[
              ["icon", "Icon"],
              ["text", "Text"],
              ["link", "Link"],
            ].map(([key, label]) => (
              <div key={key} className="grid gap-2">
                <label
                  className={labelClassName}
                  htmlFor={fieldId("custom-field", String(index), key)}
                >
                  {label}
                </label>
                <Input
                  id={fieldId("custom-field", String(index), key)}
                  value={toText(field[key])}
                  onChange={(event) => {
                    const nextFields = [...customFields];
                    nextFields[index] = {
                      ...nextFields[index],
                      [key]: event.currentTarget.value,
                    };
                    onChange(nextFields);
                  }}
                  className={fieldClassName}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => moveField(index, -1)}
            >
              Up
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => moveField(index, 1)}
            >
              Down
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
              onClick={() =>
                onChange(
                  customFields.filter(
                    (_, currentIndex) => currentIndex !== index,
                  ),
                )
              }
            >
              Remove
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="w-full border-dashed"
        onClick={() =>
          onChange([
            ...customFields,
            {
              id: crypto.randomUUID(),
              icon: "",
              text: "",
              link: "",
            },
          ])
        }
      >
        <Plus className="mr-2 h-4 w-4" />
        Add custom field
      </Button>
    </div>
  );
}

type SummarySectionProps = {
  summary: Record<string, unknown>;
  onUpdateSummary: (key: string, value: unknown) => void;
};

export function SummarySection({
  summary,
  onUpdateSummary,
}: SummarySectionProps) {
  return (
    <div className="space-y-3">
      <div
        className={`${subtlePanelClassName} flex items-center justify-between`}
      >
        <div>
          <div className="text-sm font-medium text-foreground">
            Show summary
          </div>
          <div className="text-xs text-muted-foreground">
            Show or hide this section on your resume.
          </div>
        </div>
        <Switch
          checked={!toBoolean(summary.hidden, false)}
          onCheckedChange={(checked) => onUpdateSummary("hidden", !checked)}
        />
      </div>
      <RichTextEditor
        value={toText(summary.content)}
        onChange={(next) => onUpdateSummary("content", next)}
        placeholder="Summarize the story your resume should tell."
      />
    </div>
  );
}
