export type GhostwriterContextBudgetOptions<TInput, TOutput> = {
  maxItemChars: number;
  maxTotalChars: number;
  getContent: (item: TInput) => string;
  mapItem: (input: {
    item: TInput;
    content: string;
    wasTrimmed: boolean;
  }) => TOutput;
};

export type GhostwriterContextBudgetResult<TItem> = {
  items: TItem[];
  totalContentChars: number;
  wasTotalTrimmed: boolean;
};

export function normalizeGhostwriterSelectedContextIds(
  selectedIds: readonly string[],
): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const selectedId of selectedIds) {
    const trimmed = selectedId.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

export function buildGhostwriterContextBudgetItems<TInput, TOutput>(
  sourceItems: readonly TInput[],
  options: GhostwriterContextBudgetOptions<TInput, TOutput>,
): GhostwriterContextBudgetResult<TOutput> {
  let remainingTotal = options.maxTotalChars;
  let totalContentChars = 0;
  let wasTotalTrimmed = false;

  const items = sourceItems.map((item) => {
    const content = options.getContent(item).trim();
    const perItemContent = content.slice(0, options.maxItemChars);
    const finalContent = perItemContent.slice(0, Math.max(remainingTotal, 0));
    const wasTrimmed =
      content.length > finalContent.length ||
      perItemContent.length > finalContent.length;

    totalContentChars += content.length;
    remainingTotal -= finalContent.length;
    if (perItemContent.length > finalContent.length) {
      wasTotalTrimmed = true;
    }

    return options.mapItem({
      item,
      content: finalContent,
      wasTrimmed,
    });
  });

  return {
    items,
    totalContentChars,
    wasTotalTrimmed,
  };
}
