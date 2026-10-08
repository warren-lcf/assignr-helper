/**
 * Picks the `updated_at` for a write to a draft. It is the clock, but never less than one past
 * the previous value, so every write moves the version strictly forward even when two writes land
 * in the same millisecond or the clock steps back. That is what lets `updated_at` act as the
 * optimistic-concurrency version.
 * @param previous_updated_at The draft's current `updated_at`.
 * @param now UTC milliseconds from the clock.
 * @returns The new `updated_at`.
 */
export function next_draft_version(previous_updated_at: number, now: number): number {
  return Math.max(now, previous_updated_at + 1);
}
