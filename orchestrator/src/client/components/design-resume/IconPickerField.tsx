import { Icon } from "@iconify/react";
import tablerIcons from "@iconify-json/tabler/icons.json";
import { Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// All tabler icon keys (e.g. "a-b", "brand-python", …)
const ALL_ICONS: string[] = Object.keys(
  (tablerIcons as { icons: Record<string, unknown> }).icons,
);

const MAX_VISIBLE = 300;

interface IconPickerFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}

export function IconPickerField({ id, value, onChange }: IconPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Strip prefix for display/matching — value stored as "tabler:brand-python"
  const storedToKey = (v: string) => (v.startsWith("tabler:") ? v.slice(7) : v);
  const keyToStored = (k: string) => `tabler:${k}`;

  const selectedKey = storedToKey(value);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = q ? ALL_ICONS.filter((k) => k.includes(q)) : ALL_ICONS;
    return list.slice(0, MAX_VISIBLE);
  }, [search]);

  const handleSelect = (key: string) => {
    onChange(keyToStored(key));
    setOpen(false);
    setSearch("");
  };

  const handleClear = () => {
    onChange("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          // Focus search after popover opens
          setTimeout(() => searchRef.current?.focus(), 50);
        } else {
          setSearch("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          title={value || "Pick an icon"}
          className="flex h-10 w-10 shrink-0 items-center justify-center bg-transparent transition-colors hover:bg-accent focus:outline-none"
        >
          {value ? (
            <Icon icon={value} width={22} height={22} />
          ) : (
            <span className="text-xl leading-none text-muted-foreground">
              +
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-80 p-0 shadow-xl"
        align="start"
        side="bottom"
        sideOffset={6}
        style={{ zIndex: 9999 }}
      >
        {/* Search */}
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            ref={searchRef}
            className="h-8 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
            placeholder="Search for an icon"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Icon grid */}
        <div
          className="grid max-h-72 grid-cols-8 gap-0.5 overflow-y-auto overscroll-contain p-2"
          onWheelCapture={(e) => e.stopPropagation()}
          onTouchMoveCapture={(e) => e.stopPropagation()}
        >
          {filtered.length === 0 ? (
            <p className="col-span-8 py-6 text-center text-sm text-muted-foreground">
              No icons found.
            </p>
          ) : (
            filtered.map((key) => (
              <button
                key={key}
                type="button"
                title={key}
                onClick={() => handleSelect(key)}
                className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
                  selectedKey === key
                    ? "bg-[#F1703E] text-white"
                    : "hover:bg-accent"
                }`}
              >
                <Icon icon={`tabler:${key}`} width={20} height={20} />
              </button>
            ))
          )}
        </div>

        {/* Footer: selected name + clear */}
        <div className="flex items-center justify-between border-t px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {selectedKey || ""}
          </span>
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-[#F1703E] hover:underline"
            >
              clear
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
