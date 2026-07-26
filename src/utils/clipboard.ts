/**
 * Copy text to clipboard with fallback for non-HTTPS environments.
 * Returns true if copy succeeded, false otherwise.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Try modern Clipboard API first
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard API failed (non-HTTPS, no focus, permissions), try fallback
    }
  }

  // Fallback: hidden textarea + execCommand
  try {
    // The helper textarea steals focus for select() — remember what had
    // focus so it can be restored afterwards.
    const previouslyFocused = document.activeElement;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    // readOnly still allows selection/copy but stops iOS from opening the
    // on-screen keyboard when the textarea is focused.
    textarea.readOnly = true;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
      previouslyFocused.focus();
    }
    return success;
  } catch {
    return false;
  }
}
