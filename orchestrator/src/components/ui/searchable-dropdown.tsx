import { Check, ChevronsUpDown } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface SearchableDropdownOption {
  value: string;
  label: string;
  searchText?: string;
  disabled?: boolean;
}

interface SearchableDropdownProps {
  value: string;
  options: SearchableDropdownOption[];
  onValueChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  ariaLabel?: string;
  disabled?: boolean;
  triggerClassName?: string;
  contentClassName?: string;
  listClassName?: string;
}

export const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
  value,
  options,
  onValueChange,
  placeholder,
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  ariaLabel,
  disabled = false,
  triggerClassName,
  contentClassName,
  listClassName,
}) => {
  const [open, setOpen] = React.useState(false);
  const selectedOption = options.find((option) => option.value === value);
  const triggerLabel = selectedOption?.label ?? placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? triggerLabel}
          disabled={disabled}
          className={cn("justify-between", triggerClassName)}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("w-[320px] p-0", contentClassName)}
      >
        <Command loop>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList
            className={cn("max-h-56", listClassName)}
            onWheelCapture={(event) => event.stopPropagation()}
          >
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const selected = value === option.value;
                const searchableValue = [
                  option.label,
                  option.searchText ?? "",
                  option.value,
                ]
                  .join(" ")
                  .trim();

                return (
                  <CommandItem
                    key={option.value}
                    value={searchableValue}
                    disabled={option.disabled}
                    onSelect={() => {
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <span className="truncate">{option.label}</span>
                    <Check
                      className={cn(
                        "ml-auto h-4 w-4 shrink-0",
                        selected ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
