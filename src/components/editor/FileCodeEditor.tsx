import { useMemo, useCallback } from 'react';
import Editor from 'react-simple-code-editor';
import type { FileInput } from '../../types';
import { highlightCode, resolvePrismLanguage } from '../../languages';

interface Props {
  file: FileInput;
  index: number;
  updateFile: (index: number, field: keyof FileInput, value: string) => void;
}

/**
 * Above this many characters, react-simple-code-editor's per-keystroke
 * full-file re-highlight becomes noticeably laggy (the server accepts files
 * up to 10 MB). Large files fall back to a plain textarea so typing stays
 * responsive — syntax highlighting is traded away for editability.
 */
const SYNTAX_HIGHLIGHT_MAX_CHARS = 100_000;

export default function FileCodeEditor({ file, index, updateFile }: Props) {
  const highlight = useMemo(
    () => (code: string) => highlightCode(code, resolvePrismLanguage(file.language, file.filename)),
    [file.language, file.filename],
  );
  const handleChange = useCallback(
    (code: string) => updateFile(index, 'content', code),
    [index, updateFile],
  );

  // Large files skip highlighting entirely — re-highlighting the whole string
  // on every keystroke lags on multi-MB files. A plain textarea keeps editing
  // responsive; the styling classes keep it visually consistent.
  if (file.content.length > SYNTAX_HIGHLIGHT_MAX_CHARS) {
    return (
      <textarea
        value={file.content}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="File content..."
        className="code-editor code-editor-textarea code-editor-plain"
        spellCheck={false}
        aria-label="File content (plain editor — syntax highlighting disabled for large file)"
      />
    );
  }

  return (
    <Editor
      value={file.content}
      onValueChange={handleChange}
      highlight={highlight}
      padding={16}
      placeholder="File content..."
      className="code-editor"
      textareaClassName="code-editor-textarea"
    />
  );
}
