import { useMemo, useCallback, useState } from 'react';
import Editor from 'react-simple-code-editor';
import type { FileInput } from '../../types';
import { highlightCode, resolvePrismLanguage } from '../../languages';

interface Props {
  file: FileInput;
  index: number;
  updateFile: (index: number, field: keyof FileInput, value: string) => void;
  /**
   * Soft-wrap long lines instead of scrolling horizontally. Mirrors the raw
   * code view's wrap toggle in `StashViewer`; applied via a class because
   * react-simple-code-editor sets `white-space` through inline styles that
   * only a class-scoped `!important` rule can override.
   */
  wrap?: boolean;
}

/**
 * Above this many characters, react-simple-code-editor's per-keystroke
 * full-file re-highlight becomes noticeably laggy (the server accepts files
 * up to 10 MB). Large files fall back to a plain textarea so typing stays
 * responsive — syntax highlighting is traded away for editability.
 */
const SYNTAX_HIGHLIGHT_MAX_CHARS = 100_000;

export default function FileCodeEditor({ file, index, updateFile, wrap = false }: Props) {
  // Latched, never un-latched for the lifetime of this file. Swapping
  // <Editor> <-> <textarea> unmounts the live text field, so every swap
  // costs the caret position, scroll offset, focus and the browser's native
  // undo history. Deriving the mode from the current length alone made that
  // happen on EVERY keystroke that crossed the threshold: type one char past
  // 100k, delete it, type it again. Once plain mode is warranted it stays —
  // the only remaining swap is the first up-crossing, which is the price of
  // keeping large files editable. The file list is keyed by a stable file id
  // (StashEditor `fileIds`), so this state cannot leak into another file.
  const [plainMode, setPlainMode] = useState(
    () => file.content.length > SYNTAX_HIGHLIGHT_MAX_CHARS,
  );
  if (!plainMode && file.content.length > SYNTAX_HIGHLIGHT_MAX_CHARS) {
    setPlainMode(true);
  }

  const highlight = useMemo(
    () => (code: string) => highlightCode(code, resolvePrismLanguage(file.language, file.filename)),
    [file.language, file.filename],
  );
  const handleChange = useCallback(
    (code: string) => updateFile(index, 'content', code),
    [index, updateFile],
  );
  // react-simple-code-editor forwards extra props to its outer div, NOT the
  // textarea — an aria-label prop would never reach it. textareaId + a
  // visually hidden label give the textarea an accessible name instead.
  const textareaId = `stash-file-content-${index}`;

  // Large files skip highlighting entirely — re-highlighting the whole string
  // on every keystroke lags on multi-MB files. A plain textarea keeps editing
  // responsive; the styling classes keep it visually consistent.
  if (plainMode) {
    return (
      <textarea
        value={file.content}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="File content..."
        className={`code-editor code-editor-textarea code-editor-plain${
          wrap ? ' code-editor-wrap' : ''
        }`}
        spellCheck={false}
        aria-label="File content (plain editor — syntax highlighting disabled for large file)"
      />
    );
  }

  return (
    <>
      <label htmlFor={textareaId} className="sr-only">
        File {index + 1} content
      </label>
      <Editor
        value={file.content}
        onValueChange={handleChange}
        highlight={highlight}
        padding={16}
        placeholder="File content..."
        className={`code-editor${wrap ? ' code-editor-wrap' : ''}`}
        textareaClassName="code-editor-textarea"
        textareaId={textareaId}
      />
    </>
  );
}
