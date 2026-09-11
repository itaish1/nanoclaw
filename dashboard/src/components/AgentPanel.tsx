import { useState, useEffect } from 'react';
import { fetchAgentDetail, saveAgentConfig, restartAgent } from '../api';
import { MODEL_PRICING, KNOWN_MODELS, EFFORT_OPTIONS, type AgentDetail } from '../types';

const AVG_TOKENS_PER_TURN = 1500; // rough: ~1000 input + ~500 output

function avatarColor(name: string): string {
  const colors = ['#7C3AED','#2563EB','#059669','#D97706','#DC2626','#0891B2','#BE185D'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function estimateCost(model: string | null, messages: number): string {
  const pricing = model ? MODEL_PRICING[model] : null;
  if (!pricing || messages === 0) return '—';
  const tokens = messages * AVG_TOKENS_PER_TURN;
  const inputCost = (tokens * 0.67 / 1_000_000) * pricing.inputPer1M;
  const outputCost = (tokens * 0.33 / 1_000_000) * pricing.outputPer1M;
  const total = inputCost + outputCost;
  return total < 0.01 ? '<$0.01' : `~$${total.toFixed(2)}`;
}

interface Props {
  agentId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function AgentPanel({ agentId, onClose, onSaved }: Props) {
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // edit state
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState('');
  const [assistantName, setAssistantName] = useState('');
  const [maxMsgs, setMaxMsgs] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchAgentDetail(agentId)
      .then((d) => {
        setDetail(d);
        setModel(d.model ?? '');
        setEffort(d.effort ?? 'auto');
        setAssistantName(d.assistantName ?? '');
        setMaxMsgs(d.maxMessagesPerPrompt?.toString() ?? '');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [agentId]);

  async function handleSave() {
    if (!detail) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveAgentConfig(detail.id, {
        model: model || null,
        effort: effort === 'auto' ? null : effort || null,
        assistantName: assistantName || null,
        maxMessagesPerPrompt: maxMsgs ? parseInt(maxMsgs) : null,
      });
      setSaveMsg('Saved. Restart the container to apply changes.');
      onSaved();
    } catch (e) {
      setSaveMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleRestart() {
    if (!detail || !confirm(`Restart container for "${detail.name}"?\n\nThe agent will be unavailable for a few seconds.`)) return;
    setRestarting(true);
    try {
      const r = await restartAgent(detail.id);
      setSaveMsg(r.stopped.length > 0 ? `Stopped: ${r.stopped.join(', ')}` : 'No running containers found (will restart on next message).');
    } catch (e) {
      setSaveMsg(`Restart error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRestarting(false);
    }
  }

  const pricing = detail?.model ? MODEL_PRICING[detail.model] : null;
  const isDirty = detail && (
    model !== (detail.model ?? '') ||
    (effort === 'auto' ? null : effort) !== detail.effort ||
    assistantName !== (detail.assistantName ?? '') ||
    maxMsgs !== (detail.maxMessagesPerPrompt?.toString() ?? '')
  );

  return (
    <div style={s.panel}>
      <button style={s.closeBtn} onClick={onClose}>×</button>

      {loading && <div style={s.center}>Loading…</div>}
      {error && <div style={{ ...s.center, color: '#F87171' }}>{error}</div>}

      {detail && (
        <div style={s.scroll}>
          {/* Header */}
          <div style={s.header}>
            <div style={{ ...s.avatar, background: avatarColor(detail.name) }}>
              {detail.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={s.agentName}>{detail.name}</div>
              <div style={s.agentMeta}>
                <span style={{ color: detail.container?.status === 'running' ? '#22C55E' : '#9CA3AF' }}>
                  ● {detail.container?.status ?? 'stopped'}
                </span>
                {' · '}
                <span style={{ color: '#64748B' }}>{detail.folder}</span>
              </div>
            </div>
          </div>

          <Divider />

          {/* Config */}
          <Section title="Configuration">
            <Field label="Model">
              <select style={s.select} value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="">— default —</option>
                {KNOWN_MODELS.map((m) => (
                  <option key={m} value={m}>{MODEL_PRICING[m]?.label ?? m}</option>
                ))}
              </select>
            </Field>

            <Field label="Effort">
              <select style={s.select} value={effort} onChange={(e) => setEffort(e.target.value)}>
                {EFFORT_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </Field>

            <Field label="Assistant name">
              <input
                style={s.input}
                value={assistantName}
                onChange={(e) => setAssistantName(e.target.value)}
                placeholder="e.g. Aria"
              />
            </Field>

            <Field label="Max messages / prompt">
              <input
                style={{ ...s.input, width: 80 }}
                type="number"
                value={maxMsgs}
                onChange={(e) => setMaxMsgs(e.target.value)}
                placeholder="default"
                min={1}
              />
            </Field>

            <Field label="CLI scope">
              <span style={s.badge}>{detail.cliScope ?? 'group'}</span>
            </Field>

            <Field label="Skills">
              <span style={s.badge}>
                {Array.isArray(detail.skills) ? detail.skills.join(', ') : detail.skills}
              </span>
            </Field>

            {Object.keys(detail.mcpServers).length > 0 && (
              <Field label="MCP servers">
                <span style={s.badge}>{Object.keys(detail.mcpServers).join(', ')}</span>
              </Field>
            )}

            {(detail.packagesNpm.length > 0 || detail.packagesApt.length > 0) && (
              <Field label="Packages">
                <span style={s.badge}>{[...detail.packagesNpm, ...detail.packagesApt].join(', ')}</span>
              </Field>
            )}

            {saveMsg && (
              <div style={{ ...s.saveMsg, color: saveMsg.startsWith('Error') ? '#F87171' : '#86EFAC' }}>
                {saveMsg}
              </div>
            )}

            <button
              style={{ ...s.btn, opacity: isDirty ? 1 : 0.4, cursor: isDirty ? 'pointer' : 'default' }}
              onClick={handleSave}
              disabled={!isDirty || saving}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </Section>

          <Divider />

          {/* Pricing */}
          <Section title="Pricing">
            {pricing ? (
              <>
                <Row label="Input" value={`$${pricing.inputPer1M} / 1M tokens`} />
                <Row label="Output" value={`$${pricing.outputPer1M} / 1M tokens`} />
                <Row label="Cached input" value={`$${pricing.ctInputPer1M} / 1M tokens`} />
                <Row label="Est. total cost" value={estimateCost(detail.model, detail.totalChatMessages)} highlight />
                <div style={s.hint}>
                  Based on {detail.totalChatMessages} turns × ~{AVG_TOKENS_PER_TURN} tokens/turn
                </div>
              </>
            ) : (
              <div style={s.hint}>Select a model to see pricing</div>
            )}
          </Section>

          <Divider />

          {/* Sessions */}
          <Section title={`Sessions (${detail.sessions.length})`}>
            {detail.sessions.length === 0 ? (
              <div style={s.hint}>No active sessions</div>
            ) : (
              detail.sessions.map((sess) => (
                <div key={sess.id} style={s.sessionRow}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ ...s.badge, fontFamily: 'monospace' }}>{sess.id.slice(-8)}</span>
                    <span style={{ color: sess.containerStatus === 'running' ? '#22C55E' : '#9CA3AF', fontSize: 11 }}>
                      ● {sess.containerStatus}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={s.hint}>{formatRelative(sess.lastActive)}</span>
                    {sess.chatMessages > 0 && (
                      <span style={s.hint}>{sess.chatMessages} msgs</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </Section>

          <Divider />

          {/* Actions */}
          <Section title="Actions">
            <button style={{ ...s.btn, ...s.btnDanger }} onClick={handleRestart} disabled={restarting}>
              {restarting ? 'Stopping…' : '↻ Restart Container'}
            </button>
            <div style={s.hint}>
              Sends SIGTERM to the running container. NanoClaw will respawn it on the next message.
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
      <span style={{ color: '#64748B', fontSize: 11, minWidth: 120, paddingTop: 4 }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
      <span style={{ color: '#64748B', fontSize: 11 }}>{label}</span>
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: highlight ? '#34D399' : '#CBD5E1' }}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ borderTop: '1px solid #1E293B', margin: '16px 0' }} />;
}

const s: Record<string, React.CSSProperties> = {
  panel: {
    width: 360, flexShrink: 0,
    background: '#0F0F1E',
    borderLeft: '1px solid #1E1E35',
    display: 'flex', flexDirection: 'column',
    position: 'relative', overflow: 'hidden',
  },
  scroll: { flex: 1, overflowY: 'auto', padding: '20px 18px', paddingTop: 48 },
  closeBtn: {
    position: 'absolute', top: 12, right: 14,
    background: 'none', border: 'none', color: '#64748B',
    fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px',
    zIndex: 1,
  },
  center: { padding: 32, textAlign: 'center', color: '#64748B' },
  header: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 4 },
  avatar: {
    width: 40, height: 40, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: 18, color: '#fff', flexShrink: 0,
  },
  agentName: { fontSize: 16, fontWeight: 700, color: '#F1F5F9' },
  agentMeta: { fontSize: 11, marginTop: 3 },
  select: {
    background: '#1E293B', border: '1px solid #334155',
    color: '#E2E8F0', borderRadius: 6, padding: '4px 8px',
    fontSize: 12, width: '100%', cursor: 'pointer',
  },
  input: {
    background: '#1E293B', border: '1px solid #334155',
    color: '#E2E8F0', borderRadius: 6, padding: '4px 8px',
    fontSize: 12, width: '100%', outline: 'none',
  },
  badge: { fontSize: 11, color: '#94A3B8', fontFamily: 'monospace' },
  btn: {
    background: '#3B82F6', color: '#fff',
    border: 'none', borderRadius: 6, padding: '7px 14px',
    fontSize: 12, cursor: 'pointer', width: '100%',
    fontWeight: 500, marginTop: 4,
  },
  btnDanger: { background: '#B45309' },
  saveMsg: { fontSize: 11, marginBottom: 8 },
  sessionRow: {
    background: '#161625', border: '1px solid #1E293B',
    borderRadius: 6, padding: '8px 10px', marginBottom: 6,
  },
  hint: { fontSize: 10, color: '#475569', marginTop: 4 },
};
