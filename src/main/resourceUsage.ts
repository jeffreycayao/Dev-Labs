/**
 * Reads the OS process table for Settings → General → Resource use. Called
 * only while that view is open (it polls), never on a timer of its own: on
 * Windows one read is a PowerShell start, which is itself not free.
 */
import { execFile } from 'node:child_process';
import { cpus } from 'node:os';
import { parsePsTable, parseWinTable, summarizeUsage, type ProcSnapshot, type ResourceUsage } from '../shared/resourceUsage';

const WIN_SCRIPT =
  'Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize,KernelModeTime,UserModeTime | ' +
  'ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.WorkingSetSize) $($_.KernelModeTime + $_.UserModeTime)" }';

function readTable(): Promise<ProcSnapshot> {
  const [cmd, args, parse] = process.platform === 'win32'
    ? ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WIN_SCRIPT], parseWinTable] as const
    : ['ps', ['-axo', 'pid=,ppid=,rss=,time='], parsePsTable] as const;
  return new Promise((resolve, reject) => {
    execFile(cmd, [...args], { encoding: 'utf8', timeout: 15_000, maxBuffer: 16 << 20, windowsHide: true }, (err, out) => {
      if (err) reject(err);
      else resolve({ atMs: Date.now(), rows: parse(out) });
    });
  });
}

let prev: ProcSnapshot | null = null;
let inflight: Promise<ResourceUsage> | null = null;

/** CPU and memory of this app's process tree and of each agent's. The CPU
 *  figure is the rate since the previous call (null on the first). */
export function sampleResourceUsage(agents: { id: string; name: string; pid: number }[]): Promise<ResourceUsage> {
  if (inflight) return inflight;
  inflight = readTable()
    .then((cur) => {
      // A stale baseline (view closed for a while) would average over minutes.
      const base = prev && cur.atMs - prev.atMs < 60_000 ? prev : null;
      prev = cur;
      return summarizeUsage(base, cur, process.pid, agents, cpus().length);
    })
    .finally(() => { inflight = null; });
  return inflight;
}
