import {
  AnimatePresence,
  animate,
  type HTMLMotionProps,
  MotionConfig,
  motion,
  type Transition,
} from "framer-motion";
import React from "react";

// Configurations for the fade-out blur masking on scrolling edges
const MASK_HEIGHT = "var(--mask-height, 0.15em)";
const MASK_WIDTH = "var(--mask-width, 0.5em)";
const GRADIENT_SHAPE = "#000 0, transparent 71%";

const MASK_IMAGE = `linear-gradient(to right, transparent 0, #000 ${MASK_WIDTH}, #000 calc(100% - ${MASK_WIDTH}), transparent),linear-gradient(to bottom, transparent 0, #000 ${MASK_HEIGHT}, #000 calc(100% - ${MASK_HEIGHT}), transparent 100%),radial-gradient(at bottom right, ${GRADIENT_SHAPE}),radial-gradient(at bottom left, ${GRADIENT_SHAPE}), radial-gradient(at top left, ${GRADIENT_SHAPE}), radial-gradient(at top right, ${GRADIENT_SHAPE})`;

const MASK_SIZE = `100% calc(100% - ${MASK_HEIGHT} * 2),calc(100% - ${MASK_WIDTH} * 2) 100%,${MASK_WIDTH} ${MASK_HEIGHT},${MASK_WIDTH} ${MASK_HEIGHT},${MASK_WIDTH} ${MASK_HEIGHT},${MASK_WIDTH} ${MASK_HEIGHT}`;

const DigitWidthMap = new WeakMap<HTMLElement, string>();
const JustifyContext = React.createContext<{ justify: "left" | "right" }>({
  justify: "left",
});
const MotionContext = React.createContext<{ transition: Transition | null }>({
  transition: null,
});

// Utility Hooks & Logic
function useIsFirstRender() {
  const isFirst = React.useRef(true);
  React.useEffect(() => {
    isFirst.current = false;
  }, []);
  return isFirst.current;
}

function calculateEmWidth(element: HTMLElement) {
  const { width, fontSize } = getComputedStyle(element);
  return `${parseFloat(width) / parseFloat(fontSize)}em`;
}

function safeModulo(n: number, m: number) {
  return ((n % m) + m) % m;
}

function NumberMask({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        margin: `0 calc(-1 * ${MASK_WIDTH})`,
        padding: `calc(${MASK_HEIGHT} / 2) ${MASK_WIDTH}`,
        position: "relative",
        zIndex: -1,
        overflow: "clip",
        WebkitMaskImage: MASK_IMAGE,
        WebkitMaskSize: MASK_SIZE,
        WebkitMaskPosition:
          "center, center, top left, top right, bottom right, bottom left",
        WebkitMaskRepeat: "no-repeat",
      }}
    >
      {children}
    </span>
  );
}

interface DigitProps extends HTMLMotionProps<"span"> {
  value: number;
  initialValue?: number;
  trend?: number;
}

// Low-level individual sliding column digit (0-9 strip)
const Digit = React.forwardRef<HTMLSpanElement, DigitProps>(function Digit(
  { value, initialValue = value, trend = 0, ...props },
  ref,
) {
  const { transition } = React.useContext(MotionContext);
  const initialRef = React.useRef(initialValue).current;
  const isFirstRender = useIsFirstRender();
  const containerRef = React.useRef<HTMLSpanElement>(null);
  const elementRef = React.useRef<HTMLSpanElement>(null);

  React.useImperativeHandle(
    ref,
    () => elementRef.current as HTMLSpanElement,
    [],
  );

  const digitRefs = React.useRef<(HTMLSpanElement | null)[]>(
    new Array(10).fill(null),
  );
  const isPresent = true; // Fallback context flag derived from standard layout states
  const targetValue = isPresent ? value : 0;

  React.useLayoutEffect(() => {
    const digitEl = digitRefs.current[initialRef];
    if (containerRef.current && digitEl) {
      containerRef.current.style.width = calculateEmWidth(digitEl);
    }
  }, [initialRef]);

  const previousValueRef = React.useRef(initialValue);

  React.useLayoutEffect(() => {
    if (!containerRef.current || targetValue === previousValueRef.current)
      return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const elementRect = elementRef.current?.getBoundingClientRect();
    const prev = previousValueRef.current;

    let delta = targetValue - prev;
    if (trend > 0 && targetValue < prev) {
      delta = 10 - prev + targetValue;
    } else if (trend < 0 && targetValue > prev) {
      delta = targetValue - 10 - prev;
    }

    const currentOffset = elementRect
      ? elementRect.top || 0
      : containerRect.top;
    const yOffset =
      containerRect.height * delta + (containerRect.top - currentOffset);

    // Animates strip layout positions across calculated transforms
    const controls = animate(
      elementRef.current as HTMLElement,
      { y: [yOffset, 0] },
      {
        type: "spring",
        duration: 0.6,
        bounce: 0,
        ...transition,
      },
    );

    // Also animate the width of containerRef from the previous digit's width to the new digit's width
    const prevDigitEl = digitRefs.current[prev];
    const targetDigitEl = digitRefs.current[targetValue];
    if (prevDigitEl && targetDigitEl) {
      const prevWidth =
        (elementRef.current && DigitWidthMap.get(elementRef.current)) ||
        calculateEmWidth(prevDigitEl);
      const nextWidth = calculateEmWidth(targetDigitEl);

      animate(
        containerRef.current,
        { width: [prevWidth, nextWidth] },
        {
          type: "spring",
          duration: 0.6,
          bounce: 0,
          ...transition,
        },
      );
    }

    return () => {
      controls.stop();
      previousValueRef.current = targetValue;
    };
  }, [targetValue, trend, transition]);

  React.useEffect(() => {
    const digitEl = digitRefs.current[targetValue];
    if ((isFirstRender && initialRef === targetValue) || !digitEl) return;

    const emWidth = calculateEmWidth(digitEl);
    if (elementRef.current) {
      DigitWidthMap.set(elementRef.current, emWidth);
    }
  }, [targetValue, isFirstRender, initialRef]);

  const renderDigitSpan = (num: number) => (
    <span
      key={num}
      style={{
        display: "inline-block",
        padding: `calc(${MASK_HEIGHT} / 2) 0`,
      }}
      ref={(el) => {
        digitRefs.current[num] = el;
      }}
    >
      {num}
    </span>
  );

  const upperDigits: number[] = [];
  const lowerDigits: number[] = [];

  for (let i = 9; i >= 1; i--)
    upperDigits.push(safeModulo(targetValue - i, 10));
  for (let i = 1; i <= 9; i++)
    lowerDigits.push(safeModulo(targetValue + i, 10));

  return (
    <motion.span
      {...props}
      ref={elementRef}
      data-state={isPresent ? undefined : "exiting"}
      style={{ display: "inline-flex", justifyContent: "center" }}
    >
      <span
        ref={containerRef}
        style={{
          display: "inline-flex",
          justifyContent: "center",
          flexDirection: "column",
          alignItems: "center",
          position: "relative",
        }}
      >
        {upperDigits.length > 0 && (
          <span style={{ ...DIGIT_COLUMN_STYLE, bottom: "100%", left: 0 }}>
            {upperDigits.map((num) => renderDigitSpan(num))}
          </span>
        )}
        {renderDigitSpan(targetValue)}
        {lowerDigits.length > 0 && (
          <span style={{ ...DIGIT_COLUMN_STYLE, top: "100%", left: 0 }}>
            {lowerDigits.map((num) => renderDigitSpan(num))}
          </span>
        )}
      </span>
    </motion.span>
  );
});

const DIGIT_COLUMN_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  position: "absolute",
  width: "100%",
};

interface TextPartProps extends HTMLMotionProps<"span"> {
  partKey: string;
  type: string;
}

// Layout text wrapper parsing dynamic currencies, prefixes, signs
const TextPart = React.forwardRef<HTMLSpanElement, TextPartProps>(
  function TextPart({ partKey, type, children, ...props }, ref) {
    const isPresent = true;
    const { justify } = React.useContext(JustifyContext);

    return (
      <motion.span
        {...props}
        ref={ref}
        data-state={isPresent ? undefined : "exiting"}
        style={{
          display: "inline-flex",
          justifyContent: justify === "left" ? "flex-start" : "flex-end",
          padding: `calc(${MASK_HEIGHT} / 2) 0`,
          position: "relative",
        }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={children as string}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ display: "inline-block", whiteSpace: "pre" }}
          >
            {children}
          </motion.span>
        </AnimatePresence>
      </motion.span>
    );
  },
);

interface NumberPart {
  type: string;
  value: string | number;
  key: string;
}

interface NumberSectionProps extends React.HTMLProps<HTMLSpanElement> {
  parts: NumberPart[];
  justify?: "left" | "right";
  mode?: "popLayout" | "sync" | "wait";
  name: string;
  trend: number;
}

const NumberSection = React.forwardRef<HTMLSpanElement, NumberSectionProps>(
  function NumberSection(
    { parts, justify = "left", mode, style, name, trend, ...props },
    ref,
  ) {
    const containerRef = React.useRef<HTMLSpanElement>(null);
    React.useImperativeHandle(
      ref,
      () => containerRef.current as HTMLSpanElement,
      [],
    );

    const contextValue = React.useMemo(() => ({ justify }), [justify]);
    const innerRef = React.useRef<HTMLSpanElement>(null);
    const isFirstRender = useIsFirstRender();

    return (
      <JustifyContext.Provider value={contextValue}>
        <span
          {...props}
          ref={containerRef}
          className={`number-section-${name}`}
          style={{
            ...style,
            display: "inline-flex",
            justifyContent: justify,
          }}
        >
          <span
            ref={innerRef}
            style={{
              display: "inline-flex",
              justifyContent: "inherit",
              position: "relative",
            }}
          >
            {"\u200B"}
            <AnimatePresence mode={mode} initial={false}>
              {parts.map((part) =>
                part.type === "integer" || part.type === "fraction" ? (
                  <Digit
                    key={part.key}
                    value={part.value as number}
                    initialValue={isFirstRender ? undefined : 0}
                    trend={trend}
                  />
                ) : (
                  <TextPart
                    key={
                      part.type === "literal"
                        ? `${part.key}:${part.value}`
                        : part.key
                    }
                    type={part.type}
                    partKey={part.key}
                  >
                    {part.value as string}
                  </TextPart>
                ),
              )}
            </AnimatePresence>
          </span>
        </span>
      </JustifyContext.Provider>
    );
  },
);

interface ParsedParts {
  pre: NumberPart[];
  integer: NumberPart[];
  fraction: NumberPart[];
  post: NumberPart[];
  formatted: string;
}

type TemporaryPart = { type: string; value: string | number; key?: string };

function parseNumberToParts(
  value: number | string,
  options: { locales?: string | string[]; format?: Intl.NumberFormatOptions },
  prefix?: string,
  suffix?: string,
): ParsedParts {
  const parts = new Intl.NumberFormat(
    options.locales,
    options.format,
  ).formatToParts(Number(value));

  const finalParts = [...parts] as Array<{ type: string; value: string }>;

  if (prefix) finalParts.unshift({ type: "prefix", value: prefix });
  if (suffix) finalParts.push({ type: "suffix", value: suffix });

  const preParts: NumberPart[] = [];
  const integerParts: TemporaryPart[] = [];
  const decimalParts: NumberPart[] = [];
  const postParts: NumberPart[] = [];
  const keyCounters: Record<string, number> = {};

  const generateKey = (type: string) => {
    keyCounters[type] = (keyCounters[type] ?? -1) + 1;
    return `${type}:${keyCounters[type]}`;
  };

  let formattedString = "";
  let hasInteger = false;
  let hasDecimal = false;

  for (const part of finalParts) {
    formattedString += part.value;
    const resolvedType =
      part.type === "minusSign" || part.type === "plusSign"
        ? "sign"
        : part.type;

    switch (resolvedType) {
      case "integer":
        hasInteger = true;
        integerParts.push(
          ...part.value
            .split("")
            .map((char) => ({ type: resolvedType, value: parseInt(char, 10) })),
        );
        break;
      case "group":
        integerParts.push({ type: resolvedType, value: part.value });
        break;
      case "decimal":
        hasDecimal = true;
        decimalParts.push({
          type: resolvedType,
          value: part.value,
          key: generateKey(resolvedType),
        });
        break;
      case "fraction":
        decimalParts.push(
          ...part.value.split("").map((char) => ({
            type: resolvedType,
            value: parseInt(char, 10),
            key: generateKey(resolvedType),
          })),
        );
        break;
      default:
        (hasInteger || hasDecimal ? postParts : preParts).push({
          type: resolvedType,
          value: part.value,
          key: generateKey(resolvedType),
        });
    }
  }

  const finalizedIntegerParts: NumberPart[] = [];
  for (let i = integerParts.length - 1; i >= 0; i--) {
    finalizedIntegerParts.unshift({
      ...integerParts[i],
      key: generateKey(integerParts[i].type),
    } as NumberPart);
  }

  return {
    pre: preParts,
    integer: finalizedIntegerParts,
    fraction: decimalParts,
    post: postParts,
    formatted: formattedString,
  };
}

const DEFAULT_TRANSITION = {
  opacity: { duration: 1, ease: "easeInOut" },
  y: { type: "spring", duration: 1, bounce: 0 },
  width: { type: "spring", duration: 1, bounce: 0 },
} as const;

interface AnimatedNumberProps extends HTMLMotionProps<"span"> {
  children: number | string;
  locales?: string | string[];
  format?: Intl.NumberFormatOptions;
  transition?: Transition;
  suffix?: string;
  prefix?: string;
  trend?: number | ((prev: number, next: number) => number);
}

// MAIN EXPORTED COMPONENT
export const AnimatedNumber = React.forwardRef<
  HTMLSpanElement,
  AnimatedNumberProps
>(function AnimatedNumber(
  {
    children,
    locales,
    format,
    transition,
    style,
    suffix,
    prefix,
    trend,
    ...props
  },
  ref,
) {
  const parsedParts = React.useMemo(
    () => parseNumberToParts(children, { locales, format }, prefix, suffix),
    [children, locales, format, prefix, suffix],
  );

  const { pre, integer, fraction, post, formatted } = parsedParts;
  const contextTransition = React.useContext(MotionContext)?.transition;
  const activeTransition =
    transition ?? contextTransition ?? DEFAULT_TRANSITION;

  const numericValue =
    typeof children === "string" ? parseFloat(children) : Number(children);
  const previousValueRef = React.useRef(numericValue);
  const prevValue = previousValueRef.current;
  previousValueRef.current = numericValue;

  let calculatedTrend: number;
  if (typeof trend === "function") {
    calculatedTrend = trend(prevValue, numericValue);
  } else if (trend !== undefined) {
    calculatedTrend = trend;
  } else {
    calculatedTrend = Math.sign(numericValue - prevValue);
  }

  return (
    <MotionConfig transition={activeTransition}>
      <motion.span
        role="img"
        aria-label={formatted}
        {...props}
        ref={ref}
        style={{
          lineHeight: 1,
          ...style,
          display: "inline-flex",
          isolation: "isolate",
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            position: "absolute",
            width: "1px",
            height: "1px",
            padding: "0",
            margin: "-1px",
            overflow: "hidden",
            clip: "rect(0, 0, 0, 0)",
            whiteSpace: "nowrap",
            border: "0",
          }}
        >
          {formatted}
        </span>
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            direction: "ltr",
            isolation: "isolate",
            position: "relative",
            zIndex: 1,
          }}
        >
          <NumberSection
            style={{ padding: `calc(${MASK_HEIGHT} / 2) 0` }}
            aria-hidden
            justify="right"
            mode="popLayout"
            parts={pre}
            name="pre"
            trend={calculatedTrend}
          />
          <NumberMask>
            <NumberSection
              justify="right"
              parts={integer}
              name="integer"
              trend={calculatedTrend}
            />
            <NumberSection
              justify="left"
              parts={fraction}
              name="fraction"
              trend={calculatedTrend}
            />
          </NumberMask>
          <NumberSection
            style={{ padding: `calc(${MASK_HEIGHT} / 2) 0` }}
            aria-hidden
            mode="popLayout"
            parts={post}
            name="post"
            trend={calculatedTrend}
          />
        </span>
      </motion.span>
    </MotionConfig>
  );
});
