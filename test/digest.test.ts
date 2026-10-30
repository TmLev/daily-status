import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
const entry = { at: '2026-10-28T23:00:02+01:00', job: 'job', status: 'ok', owner: null };
const directories: string[] = [];
function fixture(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  directories.push(dir);
  writeFileSync(join(dir, `${night}.jsonl`), contents);
  return dir;
}
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readNight', () => {
  it('reads the real fixture as five sorted jobs and one bad line', () => {
    const digest = readNight('runs', night);
    expect(digest?.badLines).toBe(1);
    expect(digest?.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.rows[1]).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3,
      lastStatus: 'ok', lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(digest?.rows[0].owner).toBeNull();
    expect(digest?.rows[2]).toMatchObject({ runs: 8, retries: 1, lastError: 'lock held' });
    expect(digest?.rows[3]).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('distinguishes missing and empty nights and rejects path traversal', () => {
    const dir = fixture('');
    expect(readNight(dir, night)).toEqual({ night, rows: [], badLines: 0 });
    expect(readNight(dir, '2026-10-27')).toBeNull();
    expect(readNight(dir, '../2026-10-28')).toBeNull();
  });

  it('counts invalid JSON, shapes and fields while retaining valid records', () => {
    const invalid: unknown[] = [null, [], 5, {}, { ...entry, owner: undefined },
      { ...entry, status: 'unknown' }, { ...entry, error: 4 }, { ...entry, job: '' },
      { ...entry, at: 'not a time' }, { ...entry, at: '2026-10-28T23:00:02' }];
    const dir = fixture(['{broken', '', ...invalid.map((value) => JSON.stringify(value)),
      JSON.stringify(entry), ''].join('\r\n'));
    expect(readNight(dir, night)).toMatchObject({ badLines: 12, rows: [{ runs: 1, lastError: null }] });
  });

  it('uses record order and original offsets, updating owner and retaining the latest error', () => {
    const records = [
      { ...entry, status: 'retry', error: 'first', owner: 'rook' },
      { ...entry, status: 'fail', error: 'latest', at: '2026-10-28T22:00:02-04:00' },
      { ...entry, at: '2026-10-28T21:00:02Z' },
    ];
    const dir = fixture(records.map((value) => JSON.stringify(value)).join('\n'));
    expect(readNight(dir, night)?.rows).toEqual([{
      job: 'job', owner: null, runs: 3, retries: 1, lastStatus: 'ok', lastError: 'latest',
      firstAt: entry.at, lastAt: records[2].at,
    }]);
  });

  it('does not hide filesystem errors as missing nights', () => {
    const dir = fixture('');
    expect(() => readNight(join(dir, `${night}.jsonl`), night)).toThrow();
  });
});
