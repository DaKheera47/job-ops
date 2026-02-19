export async function asyncPool<TItem, TResult>(args: {
  items: readonly TItem[];
  concurrency: number;
  shouldStop?: () => boolean;
  task: (item: TItem, index: number) => Promise<TResult>;
}): Promise<TResult[]> {
  const { items, task, shouldStop } = args;
  const rawConcurrency = Number.isFinite(args.concurrency)
    ? args.concurrency
    : 1;
  const safeConcurrency = Math.max(1, Math.min(10, Math.floor(rawConcurrency)));

  if (items.length === 0) return [];

  const UNSET = Symbol("unset");
  const results: Array<TResult | typeof UNSET> = Array.from(
    { length: items.length },
    () => UNSET,
  );
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      if (shouldStop?.()) return;

      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;

      results[currentIndex] = await task(items[currentIndex], currentIndex);
    }
  };

  const workerCount = Math.min(safeConcurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results.filter((value): value is TResult => value !== UNSET);
}
