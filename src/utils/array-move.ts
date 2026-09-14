/**
 * Move one item of an array to another position.
 *
 * Pulled out of the stash editor because the order of a stash's files lives in
 * two places that must never disagree: the `files` state and the parallel
 * array of stable row ids used as React keys and collapse-set members. Both go
 * through this function so a reorder cannot move one and not the other.
 */

/**
 * Return a NEW array with the item at `from` moved to `to`. The input is never
 * mutated. An out-of-range index at either end returns a copy of the input
 * unchanged — the caller's buttons are disabled at the ends, this is the guard
 * behind them.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = items.slice();
  if (from === to) return next;
  if (from < 0 || from >= items.length) return next;
  if (to < 0 || to >= items.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
