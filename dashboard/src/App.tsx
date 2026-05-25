import { useState, useEffect, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { TopologyView } from './components/TopologyView';
import { AgentPanel } from './components/AgentPanel';
import { fetchTopology } from './api';
import type { TopologyData } from './types';
import './App.css';

const REFRESH_MS = 15_000;

export function App() {
  const [data, setData] = useState<TopologyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const load = useCallback(async () => {
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

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const runningCount = data?.agents.filter((a) => a.container?.status === 'running').length ?? 0;
  const totalAgents = data?.agents.length ?? 0;
  const totalChannels = data?.messagingGroups.length ?? 0;
  const totalWirings = data?.wirings.length ?? 0;

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
            <span className="pill-dot" style={{ background: '#22C55E' }} />
            <span>{runningCount} running</span>
          </div>
          <div className="pill">
            <span>⬡</span>
            <span>{totalAgents} agents</span>
          </div>
          <div className="pill">
            <span>⇄</span>
            <span>{totalChannels} channels</span>
          </div>
          <div className="pill">
            <span>↔</span>
            <span>{totalWirings} wirings</span>
          </div>
        </div>

        <div className="topbar-right">
          {lastUpdated && (
            <span className="updated">Updated {lastUpdated.toLocaleTimeString()}</span>
          )}
          <button className="refresh-btn" onClick={load} title="Refresh">↻</button>
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
              <button className="refresh-btn" onClick={load}>Retry</button>
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
            onSaved={load}
          />
        )}
      </div>
    </div>
  );
}
