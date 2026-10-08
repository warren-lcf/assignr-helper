/**
 * Runs `worker` over every item with at most `limit` running at the same time, starting items in
 * order. Every item is processed; a worker that throws does not stop the others, and the first
 * thrown error is rethrown once they have all finished.
 * @param items Items to process.
 * @param limit Most workers running at once (at least 1).
 * @param worker Processes one item.
 * @returns Resolves when every item has been processed.
 * @throws The first error a worker threw, after all workers finished.
 */
export async function run_with_concurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const errors: unknown[] = [];
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await worker(item);
      } catch (error) {
        errors.push(error);
      }
    }
  });
  await Promise.all(lanes);
  if (errors.length > 0) {
    throw errors[0];
  }
}
