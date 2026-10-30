import { expect, it } from 'vitest';
import { createApp } from '../src/app.js';

it('renders the night digest in the shared page layout', async () => {
  const response = await createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: 'runs',
  }).request('/digest/2026-10-28');
  const html = await response.text();

  expect(response.status).toBe(200);
  expect(html).toContain('<h1>digest · 2026-10-28</h1>');
  expect(html).toContain('1 bad line');
  expect(html).toContain('digest/render');
  expect(html).toContain('class="warn">3</td>');
  expect(html).toContain('class="warn">fail</td>');
});
