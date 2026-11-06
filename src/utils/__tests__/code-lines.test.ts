import { describe, it, expect } from 'vitest';
import { splitHighlightedLines, toNumberedLinesHtml } from '../code-lines';
import { highlightCode } from '../../languages';

describe('splitHighlightedLines', () => {
  it('splits plain escaped text at newlines', () => {
    expect(splitHighlightedLines('a &lt; b\nc\n\nd')).toEqual(['a &lt; b', 'c', '', 'd']);
  });

  it('drops the empty line after a trailing newline', () => {
    expect(splitHighlightedLines('one\ntwo\n')).toEqual(['one', 'two']);
  });

  it('keeps a single empty line for an empty file', () => {
    expect(splitHighlightedLines('')).toEqual(['']);
  });

  it('closes and re-opens a token that spans lines', () => {
    const html = 'x <span class="token comment">/* a\nb */</span> y';
    expect(splitHighlightedLines(html)).toEqual([
      'x <span class="token comment">/* a</span>',
      '<span class="token comment">b */</span> y',
    ]);
  });

  it('re-opens nested tags in order and closes them innermost first', () => {
    const html = '<span class="a"><span class="b">1\n2</span>3</span>';
    expect(splitHighlightedLines(html)).toEqual([
      '<span class="a"><span class="b">1</span></span>',
      '<span class="a"><span class="b">2</span>3</span>',
    ]);
  });

  it('drops a trailing line that holds only re-opened tags', () => {
    const html = '<span class="token comment">/* a\n</span>';
    expect(splitHighlightedLines(html)).toEqual(['<span class="token comment">/* a</span>']);
  });

  it('keeps every line balanced for real Prism output', () => {
    const code = 'const s = `one\ntwo\nthree`;\n/* block\ncomment */\nlet x = 1;\n';
    const lines = splitHighlightedLines(highlightCode(code, 'javascript'));
    expect(lines).toHaveLength(6);
    for (const line of lines) {
      const opens = (line.match(/<span\b/g) ?? []).length;
      const closes = (line.match(/<\/span>/g) ?? []).length;
      expect(opens).toBe(closes);
    }
    // The text survives unchanged once the tags are gone.
    const text = lines.map((l) => l.replace(/<[^>]*>/g, '')).join('\n');
    expect(text).toBe(code.replace(/\n$/, ''));
  });
});

describe('toNumberedLinesHtml', () => {
  it('wraps each line and reports the line count', () => {
    expect(toNumberedLinesHtml('a\nb\n')).toEqual({
      html: '<span class="code-line">a</span><span class="code-line">b</span>',
      lineCount: 2,
    });
  });
});
