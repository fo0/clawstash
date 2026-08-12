/** Outcome of a browser back/forward step taken out of a dirty editor. */
export type PopStateDecision = { type: 'proceed' } | { type: 'restore'; path: string };

/**
 * Pure guard for App's `popstate` handler. `popstate` is not cancellable, so
 * "stay put" means re-pushing `restorePath` after the fact. `confirmDiscard`
 * clears the dirty flag itself, so a confirmed discard never asks twice.
 * Without a recorded path there is nothing to restore to — proceed rather than
 * trap the user on a page whose URL no longer matches.
 */
export function decidePopState(
  dirty: boolean,
  restorePath: string | null,
  confirmDiscard: () => boolean,
): PopStateDecision {
  if (!dirty || !restorePath) return { type: 'proceed' };
  return confirmDiscard() ? { type: 'proceed' } : { type: 'restore', path: restorePath };
}
