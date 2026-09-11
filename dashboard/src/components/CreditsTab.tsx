import { useState } from 'react';

export function CreditsTab() {
  const [blocked, setBlocked] = useState(false);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h2 style={s.title}>Claude.ai Usage</h2>
          <p style={s.sub}>Plan limits, credits & spending</p>
        </div>
        <a
          href="https://claude.ai/settings/usage"
          target="_blank"
          rel="noreferrer"
          style={s.openBtn}
        >
          Open in browser ↗
        </a>
      </div>

      {blocked ? (
        <div style={s.fallback}>
          <div style={s.fallbackIcon}>🔒</div>
          <p style={s.fallbackTitle}>Claude.ai blocks embedding</p>
          <p style={s.fallbackSub}>
            Claude.ai uses <code style={s.code}>X-Frame-Options: SAMEORIGIN</code> which prevents
            embedding in iframes. Open the page directly to view your usage.
          </p>
          <a
            href="https://claude.ai/settings/usage"
            target="_blank"
            rel="noreferrer"
            style={s.bigBtn}
          >
            View Claude.ai Usage →
          </a>
          <div style={s.hint}>
            Tip: keep the usage page open in another tab alongside this dashboard.
          </div>
        </div>
      ) : (
        <iframe
          src="https://claude.ai/settings/usage"
          style={s.iframe}
          title="Claude.ai Usage"
          onError={() => setBlocked(true)}
          onLoad={(e) => {
            // Detect blocked iframe by checking if the content is accessible
            try {
              const doc = (e.target as HTMLIFrameElement).contentDocument;
              if (!doc || doc.body.innerHTML === '') setBlocked(true);
            } catch {
              setBlocked(true);
            }
          }}
        />
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', padding: '24px 28px 0', overflow: 'hidden' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexShrink: 0 },
  title: { fontSize: 22, fontWeight: 700, color: '#F1F5F9', margin: 0 },
  sub: { fontSize: 13, color: '#64748B', marginTop: 4 },
  openBtn: {
    padding: '7px 14px', background: '#1E293B', border: '1px solid #334155',
    borderRadius: 8, color: '#94A3B8', fontSize: 13, textDecoration: 'none',
  },
  iframe: {
    flex: 1, border: 'none', borderRadius: 12,
    background: '#fff', width: '100%',
  },
  fallback: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: 12, textAlign: 'center', padding: 40,
  },
  fallbackIcon: { fontSize: 48, marginBottom: 8 },
  fallbackTitle: { fontSize: 18, fontWeight: 600, color: '#F1F5F9', margin: 0 },
  fallbackSub: { fontSize: 13, color: '#64748B', maxWidth: 420, lineHeight: 1.6 },
  code: { background: '#1E293B', padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace', fontSize: 12 },
  bigBtn: {
    display: 'inline-block', marginTop: 8,
    padding: '10px 24px', background: '#4F46E5',
    color: '#fff', borderRadius: 8, textDecoration: 'none',
    fontSize: 14, fontWeight: 500,
  },
  hint: { fontSize: 12, color: '#475569' },
};
