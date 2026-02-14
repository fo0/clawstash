import Prism from 'prismjs';

// Import commonly used language definitions
// NOTE: Order matters! Base grammars must be imported before dependents.
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-shell-session';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-markup-templating';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-scala';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-toml';
import 'prismjs/components/prism-ini';
import 'prismjs/components/prism-diff';
import 'prismjs/components/prism-graphql';
import 'prismjs/components/prism-lua';
import 'prismjs/components/prism-perl';
import 'prismjs/components/prism-r';
import 'prismjs/components/prism-makefile';
import 'prismjs/components/prism-powershell';
import 'prismjs/components/prism-xml-doc';

/**
 * Map file extension to PrismJS language key.
 */
const extensionToLanguage: Record<string, string> = {
  // JavaScript / TypeScript
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',

  // Python
  py: 'python',
  pyw: 'python',

  // Shell
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  ps1: 'powershell',
  psm1: 'powershell',

  // Web
  html: 'markup',
  htm: 'markup',
  xml: 'markup',
  svg: 'markup',
  css: 'css',
  scss: 'css',
  less: 'css',

  // Data formats
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  cfg: 'ini',

  // Markdown
  md: 'markdown',
  mdx: 'markdown',

  // SQL
  sql: 'sql',

  // Systems languages
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  swift: 'swift',

  // JVM
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',

  // Scripting
  rb: 'ruby',
  php: 'php',
  lua: 'lua',
  pl: 'perl',
  pm: 'perl',
  r: 'r',

  // Other
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'docker',
  makefile: 'makefile',
  diff: 'diff',
  patch: 'diff',
  env: 'bash',
};

/**
 * Map a stored language name (from ClawStash DB) to PrismJS grammar key.
 */
const languageNameToPrism: Record<string, string> = {
  javascript: 'javascript',
  typescript: 'typescript',
  jsx: 'jsx',
  tsx: 'tsx',
  python: 'python',
  bash: 'bash',
  shell: 'bash',
  powershell: 'powershell',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  markup: 'markup',
  css: 'css',
  json: 'json',
  yaml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  markdown: 'markdown',
  sql: 'sql',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  csharp: 'csharp',
  'c#': 'csharp',
  go: 'go',
  golang: 'go',
  rust: 'rust',
  swift: 'swift',
  java: 'java',
  kotlin: 'kotlin',
  scala: 'scala',
  ruby: 'ruby',
  php: 'php',
  lua: 'lua',
  perl: 'perl',
  r: 'r',
  graphql: 'graphql',
  docker: 'docker',
  dockerfile: 'docker',
  makefile: 'makefile',
  diff: 'diff',
  text: 'text',
  plain: 'text',
};

/**
 * Detect PrismJS language from a filename.
 */
export function detectLanguageFromFilename(filename: string): string {
  const lower = filename.toLowerCase();

  // Special filenames
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return 'docker';
  if (lower === 'makefile' || lower === 'gnumakefile') return 'makefile';

  const ext = lower.split('.').pop() || '';
  return extensionToLanguage[ext] || 'text';
}

/**
 * Resolve a stored language string to a PrismJS grammar key.
 */
export function resolvePrismLanguage(language: string, filename?: string): string {
  if (language) {
    const mapped = languageNameToPrism[language.toLowerCase()];
    if (mapped) return mapped;
  }
  if (filename) {
    return detectLanguageFromFilename(filename);
  }
  return 'text';
}

/**
 * Highlight code using PrismJS.
 * Returns HTML string with syntax tokens.
 */
export function highlightCode(code: string, language: string): string {
  const prismLang = Prism.languages[language];
  if (!prismLang) {
    // Fallback: escape HTML entities for plain text
    return code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  return Prism.highlight(code, prismLang, language);
}

/**
 * Detect language from file content when filename-based detection yields 'text'.
 * Uses heuristic pattern matching.
 */
export function detectLanguageFromContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return 'text';

  // HTML: doctype or root html tag
  if (/^<!DOCTYPE\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return 'markup';
  }

  // XML: xml declaration or root element with xmlns
  if (/^<\?xml\s/i.test(trimmed) || /^<\w+[^>]*\sxmlns[=:]/i.test(trimmed)) {
    return 'markup';
  }

  // JSON: starts with { or [ and is valid JSON
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length < 1_000_000) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch { /* not JSON */ }
  }

  // Markdown: score common patterns
  if (isLikelyMarkdown(trimmed)) {
    return 'markdown';
  }

  // HTML fragments: multiple HTML tags present
  const tagCount = (trimmed.match(/<(?:div|p|span|h[1-6]|ul|ol|li|table|tr|td|th|a|img|section|article|nav|header|footer|form|input|button|br|hr)\b/gi) || []).length;
  if (tagCount >= 3) {
    return 'markup';
  }

  return 'text';
}

/**
 * Check if content looks like Markdown using a scoring system.
 */
function isLikelyMarkdown(content: string): boolean {
  // Limit analysis to first 200 lines for performance on large files
  const allLines = content.split('\n');
  const lines = allLines.length > 200 ? allLines.slice(0, 200) : allLines;
  const sample = lines.length < allLines.length ? lines.join('\n') : content;
  let score = 0;
  const checks = [
    // ATX headings
    () => lines.some(l => /^#{1,6}\s+\S/.test(l)),
    // Unordered list items
    () => lines.filter(l => /^\s*[-*+]\s+\S/.test(l)).length >= 2,
    // Ordered list items
    () => lines.filter(l => /^\s*\d+\.\s+\S/.test(l)).length >= 2,
    // Links [text](url)
    () => /\[.+?\]\(.+?\)/.test(sample),
    // Bold/italic
    () => /(\*\*|__).+?\1/.test(sample) || /(\*|_)(?!\1).+?\1/.test(sample),
    // Code blocks (fenced)
    () => /^```/m.test(sample),
    // Blockquotes
    () => lines.some(l => /^>\s/.test(l)),
    // Images
    () => /!\[.*?\]\(.+?\)/.test(sample),
    // Horizontal rules
    () => lines.some(l => /^(?:---+|\*\*\*+|___+)\s*$/.test(l)),
  ];

  for (const check of checks) {
    if (check()) score++;
  }

  // Need at least 2 different markdown patterns to be confident
  return score >= 2;
}

/**
 * Languages that support a rendered preview mode.
 */
const RENDERABLE_LANGUAGES = new Set(['markdown', 'markup']);

/**
 * Check if a PrismJS language key supports rendered preview.
 */
export function isRenderableLanguage(prismLanguage: string): boolean {
  return RENDERABLE_LANGUAGES.has(prismLanguage);
}

/**
 * Human-readable display names for PrismJS language keys.
 */
const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  markup: 'HTML',
  markdown: 'Markdown',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  python: 'Python',
  bash: 'Bash',
  json: 'JSON',
  yaml: 'YAML',
  css: 'CSS',
  sql: 'SQL',
  text: 'Text',
};

/**
 * Get a human-readable label for the detected/resolved language.
 */
export function getLanguageDisplayName(prismLanguage: string): string {
  return LANGUAGE_DISPLAY_NAMES[prismLanguage] || prismLanguage;
}
