import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

interface ChoiceCardOption<T extends string> {
  value: T;
  label: string;
  description: string;
}

interface AutomaticChoiceCardGroupProps<T extends string> {
  ariaLabel: string;
  value: T;
  options: ChoiceCardOption<T>[];
  columns: 2 | 4;
  onValueChange: (value: T) => void;
}

export function AutomaticChoiceCardGroup<T extends string>({
  ariaLabel,
  value,
  options,
  columns,
  onValueChange,
}: AutomaticChoiceCardGroupProps<T>) {
  return (
    <RadioGroup
      aria-label={ariaLabel}
      value={value}
      onValueChange={(nextValue) => onValueChange(nextValue as T)}
      className={cn(
        "grid gap-2",
        columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4",
      )}
    >
      {options.map((option) => {
        const id = `${ariaLabel.toLowerCase().replaceAll(" ", "-")}-${option.value}`;
        return (
          <label
            key={option.value}
            htmlFor={id}
            className="flex min-h-20 cursor-pointer items-start gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
          >
            <RadioGroupItem id={id} value={option.value} className="mt-0.5" />
            <span className="flex flex-col gap-1">
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-xs leading-4 text-muted-foreground">
                {option.description}
              </span>
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
