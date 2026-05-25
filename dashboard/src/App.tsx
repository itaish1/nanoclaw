import { useState, useEffect, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { TopologyView } from './components/TopologyView';
import { AgentPanel } from './components/AgentPanel';
import { fetchTopology, fetchStats } from './api';
import type { TopologyData, StatsResponse } from './types';
import './App.css';

const TOPOLOGY_REFRESH_MS = 15_000;
const STATS_REFRESH_MS = 5_000;

function fmtMb(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${Math.round(mb)}M`;
}

export function App() {
  const [data, setData] = useState<TopologyData | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const loadTopology = useCallback(async () => {
    try {
      const d = await fetchTopology();
      setData(d);
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const s = await fetchStats();
      setStats(s);
      // Merge live container stats into topology agents
      setData((prev) => {
        if (!prev) return prev;
        const byFolder = new Map(s.containers.map((c) => [c.folder, c]));
        return {
          ...prev,
          agents: prev.agents.map((a) => {
            const live = byFolder.get(a.folder);
            if (!live) return a;
            return {
              ...a,
              container: live.status === 'running'
                ? { status: 'running', uptimeSeconds: live.uptimeSeconds, ramUsedMb: live.ramUsedMb, ramTotalMb: live.ramTotalMb, cpuPercent: live.cpuPercent }
                : a.container?.status === 'running' ? { ...a.container, status: 'stopped' as const } : a.container,
            };
          }),
        };
      });
    } catch {
      // stats are best-effort, don't surface errors
    }
  }, []);

  useEffect(() => {
    loadTopology();
    const t = setInterval(loadTopology, TOPOLOGY_REFRESH_MS);
    return () => clearInterval(t);
  }, [loadTopology]);

  useEffect(() => {
    loadStats();
    const t = setInterval(loadStats, STATS_REFRESH_MS);
    return () => clearInterval(t);
  }, [loadStats]);

  const runningCount = stats?.totals.running ?? data?.agents.filter((a) => a.container?.status === 'running').length ?? 0;
  const totalAgents = data?.agents.length ?? 0;
  const totalChannels = data?.messagingGroups.length ?? 0;
  const totalWirings = data?.wirings.length ?? 0;
  const totalRam = stats?.totals.ramUsedMb ?? 0;
  const totalCpu = stats?.totals.cpuPercent ?? 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <span className="logo">🦀</span>
          <span className="title">NanoClaw</span>
          <span className="subtitle">Dashboard</span>
        </div>

        <div className="stats-pills">
          <div className="pill">
            <span className="pill-dot" style={{ background: runningCount > 0 ? '#22C55E' : '#6B7280' }} />
            <span>{runningCount} running</span>
          </div>
          <div className="pill">⬡ {totalAgents} agents</div>
          <div className="pill">⇄ {totalChannels} channels</div>
          <div className="pill">↔ {totalWirings} wirings</div>
          {totalRam > 0 && (
            <div className="pill pill-resource">
              <span style={{ color: '#94A3B8' }}>RAM</span>
              <span style={{ color: '#34D399', fontFamily: 'monospace' }}>{fmtMb(totalRam)}</span>
            </div>
          )}
          {totalCpu > 0 && (
            <div className="pill pill-resource">
              <span style={{ color: '#94A3B8' }}>CPU</span>
              <span style={{ color: totalCpu > 80 ? '#F87171' : '#FBBF24', fontFamily: 'monospace' }}>
                {totalCpu.toFixed(1)}%
              </span>
            </div>
          )}
        </div>

        <div className="topbar-right">
          {lastUpdated && (
            <span className="updated">Updated {lastUpdated.toLocaleTimeString()}</span>
          )}
          <button className="refresh-btn" onClick={() => { loadTopology(); loadStats(); }} title="Refresh">↻</button>
        </div>
      </header>

      <div className="body">
        <main className="main">
          {loading && !data && (
            <div className="center-msg">
              <div className="spinner" />
              <p>Connecting to NanoClaw…</p>
            </div>
          )}
          {error && (
            <div className="center-msg error">
              <p>⚠ {error}</p>
              <button className="refresh-btn" onClick={loadTopology}>Retry</button>
            </div>
          )}
          {data && (
            data.agents.length === 0 && data.messagingGroups.length === 0 ? (
              <div className="center-msg">
                <p style={{ color: '#94A3B8' }}>No agents or channels configured yet.</p>
                <p style={{ color: '#64748B', fontSize: 13 }}>
                  Run <code>/setup</code> or <code>/init-first-agent</code> to get started.
                </p>
              </div>
            ) : (
              <ReactFlowProvider>
                <TopologyView data={data} onSelectAgent={setSelectedAgentId} />
              </ReactFlowProvider>
            )
          )}
        </main>

        {selectedAgentId && (
          <AgentPanel
            agentId={selectedAgentId}
            onClose={() => setSelectedAgentId(null)}
            onSaved={loadTopology}
          />
        )}
      </div>
    </div>
  );
}
