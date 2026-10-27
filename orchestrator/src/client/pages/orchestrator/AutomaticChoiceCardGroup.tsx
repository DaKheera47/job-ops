import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

export interface ChoiceCardOption<T extends string> {
  value: T;
  label: string;
  description: string;
  ariaLabel?: string;
}

interface AutomaticChoiceCardGroupProps<T extends string> {
  ariaLabel: string;
  value: T;
  options: ChoiceCardOption<T>[];
  columns: 1 | 2 | 3 | 4;
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
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 lg:grid-cols-4",
      )}
    >
      {options.map((option) => {
        const id = `${ariaLabel.toLowerCase().replaceAll(" ", "-")}-${option.value}`;
        return (
          <ChoiceCard
            key={option.value}
            id={id}
            label={option.label}
            description={option.description}
            control={
              <RadioGroupItem
                id={id}
                value={option.value}
                aria-label={option.ariaLabel ?? option.label}
                className="mt-0.5"
              />
            }
          />
        );
      })}
    </RadioGroup>
  );
}

interface AutomaticMultiChoiceCardGroupProps<T extends string> {
  ariaLabel: string;
  values: T[];
  options: ChoiceCardOption<T>[];
  columns: 1 | 2 | 3 | 4;
  onValueChange: (value: T, checked: boolean) => void;
}

export function AutomaticMultiChoiceCardGroup<T extends string>({
  ariaLabel,
  values,
  options,
  columns,
  onValueChange,
}: AutomaticMultiChoiceCardGroupProps<T>) {
  return (
    <fieldset
      aria-label={ariaLabel}
      className={cn(
        "grid gap-2",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 lg:grid-cols-4",
      )}
    >
      {options.map((option) => {
        const id = `${ariaLabel.toLowerCase().replaceAll(" ", "-")}-${option.value}`;
        return (
          <ChoiceCard
            key={option.value}
            id={id}
            label={option.label}
            description={option.description}
            control={
              <Checkbox
                id={id}
                checked={values.includes(option.value)}
                aria-label={option.ariaLabel ?? option.label}
                onCheckedChange={(nextChecked) =>
                  onValueChange(option.value, nextChecked === true)
                }
              />
            }
          />
        );
      })}
    </fieldset>
  );
}

function ChoiceCard({
  id,
  label,
  description,
  control,
}: {
  id: string;
  label: string;
  description: string;
  control: React.ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-20 cursor-pointer items-start gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
    >
      {control}
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs leading-4 text-muted-foreground">
          {description}
        </span>
      </span>
    </label>
  );
}
