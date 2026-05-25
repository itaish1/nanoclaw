import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAgents, getMessagingGroups, getWirings, getSessions, dbAvailable } from './db.js';
import { getContainerStats } from './docker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4242;
const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json());

app.get('/api/topology', async (_req, res) => {
  if (!dbAvailable()) {
    res.status(503).json({ error: 'Database not found. Is NanoClaw installed?' });
    return;
  }

  const [agents, messagingGroups, wirings, sessions, containerStats] = await Promise.all([
    Promise.resolve(getAgents()),
    Promise.resolve(getMessagingGroups()),
    Promise.resolve(getWirings()),
    Promise.resolve(getSessions()),
    getContainerStats(),
  ]);

  // Index sessions by agent group for quick lookup
  const sessionsByAgent = new Map<string, typeof sessions[number][]>();
  for (const s of sessions) {
    const list = sessionsByAgent.get(s.agent_group_id) ?? [];
    list.push(s);
    sessionsByAgent.set(s.agent_group_id, list);
  }

  const agentsOut = agents.map((a) => {
    const docker = containerStats.get(a.folder) ?? null;
    const agentSessions = sessionsByAgent.get(a.id) ?? [];
    const hasRunningSession = agentSessions.some((s) => s.container_status === 'running');

    return {
      id: a.id,
      name: a.name,
      folder: a.folder,
      model: a.model,
      assistantName: a.assistant_name,
      provider: a.provider ?? 'claude',
      cliScope: a.cli_scope,
      sessionCount: agentSessions.length,
      container: docker
        ? {
            status: docker.status,
            uptimeSeconds: docker.uptimeSeconds,
            ramUsedMb: docker.ramUsedMb,
            ramTotalMb: docker.ramTotalMb,
            cpuPercent: docker.cpuPercent,
          }
        : hasRunningSession
          ? { status: 'running' as const, uptimeSeconds: null, ramUsedMb: null, ramTotalMb: null, cpuPercent: null }
          : null,
    };
  });

  res.json({
    agents: agentsOut,
    messagingGroups: messagingGroups.map((g) => ({
      id: g.id,
      channelType: g.channel_type,
      platformId: g.platform_id,
      name: g.name,
      isGroup: g.is_group === 1,
    })),
    wirings: wirings.map((w) => ({
      agentGroupId: w.agent_group_id,
      messagingGroupId: w.messaging_group_id,
      sessionMode: w.session_mode,
      engageMode: w.engage_mode,
      priority: w.priority,
    })),
  });
});

if (IS_PROD) {
  const clientDist = path.resolve(__dirname, '../dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`NanoClaw Dashboard API → http://localhost:${PORT}/api/topology`);
  if (IS_PROD) console.log(`Dashboard UI        → http://localhost:${PORT}`);
});
