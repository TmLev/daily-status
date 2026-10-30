export type RunStatus = 'ok' | 'retry' | 'fail';

export interface DigestRow {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
}

export interface NightDigest {
  night: string;
  rows: DigestRow[];
  badLines: number;
}

/** Synchronous reader; a missing night returns null, an empty night has no rows. */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
