import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function restartAgentContainer(folder: string): Promise<{ stopped: string[] }> {
  const stopped: string[] = [];
  try {
    // Find all running containers for this agent group
    const { stdout } = await execFileAsync('docker', [
      'ps',
      '--format', '{{.Names}}',
      '--filter', `name=nanoclaw-v2-${folder}-`,
    ]);
    const names = stdout.trim().split('\n').filter(Boolean);
    for (const name of names) {
      await execFileAsync('docker', ['stop', '--time', '10', name]);
      stopped.push(name);
    }
  } catch (err) {
    // Docker not available or no containers — not an error
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes('No such container') && !message.includes('not found')) {
      throw err;
    }
  }
  return { stopped };
}
