import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { MessagingGroupInfo } from '../types';

const CHANNEL_COLORS: Record<string, string> = {
  telegram: '#2AABEE',
  slack: '#4A154B',
  discord: '#5865F2',
  whatsapp: '#25D366',
  imessage: '#30D158',
  signal: '#3A76F0',
  email: '#EA4335',
  github: '#6E40C9',
  teams: '#6264A7',
  matrix: '#0DBD8B',
  cli: '#94A3B8',
};

const CHANNEL_ICONS: Record<string, string> = {
  telegram: '✈',
  slack: '#',
  discord: '🎮',
  whatsapp: '💬',
  imessage: '💬',
  signal: '🔒',
  email: '✉',
  github: '⌥',
  teams: 'T',
  matrix: 'M',
  cli: '>_',
};

export type ChannelNodeData = MessagingGroupInfo & { [key: string]: unknown };

export function ChannelNode({ data }: NodeProps) {
  const group = data as ChannelNodeData;
  const color = CHANNEL_COLORS[group.channelType] ?? '#6B7280';
  const icon = CHANNEL_ICONS[group.channelType] ?? '•';
  const label = group.name ?? group.platformId;

  return (
    <div style={styles.card}>
      <div style={{ ...styles.icon, background: color }}>
        {icon}
      </div>
      <div style={styles.text}>
        <div style={styles.type}>{group.channelType}</div>
        <div style={styles.name} title={label}>{label}</div>
        {group.isGroup && <div style={styles.groupBadge}>group</div>}
      </div>
      <Handle type="source" position={Position.Right} style={styles.handle} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#161625',
    border: '1px solid #2D2D45',
    borderRadius: 10,
    padding: '10px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: 190,
    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
  },
  handle: { background: '#4B5563', width: 10, height: 10, border: 'none' },
  icon: {
    width: 32, height: 32, borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, color: '#fff', fontWeight: 700, flexShrink: 0,
  },
  text: { flex: 1, minWidth: 0 },
  type: { fontSize: 10, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' },
  name: { fontSize: 12, color: '#E2E8F0', fontWeight: 500, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  groupBadge: {
    fontSize: 9, color: '#94A3B8', background: '#1E293B',
    display: 'inline-block', padding: '1px 5px', borderRadius: 4, marginTop: 3,
  },
};
