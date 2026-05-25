import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface ContainerStats {
  folder: string;
  name: string;
  status: 'running' | 'stopped';
  uptimeSeconds: number | null;
  ramUsedMb: number | null;
  ramTotalMb: number | null;
  cpuPercent: number | null;
}

interface DockerStatsLine {
  Name: string;
  CPUPerc: string;
  MemUsage: string;
}

interface DockerPsLine {
  Names: string;
  Status: string;
  RunningFor: string;
}

function parseMem(s: string): { used: number; total: number } | null {
  // "247MiB / 1.56GiB" or "59MB / 896MB"
  const match = s.match(/^([\d.]+)\s*(\w+)\s*\/\s*([\d.]+)\s*(\w+)$/);
  if (!match) return null;
  const toMb = (val: number, unit: string) => {
    const u = unit.toLowerCase();
    if (u === 'gib' || u === 'gb') return val * 1024;
    if (u === 'kib' || u === 'kb') return val / 1024;
    return val; // MiB or MB
  };
  return {
    used: toMb(parseFloat(match[1]), match[2]),
    total: toMb(parseFloat(match[3]), match[4]),
  };
}

function parseUptime(status: string): number | null {
  // "Up 26 hours", "Up 3 minutes", "Up 2 days"
  const match = status.match(/Up\s+([\d.]+)\s+(\w+)/i);
  if (!match) return null;
  const val = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('second')) return val;
  if (unit.startsWith('minute')) return val * 60;
  if (unit.startsWith('hour')) return val * 3600;
  if (unit.startsWith('day')) return val * 86400;
  if (unit.startsWith('week')) return val * 604800;
  return null;
}

function extractFolder(containerName: string): string | null {
  // nanoclaw-v2-{folder}-{timestamp}
  const match = containerName.match(/^nanoclaw-v2-(.+)-\d+$/);
  return match ? match[1] : null;
}

export async function getContainerStats(): Promise<Map<string, ContainerStats>> {
  const result = new Map<string, ContainerStats>();

  try {
    // Get all nanoclaw containers (running + stopped)
    const { stdout: psOut } = await execFileAsync('docker', [
      'ps', '-a',
      '--format', '{{json .}}',
      '--filter', 'name=nanoclaw-v2-',
    ]);

    const psRows: DockerPsLine[] = [];
    for (const line of psOut.trim().split('\n').filter(Boolean)) {
      try { psRows.push(JSON.parse(line) as DockerPsLine); } catch { /* skip */ }
    }

    // Collect names of running containers for stats lookup
    const runningNames = psRows.filter((r) => r.Status.startsWith('Up')).map((r) => r.Names);

    // docker stats requires explicit container names — no --filter support
    const statsMap = new Map<string, DockerStatsLine>();
    if (runningNames.length > 0) {
      const { stdout: statsOut } = await execFileAsync('docker', [
        'stats', '--no-stream', '--format', '{{json .}}',
        ...runningNames,
      ]);
      for (const line of statsOut.trim().split('\n').filter(Boolean)) {
        try {
          const row = JSON.parse(line) as DockerStatsLine;
          statsMap.set(row.Name, row);
        } catch { /* skip */ }
      }
    }

    for (const row of psRows) {
      const folder = extractFolder(row.Names);
      if (!folder) continue;

      const isRunning = row.Status.startsWith('Up');
      const stats = statsMap.get(row.Names);
      const mem = stats ? parseMem(stats.MemUsage) : null;
      const cpu = stats ? parseFloat(stats.CPUPerc.replace('%', '')) : null;

      // Keep highest-uptime container per folder (latest wins)
      const existing = result.get(folder);
      const uptimeSec = isRunning ? parseUptime(row.Status) : null;
      if (existing?.status === 'running' && !isRunning) continue;

      result.set(folder, {
        folder,
        name: row.Names,
        status: isRunning ? 'running' : 'stopped',
        uptimeSeconds: uptimeSec,
        ramUsedMb: mem?.used ?? null,
        ramTotalMb: mem?.total ?? null,
        cpuPercent: cpu !== null && !isNaN(cpu) ? cpu : null,
      });
    }
  } catch {
    // Docker not available or no containers — return empty map
  }

  return result;
}
