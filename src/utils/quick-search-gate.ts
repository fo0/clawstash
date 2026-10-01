import { containsAppModal } from './nested-modal';

/**
 * Whether App's Ctrl/Cmd/Alt+K accelerator may toggle the quick-search
 * overlay right now.
 *
 * An open search may always be toggled — the accelerator closes it again.
 * Any other open dialog blocks it: the shortcuts help App tracks itself, and
 * everything App does not track but finds in `root` as `role="dialog"` (a
 * maximized viewer file, Mermaid fullscreen, the graph popups). Opening search
 * on top would stack two modals whose capture-phase focus traps fight over
 * Tab and whose `document` Escape listeners close both layers at once.
 * A `role="dialog"` in rendered Markdown is content and does not block it.
 */
export function canToggleQuickSearch(
  modal: { search: boolean; help: boolean },
  root: ParentNode = document,
): boolean {
  if (modal.search) return true;
  if (modal.help) return false;
  return !containsAppModal(root, '[role="dialog"]');
}
