import type { Story } from "@ladle/react";
import NumberFlow from "@number-flow/react";
import { Minus, Pause, Play, Plus, RotateCcw } from "lucide-react";
import React from "react";

const CYCLE_VALUES = [92, 93, 99, 100, 8, 0, 42, 78, 122, 5, 87, 90];

const buttonClassName =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border/70 bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const clampValue = (value: number) => Math.max(-999, Math.min(9999, value));

export const Playground: Story = () => {
  const [value, setValue] = React.useState(92);
  const [isCycling, setIsCycling] = React.useState(true);
  const cycleIndexRef = React.useRef(0);

  React.useEffect(() => {
    if (!isCycling) return;

    const intervalId = window.setInterval(() => {
      cycleIndexRef.current = (cycleIndexRef.current + 1) % CYCLE_VALUES.length;
      setValue(CYCLE_VALUES[cycleIndexRef.current]);
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [isCycling]);

  const setManualValue = (nextValue: number) => {
    setIsCycling(false);
    setValue(clampValue(nextValue));
  };

  const reset = () => {
    cycleIndexRef.current = 0;
    setValue(CYCLE_VALUES[0]);
  };

  return (
    <main className="min-h-[420px] bg-background p-6 text-foreground">
      <section className="mx-auto flex max-w-2xl flex-col gap-6 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            NumberFlow
          </p>
          <div className="flex items-end justify-between gap-4">
            <div className="text-7xl font-semibold leading-none tabular-nums">
              <NumberFlow value={value} isolate />
            </div>
            <button
              type="button"
              className={buttonClassName}
              onClick={() => setIsCycling((current) => !current)}
            >
              {isCycling ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {isCycling ? "Pause" : "Play"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={buttonClassName}
            onClick={() => setManualValue(value - 10)}
          >
            <Minus className="h-4 w-4" />
            10
          </button>
          <button
            type="button"
            className={buttonClassName}
            onClick={() => setManualValue(value - 1)}
          >
            <Minus className="h-4 w-4" />1
          </button>
          <button
            type="button"
            className={buttonClassName}
            onClick={() => setManualValue(value + 1)}
          >
            <Plus className="h-4 w-4" />1
          </button>
          <button
            type="button"
            className={buttonClassName}
            onClick={() => setManualValue(value + 10)}
          >
            <Plus className="h-4 w-4" />
            10
          </button>
          <button type="button" className={buttonClassName} onClick={reset}>
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {CYCLE_VALUES.map((candidate) => (
            <button
              type="button"
              key={candidate}
              className={`${buttonClassName} justify-between`}
              onClick={() => setManualValue(candidate)}
            >
              <span>{candidate}</span>
              {candidate === value ? (
                <span className="text-muted-foreground">active</span>
              ) : null}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
};

Playground.storyName = "Playground";
