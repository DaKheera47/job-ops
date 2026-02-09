import { CommandGroup, CommandItem } from "@/components/ui/command";
import { defaultStatusToken, statusTokens } from "./constants";
import { lockLabel, type StatusLock } from "./JobCommandBar.utils";

interface JobCommandBarLockSuggestionsProps {
  suggestions: StatusLock[];
  onSelect: (lock: StatusLock) => void;
}

export const JobCommandBarLockSuggestions = ({
  suggestions,
  onSelect,
}: JobCommandBarLockSuggestionsProps) => {
  if (suggestions.length === 0) return null;

  return (
    <CommandGroup heading="Filters">
      {suggestions.map((lock) => {
        const token = statusTokens[lock] ?? defaultStatusToken;
        return (
          <CommandItem
            key={lock}
            value={`@${lockLabel[lock]} filter`}
            keywords={[`@${lockLabel[lock]}`, lockLabel[lock]]}
            onSelect={() => onSelect(lock)}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${token.dot}`} />
              <span className="truncate text-sm font-medium">
                Lock to @{lockLabel[lock]}
              </span>
            </div>
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
};
