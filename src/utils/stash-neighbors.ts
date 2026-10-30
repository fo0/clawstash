/**
 * The stashes either side of the open one, in the order the dashboard and the
 * sidebar show them. The viewer's "Previous" / "Next" buttons and its `k` / `j`
 * hotkeys step through the list with these, so reading a run of stashes no
 * longer means going back to the list between each one.
 */
export interface StashNeighbor {
  id: string;
  /** Same fallback as the card, the viewer and "Recently viewed". */
  title: string;
}

export interface StashNeighbors {
  previous: StashNeighbor | null;
  next: StashNeighbor | null;
}

/**
 * Neighbours of `id` in `ordered`, or `null` when the stash is not in the list
 * at all (opened from a deep link, quick search, or filtered out). `null` lets
 * the viewer hide the controls instead of offering a step that has no anchor.
 * The ends of the list yield a `null` side, not a wrap-around.
 */
export function findStashNeighbors(
  ordered: readonly { id: string; name: string; files: readonly { filename: string }[] }[],
  id: string,
): StashNeighbors | null {
  const index = ordered.findIndex((s) => s.id === id);
  if (index === -1) return null;
  const toNeighbor = (s: (typeof ordered)[number] | undefined): StashNeighbor | null =>
    s ? { id: s.id, title: s.name || s.files[0]?.filename || 'Untitled' } : null;
  return { previous: toNeighbor(ordered[index - 1]), next: toNeighbor(ordered[index + 1]) };
}
