import * as React from "react";
import {
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";

import { cn } from "@/lib/utils";

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    icon?: React.ComponentType<{ className?: string }>;
    color?: string;
  }
>;

const ChartConfigContext = React.createContext<ChartConfig | null>(null);

const useChartConfig = () => React.useContext(ChartConfigContext);

const ChartStyle: React.FC<{ id: string; config: ChartConfig }> = ({
  id,
  config,
}) => {
  const entries = Object.entries(config).filter(([, value]) => value.color);
  if (entries.length === 0) return null;

  return (
    <style>{`
      [data-chart="${id}"] {
        ${entries
          .map(([key, value]) => `--color-${key}: ${value.color};`)
          .join("\n")}
      }
    `}</style>
  );
};

export const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    config: ChartConfig;
    children?: React.ReactElement | null;
  }
>(({ id, className, children, config, ...props }, ref) => {
  const generatedId = React.useId();
  const chartId = id ?? generatedId;

  return (
    <ChartConfigContext.Provider value={config}>
      <div
        ref={ref}
        data-chart={chartId}
        className={cn("flex aspect-video justify-center text-xs", className)}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        {React.isValidElement(children) ? (
          <ResponsiveContainer>{children}</ResponsiveContainer>
        ) : null}
      </div>
    </ChartConfigContext.Provider>
  );
});
ChartContainer.displayName = "ChartContainer";

export const ChartTooltip = RechartsTooltip;

export type ChartTooltipContentProps = React.ComponentPropsWithoutRef<"div"> &
  Pick<TooltipProps<number, string>, "active" | "payload" | "label"> & {
    indicator?: "dot" | "line" | "dashed";
    labelFormatter?: (value: unknown, payload: unknown[]) => React.ReactNode;
    formatter?: (
      value: unknown,
      name: string,
      item: unknown,
      index: number,
    ) => React.ReactNode;
    nameKey?: string;
  };

export const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  ChartTooltipContentProps
>(
  (
    {
      active,
      payload,
      label,
      className,
      indicator = "dot",
      labelFormatter,
      formatter,
      nameKey,
      ...props
    },
    ref,
  ) => {
    const config = useChartConfig() ?? {};
    if (!active || !payload?.length) return null;
    const formattedLabel = labelFormatter
      ? labelFormatter(label, payload)
      : label;

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg border border-border/60 bg-background px-3 py-2 text-xs shadow-sm",
          className,
        )}
        {...props}
      >
        {formattedLabel ? (
          <div className="mb-2 text-[11px] font-medium text-muted-foreground">
            {formattedLabel}
          </div>
        ) : null}
        <div className="space-y-1">
          {payload.map((item, index) => {
            const dataKey = String(item.dataKey ?? item.name ?? "");
            const configKey = nameKey ?? dataKey;
            const entry = config[configKey] ?? config[dataKey];
            const IndicatorIcon = entry?.icon;
            const value = formatter
              ? formatter(item.value, dataKey, item, index)
              : item.value;
            const labelText = entry?.label ?? item.name ?? dataKey;
            const indicatorColor =
              entry?.color ?? item.color ?? item.fill ?? "currentColor";

            return (
              <div
                key={`${dataKey}-${String(index)}`}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  {IndicatorIcon ? (
                    <IndicatorIcon className="h-3.5 w-3.5" />
                  ) : (
                    <span
                      className={cn(
                        "inline-block",
                        indicator === "dot" && "h-2 w-2 rounded-full",
                        indicator === "line" && "h-0.5 w-3 rounded-full",
                        indicator === "dashed" &&
                          "h-0.5 w-3 rounded-full border border-dashed",
                      )}
                      style={{
                        backgroundColor:
                          indicator === "dot" || indicator === "line"
                            ? indicatorColor
                            : "transparent",
                        borderColor:
                          indicator === "dashed" ? indicatorColor : undefined,
                      }}
                    />
                  )}
                  <span>{labelText}</span>
                </div>
                <span className="font-semibold text-foreground">
                  {typeof value === "number"
                    ? value.toLocaleString()
                    : (value as React.ReactNode)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);
ChartTooltipContent.displayName = "ChartTooltipContent";
