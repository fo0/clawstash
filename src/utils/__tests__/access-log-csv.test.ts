import { describe, expect, it } from 'vitest';
import { accessLogCsvFilename, buildAccessLogCsv, csvCell } from '../access-log-csv';
import type { AccessLogEntry } from '../../types';

function entry(overrides: Partial<AccessLogEntry> = {}): AccessLogEntry {
  return {
    id: '1',
    stash_id: 'abc',
    source: 'api',
    action: 'read',
    timestamp: '2026-10-12T08:00:00.000Z',
    ...overrides,
  };
}

describe('csvCell', () => {
  it('passes plain values through unquoted', () => {
    expect(csvCell('read')).toBe('read');
  });

  it('renders null and undefined as an empty cell', () => {
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(null)).toBe('');
  });

  it('quotes delimiters, quotes and line breaks and doubles inner quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('neutralizes values a spreadsheet would run as a formula', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\tcmd')).toBe("'\tcmd");
  });
});

describe('buildAccessLogCsv', () => {
  it('writes a header row, then one CRLF-terminated row per entry in order', () => {
    const csv = buildAccessLogCsv([
      entry({ id: '1', action: 'read', ip: '10.0.0.1', user_agent: 'curl/8.5.0' }),
      entry({ id: '2', source: 'mcp', action: 'read_file:a.md' }),
    ]);
    expect(csv).toBe(
      'timestamp,source,action,ip,user_agent\r\n' +
        '2026-10-12T08:00:00.000Z,api,read,10.0.0.1,curl/8.5.0\r\n' +
        '2026-10-12T08:00:00.000Z,mcp,read_file:a.md,,\r\n',
    );
  });

  it('yields the header row alone for an empty log', () => {
    expect(buildAccessLogCsv([])).toBe('timestamp,source,action,ip,user_agent\r\n');
  });

  it('quotes a user agent that contains commas', () => {
    const csv = buildAccessLogCsv([entry({ user_agent: 'Mozilla/5.0 (KHTML, like Gecko)' })]);
    expect(csv.split('\r\n')[1]).toBe(
      '2026-10-12T08:00:00.000Z,api,read,,"Mozilla/5.0 (KHTML, like Gecko)"',
    );
  });
});

describe('accessLogCsvFilename', () => {
  it('names the stash and the local date', () => {
    expect(accessLogCsvFilename('abc', new Date(2026, 9, 2, 23, 59))).toBe(
      'clawstash-access-log-abc-2026-10-02.csv',
    );
  });
});
