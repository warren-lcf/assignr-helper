/**
 * Orders slot ids so that a numeric suffix sorts numerically (`slot_2` before `slot_10`).
 * Ids sharing a non-numeric prefix compare by their numeric suffix; anything else
 * falls back to plain string order, so the result is a total order.
 * @param left First slot id.
 * @param right Second slot id.
 * @returns A negative number, zero or a positive number, as for `Array.prototype.sort`.
 */
export function compare_slot_ids(left: string, right: string): number {
  const left_match = /^(.*?)(\d+)$/.exec(left);
  const right_match = /^(.*?)(\d+)$/.exec(right);
  if (left_match && right_match && left_match[1] === right_match[1]) {
    const difference = Number(left_match[2]) - Number(right_match[2]);
    if (difference !== 0) {
      return difference;
    }
  }
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
