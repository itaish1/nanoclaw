import type { TopologyData, AgentDetail } from './types';

export async function fetchTopology(): Promise<TopologyData> {
  const res = await fetch('/api/topology');
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
  }
  return res.json();
}

export async function fetchAgentDetail(id: string): Promise<AgentDetail> {
  const res = await fetch(`/api/agents/${id}`);
  if (!res.ok) throw new Error('Failed to load agent detail');
  return res.json();
}

export async function saveAgentConfig(id: string, updates: {
  model?: string | null;
  effort?: string | null;
  assistantName?: string | null;
  maxMessagesPerPrompt?: number | null;
}): Promise<void> {
  const res = await fetch(`/api/agents/${id}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
  }
}

export async function fetchStats(): Promise<import('./types').StatsResponse> {
  const res = await fetch('/api/stats');
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function restartAgent(id: string): Promise<{ stopped: string[] }> {
  const res = await fetch(`/api/agents/${id}/restart`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
  }
  return res.json();
}
