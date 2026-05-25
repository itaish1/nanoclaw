import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { AgentInfo } from '../types';

const AVATAR_COLORS = [
  '#7C3AED', '#2563EB', '#059669', '#D97706',
  '#DC2626', '#0891B2', '#7C3AED', '#BE185D',
];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function modelLabel(model: string | null, provider: string): string {
  if (model) return model;
  return provider === 'opencode' ? 'opencode' : 'claude (default)';
}

export type AgentNodeData = AgentInfo & { onSelect?: (id: string) => void; [key: string]: unknown };

export function AgentNode({ data }: NodeProps) {
  const agent = data as AgentNodeData;
  const isRunning = agent.container?.status === 'running';
  const color = avatarColor(agent.name);
  const ramPct =
    agent.container?.ramUsedMb && agent.container?.ramTotalMb
      ? Math.round((agent.container.ramUsedMb / agent.container.ramTotalMb) * 100)
      : null;

  return (
    <div style={{ ...styles.card, cursor: 'pointer' }} onClick={() => agent.onSelect?.(agent.id)}>
      <Handle type="target" position={Position.Left} style={styles.handle} />

      <div style={styles.header}>
        <div style={{ ...styles.avatar, background: color }}>
          {agent.name.charAt(0).toUpperCase()}
        </div>
        <div style={styles.headerText}>
          <div style={styles.name}>{agent.name}</div>
          {agent.assistantName && (
            <div style={styles.assistantName}>{agent.assistantName}</div>
          )}
        </div>
        <div style={{ ...styles.statusDot, background: isRunning ? '#22C55E' : '#6B7280' }} />
      </div>

      <div style={styles.row}>
        <span style={styles.label}>Model</span>
        <span style={styles.value}>{modelLabel(agent.model, agent.provider)}</span>
      </div>

      <div style={styles.row}>
        <span style={styles.label}>Status</span>
        <span style={{ ...styles.value, color: isRunning ? '#22C55E' : '#9CA3AF' }}>
          {isRunning
            ? agent.container?.uptimeSeconds
              ? `Up ${formatUptime(agent.container.uptimeSeconds)}`
              : 'Running'
            : 'Stopped'}
        </span>
      </div>

      {agent.container?.ramUsedMb != null && (
        <div style={styles.statBlock}>
          <div style={styles.statRow}>
            <span style={styles.label}>RAM</span>
            <span style={styles.value}>
              {Math.round(agent.container.ramUsedMb)}M
              {agent.container.ramTotalMb
                ? ` / ${agent.container.ramTotalMb >= 1024
                    ? `${(agent.container.ramTotalMb / 1024).toFixed(1)}G`
                    : `${Math.round(agent.container.ramTotalMb)}M`}`
                : ''}
            </span>
            {agent.container?.cpuPercent != null && (
              <span style={{ ...styles.label, marginLeft: 'auto' }}>
                CPU {agent.container.cpuPercent.toFixed(1)}%
              </span>
            )}
          </div>
          {ramPct !== null && (
            <div style={styles.barTrack}>
              <div style={{ ...styles.barFill, width: `${Math.min(ramPct, 100)}%` }} />
            </div>
          )}
        </div>
      )}

      {agent.sessionCount > 0 && (
        <div style={styles.badge}>
          {agent.sessionCount} session{agent.sessionCount !== 1 ? 's' : ''}
        </div>
      )}

      <Handle type="source" position={Position.Right} style={styles.handle} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#1E1E30',
    border: '1px solid #2D2D45',
    borderRadius: 12,
    padding: '14px 16px',
    width: 260,
    color: '#E2E8F0',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 13,
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
  },
  handle: { background: '#4B5563', width: 10, height: 10, border: 'none' },
  header: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 },
  avatar: {
    width: 36, height: 36, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: 16, color: '#fff', flexShrink: 0,
  },
  headerText: { flex: 1, minWidth: 0 },
  name: { fontWeight: 600, fontSize: 14, color: '#F1F5F9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  assistantName: { fontSize: 11, color: '#94A3B8', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  statusDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  row: { display: 'flex', justifyContent: 'space-between', marginBottom: 6 },
  label: { color: '#64748B', fontSize: 11 },
  value: { color: '#CBD5E1', fontSize: 11, fontFamily: 'monospace' },
  statBlock: { marginTop: 8 },
  statRow: { display: 'flex', alignItems: 'center', marginBottom: 4 },
  barTrack: { height: 4, background: '#374151', borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', background: '#22C55E', borderRadius: 2, transition: 'width 0.3s' },
  badge: {
    marginTop: 10, display: 'inline-block',
    background: '#1D4ED8', color: '#BFDBFE',
    fontSize: 10, padding: '2px 8px', borderRadius: 99,
  },
};
