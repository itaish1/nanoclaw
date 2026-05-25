import type { TopologyData } from './types';

export async function fetchTopology(): Promise<TopologyData> {
  const res = await fetch('/api/topology');
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
  }
  return res.json();
}
