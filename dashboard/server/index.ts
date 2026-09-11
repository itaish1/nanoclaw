import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getAgents, getAgentById, getMessagingGroups, getWirings,
  getAllSessions, getSessionStats, updateAgentConfig, dbAvailable,
  type AgentConfigUpdate,
} from './db.js';
import { getContainerStats } from './docker.js';
import { restartAgentContainer } from './actions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4242;
const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json());

function requireDb(res: express.Response): boolean {
  if (!dbAvailable()) {
    res.status(503).json({ error: 'Database not found. Is NanoClaw installed?' });
    return false;
  }
  return true;
}

app.get('/api/topology', async (_req, res) => {
  if (!requireDb(res)) return;
  const [agents, messagingGroups, wirings, sessions, containerStats] = await Promise.all([
    Promise.resolve(getAgents()),
    Promise.resolve(getMessagingGroups()),
    Promise.resolve(getWirings()),
    Promise.resolve(getAllSessions()),
    getContainerStats(),
  ]);

  const sessionsByAgent = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const list = sessionsByAgent.get(s.agent_group_id) ?? [];
    list.push(s);
    sessionsByAgent.set(s.agent_group_id, list);
  }

  res.json({
    agents: agents.map((a) => {
      const docker = containerStats.get(a.folder) ?? null;
      const agentSessions = sessionsByAgent.get(a.id) ?? [];
      const hasRunningSession = agentSessions.some((s) => s.container_status === 'running');
      return {
        id: a.id,
        name: a.name,
        folder: a.folder,
        model: a.model,
        effort: a.effort,
        assistantName: a.assistant_name,
        provider: a.provider ?? 'claude',
        cliScope: a.cli_scope,
        sessionCount: agentSessions.length,
        container: docker
          ? { status: docker.status, uptimeSeconds: docker.uptimeSeconds, ramUsedMb: docker.ramUsedMb, ramTotalMb: docker.ramTotalMb, cpuPercent: docker.cpuPercent }
          : hasRunningSession
            ? { status: 'running' as const, uptimeSeconds: null, ramUsedMb: null, ramTotalMb: null, cpuPercent: null }
            : null,
      };
    }),
    messagingGroups: messagingGroups.map((g) => ({
      id: g.id, channelType: g.channel_type, platformId: g.platform_id,
      name: g.name, isGroup: g.is_group === 1,
    })),
    wirings: wirings.map((w) => ({
      agentGroupId: w.agent_group_id, messagingGroupId: w.messaging_group_id,
      sessionMode: w.session_mode, engageMode: w.engage_mode, priority: w.priority,
    })),
  });
});

app.get('/api/stats', async (_req, res) => {
  const containerStats = await getContainerStats();
  const containers = [...containerStats.values()];
  const running = containers.filter((c) => c.status === 'running');
  res.json({
    containers: containers.map((c) => ({
      folder: c.folder,
      status: c.status,
      ramUsedMb: c.ramUsedMb,
      ramTotalMb: c.ramTotalMb,
      cpuPercent: c.cpuPercent,
      uptimeSeconds: c.uptimeSeconds,
    })),
    totals: {
      running: running.length,
      ramUsedMb: running.reduce((s, c) => s + (c.ramUsedMb ?? 0), 0),
      cpuPercent: running.reduce((s, c) => s + (c.cpuPercent ?? 0), 0),
    },
  });
});

app.get('/api/agents/:id', async (req, res) => {
  if (!requireDb(res)) return;
  const agent = getAgentById(req.params.id);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

  const [sessionStats, containerStats] = await Promise.all([
    Promise.resolve(getSessionStats(agent.id)),
    getContainerStats(),
  ]);

  const docker = containerStats.get(agent.folder) ?? null;
  const totalChatMessages = sessionStats.reduce((acc, s) => acc + s.chatMessages, 0);

  res.json({
    id: agent.id,
    name: agent.name,
    folder: agent.folder,
    model: agent.model,
    effort: agent.effort,
    assistantName: agent.assistant_name,
    maxMessagesPerPrompt: agent.max_messages_per_prompt,
    provider: agent.provider ?? 'claude',
    cliScope: agent.cli_scope,
    skills: parseJson(agent.skills, 'all'),
    mcpServers: parseJson(agent.mcp_servers, {}),
    packagesApt: parseJson(agent.packages_apt, []),
    packagesNpm: parseJson(agent.packages_npm, []),
    container: docker
      ? { status: docker.status, uptimeSeconds: docker.uptimeSeconds, ramUsedMb: docker.ramUsedMb, ramTotalMb: docker.ramTotalMb, cpuPercent: docker.cpuPercent }
      : null,
    sessions: sessionStats.map((s) => ({
      id: s.session.id,
      messagingGroupId: s.session.messaging_group_id,
      containerStatus: s.session.container_status,
      lastActive: s.session.last_active,
      createdAt: s.session.created_at,
      chatMessages: s.chatMessages,
      systemMessages: s.systemMessages,
    })),
    totalChatMessages,
  });
});

app.post('/api/agents/:id/config', async (req, res) => {
  if (!requireDb(res)) return;
  const agent = getAgentById(req.params.id);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

  const updates: AgentConfigUpdate = {};
  const body = req.body as Record<string, unknown>;
  if ('model' in body) updates.model = (body.model as string | null) || null;
  if ('effort' in body) updates.effort = (body.effort as string | null) || null;
  if ('assistantName' in body) updates.assistant_name = (body.assistantName as string | null) || null;
  if ('maxMessagesPerPrompt' in body) {
    const v = parseInt(body.maxMessagesPerPrompt as string);
    updates.max_messages_per_prompt = isNaN(v) ? null : v;
  }

  try {
    updateAgentConfig(agent.id, updates);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'DB write failed' });
  }
});

app.post('/api/agents/:id/restart', async (req, res) => {
  if (!requireDb(res)) return;
  const agent = getAgentById(req.params.id);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

  try {
    const result = await restartAgentContainer(agent.folder);
    res.json({ ok: true, stopped: result.stopped });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Restart failed' });
  }
});

// OneCLI proxy — strips accessToken before forwarding to client
const ONECLI_BASE = 'http://127.0.0.1:10254';

app.get('/api/onecli/agents', async (_req, res) => {
  try {
    const r = await fetch(`${ONECLI_BASE}/api/agents`);
    if (!r.ok) { res.status(r.status).json({ error: 'OneCLI unavailable' }); return; }
    const agents = await r.json() as Record<string, unknown>[];
    // fetch per-agent secrets in parallel
    const withSecrets = await Promise.all(
      agents.map(async (a) => {
        const { accessToken: _, ...safe } = a as Record<string, unknown> & { accessToken?: unknown };
        try {
          const sr = await fetch(`${ONECLI_BASE}/api/agents/${a.id}/secrets`);
          safe.secretIds = sr.ok ? await sr.json() : [];
        } catch { safe.secretIds = []; }
        return safe;
      }),
    );
    res.json(withSecrets);
  } catch {
    res.status(503).json({ error: 'OneCLI not running' });
  }
});

app.get('/api/onecli/secrets', async (_req, res) => {
  try {
    const r = await fetch(`${ONECLI_BASE}/api/secrets`);
    if (!r.ok) { res.status(r.status).json({ error: 'OneCLI unavailable' }); return; }
    res.json(await r.json());
  } catch {
    res.status(503).json({ error: 'OneCLI not running' });
  }
});

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

if (IS_PROD) {
  const clientDist = path.resolve(__dirname, '../dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`NanoClaw Dashboard API → http://localhost:${PORT}/api/topology`);
  if (IS_PROD) console.log(`Dashboard UI        → http://localhost:${PORT}`);
  else console.log(`Dashboard UI        → http://localhost:5173  (run: npm run dev)`);
});
