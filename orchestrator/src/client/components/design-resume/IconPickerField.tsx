import * as LucideIcons from "lucide-react";
import { ImageOff, Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type LucideIconComponent = React.ForwardRefExoticComponent<
  Omit<LucideIcons.LucideProps, "ref"> & React.RefAttributes<SVGSVGElement>
>;

function toPascalCase(kebab: string): string {
  return kebab
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

function toKebabCase(pascal: string): string {
  return pascal
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z\d])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

const RXRESUME_ICON_PREFIX = "tabler:";

function toStoredIconName(name: string): string {
  if (!name) return "";
  return name.includes(":") ? name : `${RXRESUME_ICON_PREFIX}${name}`;
}

function toPickerIconName(value: string): string {
  if (!value) return "";
  if (value.includes(":")) return value.split(":").pop() ?? "";
  if (value.endsWith("-logo")) return value.replace(/-logo$/i, "");
  return value;
}

function isIconComponent(value: unknown): value is LucideIconComponent {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  const reactTypeMarker = (obj as { $$typeof?: unknown }).$$typeof;
  return (
    typeof obj.render === "function" || typeof reactTypeMarker !== "undefined"
  );
}

const ICON_REGISTRY: Array<{ name: string; component: LucideIconComponent }> =
  Object.entries(LucideIcons)
    .filter(
      ([key, value]) =>
        isIconComponent(value) &&
        key !== "createLucideIcon" &&
        !key.startsWith("_") &&
        !key.startsWith("Lucide") &&
        !key.endsWith("Icon"),
    )
    .map(([key, value]) => ({
      name: toKebabCase(key),
      component: value as LucideIconComponent,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

function resolveIcon(name: string): LucideIconComponent | null {
  if (!name) return null;
  const normalized = toPickerIconName(name);
  const pascal = toPascalCase(normalized);
  const found = (LucideIcons as Record<string, unknown>)[pascal];
  if (isIconComponent(found)) return found;
  return null;
}

type IconPickerFieldProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
};

export function IconPickerField({ id, value, onChange }: IconPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ICON_REGISTRY;
    return ICON_REGISTRY.filter((entry) => entry.name.includes(q));
  }, [search]);

  const pickerValue = toPickerIconName(value);
  const SelectedIcon = resolveIcon(pickerValue);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setSearch("");
          setTimeout(() => searchRef.current?.focus(), 0);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-label={pickerValue ? `Icon: ${pickerValue}` : "Choose icon"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-input bg-muted/40 text-muted-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {SelectedIcon ? (
            <SelectedIcon size={16} />
          ) : (
            <ImageOff size={14} className="opacity-40" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-80 overflow-hidden p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-b border-border/60 p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              placeholder="Search for an icon"
              className="h-8 bg-background/60 pl-8 text-sm"
            />
          </div>
        </div>

        <div
          className="h-64 overflow-y-auto overscroll-contain p-2"
          onWheelCapture={(event) => {
            // Keep wheel scrolling inside the icon list even when used inside
            // layered containers (dialog + popover).
            event.stopPropagation();
          }}
          onTouchMoveCapture={(event) => {
            event.stopPropagation();
          }}
        >
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No icons found.
            </p>
          ) : (
            <div className="grid grid-cols-8 gap-0.5">
              {filtered.map(({ name, component: Icon }) => (
                <button
                  key={name}
                  type="button"
                  title={name}
                  aria-label={name}
                  aria-pressed={pickerValue === name}
                  onClick={() => {
                    onChange(
                      pickerValue === name ? "" : toStoredIconName(name),
                    );
                    setOpen(false);
                  }}
                  className={`flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                    pickerValue === name ? "bg-primary/15 text-primary" : ""
                  }`}
                >
                  <Icon size={15} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
          {value ? (
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground">{pickerValue}</span>
              <button
                type="button"
                className="text-rose-400 hover:text-rose-300"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                clear
              </button>
            </div>
          ) : (
            <span>Icons appear in RxResume templates only.</span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
