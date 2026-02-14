import { useMemo, useCallback } from 'react';
import Editor from 'react-simple-code-editor';
import type { FileInput } from '../../types';
import { highlightCode, resolvePrismLanguage } from '../../languages';

interface Props {
  file: FileInput;
  index: number;
  updateFile: (index: number, field: keyof FileInput, value: string) => void;
}

export default function FileCodeEditor({ file, index, updateFile }: Props) {
  const highlight = useMemo(
    () => (code: string) => highlightCode(code, resolvePrismLanguage(file.language, file.filename)),
    [file.language, file.filename]
  );
  const handleChange = useCallback(
    (code: string) => updateFile(index, 'content', code),
    [index, updateFile]
  );
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
