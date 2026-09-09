/** Where "back" out of the graph view leads. */
export type GraphBackDecision =
  | { type: 'home' }
  | { type: 'switch'; stashId: string }
  | { type: 'fetch'; stashId: string };

/**
 * Pure decision behind App's `handleGraphBack` (also reached by Escape through
 * `graphBackRef`). The graph is opened either from the dashboard — no origin
 * stash, so back goes home — or from a stash's "Analyze" button or a
 * `/stash/:id/graph` deep link, which records that stash as the origin. With an
 * origin, back returns to it: `switch` when it is already the loaded stash,
 * `fetch` when a deep link or a reload means it still has to be loaded.
 */
export function resolveGraphBack(
  originStashId: string | null,
  selectedStashId: string | null | undefined,
): GraphBackDecision {
  if (!originStashId) return { type: 'home' };
  if (selectedStashId === originStashId) return { type: 'switch', stashId: originStashId };
  return { type: 'fetch', stashId: originStashId };
}
