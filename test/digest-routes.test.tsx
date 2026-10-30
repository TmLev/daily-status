import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const directories: string[] = [];
const night = '2026-10-30';

function appWithRuns(contents?: string) {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  directories.push(runsDir);
  if (contents !== undefined) writeFileSync(join(runsDir, `${night}.jsonl`), contents);
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

it('serves valid rows through HTML and JSON with matching sorted jobs and original offsets', async () => {
  const app = appWithRuns([
    JSON.stringify({ at: '2026-10-30T06:30:00+02:00', job: 'zeta', status: 'ok', owner: 'Zed' }),
    JSON.stringify({ at: '2026-10-30T06:31:00-04:00', job: 'alpha', status: 'retry', owner: null }),
  ].join('\n'));

  const [apiResponse, pageResponse] = await Promise.all([
    app.request(`/api/digest/${night}`),
    app.request(`/digest/${night}`),
  ]);
  const digest = await apiResponse.json();
  const html = await pageResponse.text();

  expect(apiResponse.status).toBe(200);
  expect(pageResponse.status).toBe(200);
  expect(digest.rows.map((row: { job: string }) => row.job)).toEqual(['alpha', 'zeta']);
  expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));
  expect(digest.rows[0]).toMatchObject({ owner: null, firstAt: '2026-10-30T06:31:00-04:00' });
  expect(html).toContain('—');
  expect(html).toContain('2026-10-30T06:30:00+02:00');
  expect(html).toContain('2026-10-30T06:31:00-04:00');
});

it('returns 404 for a night with no file on both routes', async () => {
  const app = appWithRuns();
  const [page, api] = await Promise.all([
    app.request(`/digest/${night}`),
    app.request(`/api/digest/${night}`),
  ]);
  expect(page.status).toBe(404);
  expect(api.status).toBe(404);
});

it('renders an empty file as nothing ran and returns rows: []', async () => {
  const app = appWithRuns('');
  const [page, api] = await Promise.all([
    app.request(`/digest/${night}`),
    app.request(`/api/digest/${night}`),
  ]);
  expect(page.status).toBe(200);
  expect(await page.text()).toContain('nothing ran');
  expect(api.status).toBe(200);
  expect(await api.json()).toMatchObject({ night, rows: [], badLines: 0 });
});

it('counts malformed entries while retaining valid jobs and warns on retries and failures', async () => {
  const records = [
    JSON.stringify({ at: '2026-10-30T01:00:00+01:00', job: 'worker', status: 'retry', owner: null }),
    '{bad json',
    JSON.stringify({ at: '2026-10-30T01:01:00+01:00', job: '', status: 'ok', owner: 'Ops' }),
    ...[2, 3, 4].map((minute) => JSON.stringify({
      at: `2026-10-30T01:0${minute}:00+01:00`, job: 'worker', status: 'retry', owner: null,
    })),
    JSON.stringify({
      at: '2026-10-30T02:00:00+01:00', job: 'worker', status: 'ok', owner: null, error: 'still reported',
    }),
    JSON.stringify({ at: '2026-10-30T03:00:00+01:00', job: 'failed', status: 'fail', owner: 'Ops' }),
  ].join('\n');
  const app = appWithRuns(records);

  const [page, api] = await Promise.all([
    app.request(`/digest/${night}`),
    app.request(`/api/digest/${night}`),
  ]);
  const html = await page.text();
  const digest = await api.json();
  expect(page.status).toBe(200);
  expect(api.status).toBe(200);
  expect(digest.badLines).toBe(2);
  expect(digest.rows.map((row: { job: string }) => row.job)).toEqual(['failed', 'worker']);
  expect(digest.rows[1]).toMatchObject({ runs: 5, retries: 4, lastStatus: 'ok', lastError: 'still reported' });
  expect(html).toContain('2 bad lines');
  expect(html).toContain('class="warn">4</td>');
  expect(html).toContain('class="warn">fail</td>');
  expect(html).toContain('<td>—</td>');
});
