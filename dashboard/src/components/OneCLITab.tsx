import { useState, useEffect } from 'react';
import type { AgentInfo } from '../types';

interface OneCLIAgent {
  id: string;
  name: string;
  identifier: string | null;
  isDefault: boolean;
  secretMode: 'all' | 'selective' | 'none';
  createdAt: string;
  secretIds: string[];
  _count: { agentSecrets: number; agentAppConnections: number };
}

interface OneCLISecret {
  id: string;
  name: string;
  type: string;
  hostPattern: string | null;
  typeLabel: string;
  scope: string;
}

const MODE_COLOR: Record<string, string> = {
  all: '#22C55E',
  selective: '#F59E0B',
  none: '#6B7280',
};

async function fetchOneCLI() {
  const [agentsRes, secretsRes] = await Promise.all([
    fetch('/api/onecli/agents'),
    fetch('/api/onecli/secrets'),
  ]);
  if (!agentsRes.ok) throw new Error((await agentsRes.json() as { error: string }).error ?? 'Failed');
  return {
    agents: (await agentsRes.json()) as OneCLIAgent[],
    secrets: secretsRes.ok ? (await secretsRes.json() as OneCLISecret[]) : [],
  };
}

export function OneCLITab({ nanoclaWAgents }: { nanoclaWAgents: AgentInfo[] }) {
  const [agents, setAgents] = useState<OneCLIAgent[] | null>(null);
  const [secrets, setSecrets] = useState<OneCLISecret[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOneCLI()
      .then(({ agents, secrets }) => { setAgents(agents); setSecrets(secrets); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const secretById = new Map(secrets.map((s) => [s.id, s]));
  const nanoclawById = new Map(nanoclaWAgents.map((a) => [a.id, a]));

  if (loading) return <div style={s.center}><div className="spinner" /></div>;
  if (error) return (
    <div style={s.center}>
      <p style={{ color: '#F87171', marginBottom: 12 }}>⚠ {error}</p>
      <p style={{ color: '#64748B', fontSize: 13 }}>
        Make sure OneCLI is running at{' '}
        <a href="http://127.0.0.1:10254" target="_blank" rel="noreferrer" style={{ color: '#60A5FA' }}>
          127.0.0.1:10254
        </a>
      </p>
    </div>
  );

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h2 style={s.title}>OneCLI Agent Vault</h2>
          <p style={s.sub}>{agents?.length ?? 0} agents · {secrets.length} secrets</p>
        </div>
        <a href="http://127.0.0.1:10254" target="_blank" rel="noreferrer" style={s.openBtn}>
          Open Web UI ↗
        </a>
      </div>

      {/* Secrets overview */}
      {secrets.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Secrets</div>
          <div style={s.grid}>
            {secrets.map((sec) => (
              <div key={sec.id} style={s.secretCard}>
                <div style={s.secretName}>{sec.name}</div>
                <div style={s.secretMeta}>{sec.typeLabel}</div>
                {sec.hostPattern && <div style={s.secretHost}>{sec.hostPattern}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agents */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Agents</div>
        {agents?.map((agent) => {
          const linked = agent.identifier ? nanoclawById.get(agent.identifier) : null;
          const agentSecrets = agent.secretIds.map((id) => secretById.get(id)).filter(Boolean) as OneCLISecret[];

          return (
            <div key={agent.id} style={s.agentCard}>
              <div style={s.agentHeader}>
                <div style={s.agentLeft}>
                  <div style={s.agentName}>
                    {agent.name}
                    {agent.isDefault && <span style={s.defaultBadge}>default</span>}
                  </div>
                  {agent.identifier && (
                    <div style={s.agentId}>{agent.identifier}</div>
                  )}
                  {linked && (
                    <div style={s.linkedBadge}>↔ {linked.name}</div>
                  )}
                </div>
                <div style={s.agentRight}>
                  <div style={{ ...s.modeBadge, color: MODE_COLOR[agent.secretMode] ?? '#94A3B8', borderColor: MODE_COLOR[agent.secretMode] ?? '#374151' }}>
                    {agent.secretMode}
                  </div>
                </div>
              </div>

              {agent.secretMode === 'selective' && (
                <div style={s.secretsRow}>
                  {agentSecrets.length > 0 ? (
                    agentSecrets.map((sec) => (
                      <span key={sec.id} style={s.secretPill}>{sec.name}</span>
                    ))
                  ) : (
                    <span style={{ ...s.secretPill, color: '#F87171', borderColor: '#7F1D1D', background: '#1C0A0A' }}>
                      ⚠ no secrets assigned
                    </span>
                  )}
                </div>
              )}
              {agent.secretMode === 'all' && (
                <div style={s.secretsRow}>
                  <span style={s.secretPill}>all vault secrets injected</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '28px 32px', maxWidth: 900, margin: '0 auto', overflowY: 'auto', height: '100%' },
  center: { height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title: { fontSize: 22, fontWeight: 700, color: '#F1F5F9', margin: 0 },
  sub: { fontSize: 13, color: '#64748B', marginTop: 4 },
  openBtn: {
    padding: '7px 14px', background: '#1E293B', border: '1px solid #334155',
    borderRadius: 8, color: '#94A3B8', fontSize: 13, textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 },
  secretCard: {
    background: '#161625', border: '1px solid #1E293B',
    borderRadius: 8, padding: '10px 12px',
  },
  secretName: { fontSize: 13, fontWeight: 600, color: '#E2E8F0', marginBottom: 3 },
  secretMeta: { fontSize: 11, color: '#64748B' },
  secretHost: { fontSize: 10, color: '#475569', fontFamily: 'monospace', marginTop: 4 },
  agentCard: {
    background: '#111121', border: '1px solid #1E293B',
    borderRadius: 10, padding: '14px 16px', marginBottom: 10,
  },
  agentHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  agentLeft: { flex: 1 },
  agentRight: {},
  agentName: { fontSize: 15, fontWeight: 600, color: '#F1F5F9', display: 'flex', alignItems: 'center', gap: 8 },
  agentId: { fontSize: 11, color: '#475569', fontFamily: 'monospace', marginTop: 4 },
  defaultBadge: { fontSize: 10, color: '#94A3B8', background: '#1E293B', padding: '1px 6px', borderRadius: 4 },
  linkedBadge: { fontSize: 11, color: '#60A5FA', marginTop: 4 },
  modeBadge: {
    fontSize: 11, fontWeight: 600, border: '1px solid',
    padding: '3px 10px', borderRadius: 99,
  },
  secretsRow: { marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 },
  secretPill: {
    fontSize: 11, color: '#94A3B8', background: '#1E293B',
    border: '1px solid #334155', padding: '2px 8px', borderRadius: 99,
  },
};
