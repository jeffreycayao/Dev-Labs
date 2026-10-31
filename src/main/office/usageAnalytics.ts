// Office ATM: cost & usage dashboard (ported from Claw3D's gateway-fed screen).
// Reads the hive's append-only cost-ledger.jsonl, the same file costLifetime.ts
// folds, incrementally: each request reads only bytes appended since the last.
// Read-only: never writes to the ledger.
import { ipcMain } from 'electron';
import { open, stat } from 'fs/promises';
import { join } from 'path';
import { readConfig } from '../config';
import { HiveManager } from '../hive';
import {
  UsageLedgerFold,
  validateUsageRange,
  type UsageAnalyticsResult,
  type UsageLedgerRow,
} from '../../shared/office/usageAnalytics';

// Same root resolution as the main process's hive (harnessHome/hive); used
// read-only for root() and registry(), so a second instance is harmless.
const hive = new HiveManager(() => readConfig().harnessHome);

/** Read in slices so a cold fold of a large ledger yields between them. */
const SLICE_BYTES = 4 * 1024 * 1024;

let ledgerPath: string | null = null;
let offset = 0;
let tail: Buffer = Buffer.alloc(0);
let fold = new UsageLedgerFold();
let pending: Promise<void> = Promise.resolve();

function resetFold(path: string | null): void {
  ledgerPath = path;
  offset = 0;
  tail = Buffer.alloc(0);
  fold = new UsageLedgerFold();
}

function consume(chunk: Buffer): void {
  const buf = tail.length ? Buffer.concat([tail, chunk]) : chunk;
  const cut = buf.lastIndexOf(0x0a);
  if (cut === -1) { tail = buf; return; }
  tail = buf.subarray(cut + 1); // keep partial line as bytes so UTF-8 never splits
  for (const line of buf.subarray(0, cut).toString('utf8').split('\n')) {
    if (!line) continue;
    let row: UsageLedgerRow;
    try { row = JSON.parse(line); } catch { continue; }
    fold.add(row);
  }
}

async function catchUp(path: string): Promise<void> {
  if (path !== ledgerPath) resetFold(path);
  let size: number;
  try { size = (await stat(path)).size; } catch { resetFold(path); return; } // no ledger yet
  if (size < offset) resetFold(path); // truncated or replaced
  if (size === offset) return;
  const fh = await open(path, 'r');
  try {
    while (offset < size) {
      const len = Math.min(SLICE_BYTES, size - offset);
      const buf = Buffer.alloc(len);
      const { bytesRead } = await fh.read(buf, 0, len, offset);
      if (bytesRead <= 0) break;
      consume(buf.subarray(0, bytesRead));
      offset += bytesRead;
    }
  } finally {
    await fh.close();
  }
}

export function registerUsageAnalyticsIpc(): void {
  ipcMain.handle('office:usage:analytics', async (_e, range: unknown): Promise<UsageAnalyticsResult> => {
    const valid = validateUsageRange(range);
    if (!valid.ok) return valid;
    const root = hive.root();
    if (!root) return { ok: false, error: 'Pick a harness home folder first. Agent spending shows here once agents run.' };
    try {
      // One fold at a time; a second request waits for the first to catch up.
      const run = pending.then(() => catchUp(join(root, 'cost-ledger.jsonl')));
      pending = run.catch(() => undefined);
      await run;
    } catch {
      return { ok: false, error: "Couldn't read the cost ledger. Try Refresh in a moment." };
    }
    const names: Record<string, string> = {};
    for (const [id, a] of Object.entries(hive.registry().agents)) if (a?.name) names[id] = a.name;
    return { ok: true, data: fold.query(valid.range, names) };
  });
}
