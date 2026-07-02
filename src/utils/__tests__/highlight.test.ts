import { describe, it, expect } from 'vitest';
import { splitHighlight } from '../highlight';

describe('splitHighlight', () => {
  it('returns a single unmatched segment when the query is empty', () => {
    expect(splitHighlight('hello world', '')).toEqual([{ text: 'hello world', match: false }]);
    expect(splitHighlight('hello world', '   ')).toEqual([{ text: 'hello world', match: false }]);
  });

  it('returns an empty array for empty text', () => {
    expect(splitHighlight('', 'foo')).toEqual([]);
  });

  it('marks a single case-insensitive match and preserves source casing', () => {
    expect(splitHighlight('Deploy Notes', 'deploy')).toEqual([
      { text: 'Deploy', match: true },
      { text: ' Notes', match: false },
    ]);
  });

  it('marks every occurrence', () => {
    expect(splitHighlight('aXaXa', 'a')).toEqual([
      { text: 'a', match: true },
      { text: 'X', match: false },
      { text: 'a', match: true },
      { text: 'X', match: false },
      { text: 'a', match: true },
    ]);
  });

  it('handles a match at the end of the text', () => {
    expect(splitHighlight('config.json', 'json')).toEqual([
      { text: 'config.', match: false },
      { text: 'json', match: true },
    ]);
  });

  it('returns one unmatched segment when there is no match', () => {
    expect(splitHighlight('nothing here', 'zzz')).toEqual([{ text: 'nothing here', match: false }]);
  });

  it('reassembles to the original text', () => {
    const text = 'The quick brown fox';
    const joined = splitHighlight(text, 'o')
      .map((s) => s.text)
      .join('');
    expect(joined).toBe(text);
  });
});
