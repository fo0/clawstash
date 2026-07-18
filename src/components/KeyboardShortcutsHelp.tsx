import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  label: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: 'Navigation',
    shortcuts: [
      { keys: ['n'], description: 'New stash' },
      { keys: ['e'], description: 'Edit current stash (in viewer)' },
      { keys: ['a'], description: 'Toggle archived stashes on the dashboard' },
      { keys: ['Esc'], description: 'Back to dashboard / close overlay' },
      { keys: ['?'], description: 'Show / hide keyboard shortcuts' },
    ],
  },
  {
    label: 'Search',
    shortcuts: [
      { keys: ['Alt', 'K'], description: 'Open quick search' },
      { keys: ['/'], description: 'Focus sidebar search' },
    ],
  },
  {
    label: 'Stash Viewer tabs',
    shortcuts: [
      { keys: ['1'], description: 'Content tab' },
      { keys: ['2'], description: 'Details & API tab' },
      { keys: ['3'], description: 'Access Log tab' },
      { keys: ['4'], description: 'History tab' },
    ],
  },
  {
    label: 'Editor',
    shortcuts: [{ keys: ['Ctrl', 'S'], description: 'Save stash (Cmd+S on Mac)' }],
  },
];

export default function KeyboardShortcutsHelp({ open, onClose }: Props) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        // Consume the Escape — without stopPropagation it would continue to
        // App's window-level handler, which would ALSO navigate back to the
        // dashboard from view/edit/graph. (App additionally guards via
        // modalOpenRef — this is defense in depth.)
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Move focus into the dialog on open. Focus otherwise stays on the trigger
  // behind the backdrop, which both breaks the expected dialog tab order and
  // leaves global single-key hotkeys aimed at the page underneath.
  useEffect(() => {
    if (open) closeBtnRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    // NOTE: no aria-hidden on the backdrop — the dialog is its child, and
    // aria-hidden on an ancestor would remove it from the accessibility tree.
    <div className="search-overlay-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="shortcuts-help-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-help-header">
          <span className="shortcuts-help-title">Keyboard Shortcuts</span>
          <button
            type="button"
            ref={closeBtnRef}
            className="btn btn-ghost shortcuts-help-close"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>
        <div className="shortcuts-help-body">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.label} className="shortcuts-group">
              <div className="shortcuts-group-label">{group.label}</div>
              <table className="shortcuts-table">
                <tbody>
                  {group.shortcuts.map((s) => (
                    <tr key={s.description}>
                      <td className="shortcuts-keys">
                        {s.keys.map((k, i) => (
                          <span key={k}>
                            <kbd className="shortcuts-kbd">{k}</kbd>
                            {i < s.keys.length - 1 && <span className="shortcuts-plus">+</span>}
                          </span>
                        ))}
                      </td>
                      <td className="shortcuts-desc">{s.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <div className="shortcuts-help-footer">
          <span>Press</span>
          <kbd className="shortcuts-kbd">?</kbd>
          <span>or</span>
          <kbd className="shortcuts-kbd">Esc</kbd>
          <span>to close</span>
        </div>
      </div>
    </div>
  );
}
