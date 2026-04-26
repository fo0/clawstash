/**
 * Server-side filename → language tag detection used when persisting files.
 *
 * Note: this is intentionally separate from `src/languages.ts`, which maps
 * to PrismJS grammar keys for the frontend syntax highlighter. The values
 * stored here are user-facing language labels (e.g. "javascript", not "js")
 * that the frontend later normalizes via `resolvePrismLanguage`.
 */
import path from 'path';

const EXTENSION_MAP: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.cs': 'csharp',
  '.cpp': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.hpp': 'cpp',
  '.php': 'php',
  '.swift': 'swift',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.fish': 'bash',
  '.ps1': 'powershell',
  '.sql': 'sql',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.mmd': 'mermaid',
  '.mermaid': 'mermaid',
  '.txt': 'text',
  '.toml': 'toml',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.conf': 'ini',
  '.env': 'bash',
  // Note: a bare `Dockerfile` has no extension, so basename matching is out of
  // scope here; PrismJS-side detection in src/languages.ts handles the basename.
  '.lua': 'lua',
  '.r': 'r',
  '.dart': 'dart',
  '.scala': 'scala',
  '.zig': 'zig',
  '.v': 'v',
  '.nim': 'nim',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hs': 'haskell',
  '.ml': 'ocaml',
  '.clj': 'clojure',
  '.lisp': 'lisp',
  '.vue': 'markup',
  '.svelte': 'markup',
};

export function detectLanguage(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return EXTENSION_MAP[ext] || '';
}
