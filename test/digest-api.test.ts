import { expect, it } from 'vitest';
import { createApp } from '../src/app.js';

it('returns the shared digest in the same sorted job order as the page', async () => {
  const config = {
    adapter: 'shim' as const,
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: 'runs',
  };
  const app = createApp(config);
  const [apiResponse, pageResponse] = await Promise.all([
    app.request('/api/digest/2026-10-28'),
    app.request('/digest/2026-10-28'),
  ]);
  const digest = await apiResponse.json();
  const html = await pageResponse.text();
  const jobs = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs'];

  expect(apiResponse.status).toBe(200);
  expect(digest).toMatchObject({ night: '2026-10-28', badLines: 1 });
  expect(digest.rows.map((row: { job: string }) => row.job)).toEqual(jobs);
  expect(pageResponse.status).toBe(200);
  const positions = jobs.map((job) => html.indexOf(job));
  expect(positions.every((position, index) => index === 0 || positions[index - 1] < position)).toBe(true);
});
