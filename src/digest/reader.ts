import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

type RunEntry = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function isRunEntry(value: unknown): value is RunEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.at === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(entry.at)
    && Number.isFinite(Date.parse(entry.at))
    && typeof entry.job === 'string' && entry.job.trim().length > 0
    && (entry.status === 'ok' || entry.status === 'retry' || entry.status === 'fail')
    && (typeof entry.owner === 'string' || entry.owner === null)
    && (entry.error === undefined || typeof entry.error === 'string');
}

export const readNight: ReadNight = (runsDir, night) => {
  // Night names are file basenames, including when supplied by a route parameter.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const jobs = new Map<string, DigestRow>();
  let badLines = 0;
  const lines = contents === '' ? [] : contents.split(/\r?\n/);
  // A terminating newline ends the preceding record; it is not an extra record.
  if (lines.at(-1) === '') lines.pop();
  for (const line of lines) {
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      badLines++;
      continue;
    }
    if (!isRunEntry(entry)) {
      badLines++;
      continue;
    }
    const previous = jobs.get(entry.job);
    jobs.set(entry.job, {
      job: entry.job,
      owner: entry.owner,
      runs: (previous?.runs ?? 0) + 1,
      retries: (previous?.retries ?? 0) + Number(entry.status === 'retry'),
      lastStatus: entry.status,
      lastError: entry.error ?? previous?.lastError ?? null,
      firstAt: previous?.firstAt ?? entry.at,
      lastAt: entry.at,
    });
  }
  return {
    night,
    rows: [...jobs.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0),
    badLines,
  };
};
