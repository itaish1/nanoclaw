import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DB_PATH = path.join(PROJECT_ROOT, 'data/v2.db');
const SESSIONS_DIR = path.join(PROJECT_ROOT, 'data/v2-sessions');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH, { readonly: false, fileMustExist: true });
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 3000');
  }
  return db;
}

export interface AgentRow {
  id: string;
  name: string;
  folder: string;
  model: string | null;
  effort: string | null;
  assistant_name: string | null;
  max_messages_per_prompt: number | null;
  provider: string | null;
  cli_scope: string | null;
  skills: string | null;
  mcp_servers: string | null;
  packages_apt: string | null;
  packages_npm: string | null;
}

export interface MessagingGroupRow {
  id: string;
  channel_type: string;
  platform_id: string;
  name: string | null;
  is_group: number;
}

export interface WiringRow {
  agent_group_id: string;
  messaging_group_id: string;
  session_mode: string | null;
  engage_mode: string;
  priority: number;
}

export interface SessionRow {
  id: string;
  agent_group_id: string;
  messaging_group_id: string | null;
  container_status: string;
  last_active: string | null;
  created_at: string;
}

export interface AgentConfigUpdate {
  model?: string | null;
  effort?: string | null;
  assistant_name?: string | null;
  max_messages_per_prompt?: number | null;
}

export interface SessionStats {
  session: SessionRow;
  chatMessages: number;
  systemMessages: number;
}

export function getAgents(): AgentRow[] {
  return getDb()
    .prepare(
      `SELECT
        ag.id, ag.name, ag.folder,
        cc.model, cc.effort, cc.assistant_name, cc.max_messages_per_prompt,
        cc.provider, cc.cli_scope, cc.skills, cc.mcp_servers,
        cc.packages_apt, cc.packages_npm
       FROM agent_groups ag
       LEFT JOIN container_configs cc ON cc.agent_group_id = ag.id
       ORDER BY ag.name`,
    )
    .all() as AgentRow[];
}

export function getAgentById(id: string): AgentRow | undefined {
  return getDb()
    .prepare(
      `SELECT
        ag.id, ag.name, ag.folder,
        cc.model, cc.effort, cc.assistant_name, cc.max_messages_per_prompt,
        cc.provider, cc.cli_scope, cc.skills, cc.mcp_servers,
        cc.packages_apt, cc.packages_npm
       FROM agent_groups ag
       LEFT JOIN container_configs cc ON cc.agent_group_id = ag.id
       WHERE ag.id = ?`,
    )
    .get(id) as AgentRow | undefined;
}

export function getMessagingGroups(): MessagingGroupRow[] {
  return getDb()
    .prepare('SELECT id, channel_type, platform_id, name, is_group FROM messaging_groups ORDER BY channel_type, name')
    .all() as MessagingGroupRow[];
}

export function getWirings(): WiringRow[] {
  return getDb()
    .prepare(
      `SELECT agent_group_id, messaging_group_id, session_mode, engage_mode, priority
       FROM messaging_group_agents ORDER BY priority DESC`,
    )
    .all() as WiringRow[];
}

export function getSessionsForAgent(agentGroupId: string): SessionRow[] {
  return getDb()
    .prepare(
      `SELECT id, agent_group_id, messaging_group_id, container_status, last_active, created_at
       FROM sessions WHERE agent_group_id = ? AND status = 'active'
       ORDER BY last_active DESC LIMIT 20`,
    )
    .all(agentGroupId) as SessionRow[];
}

export function getSessionStats(agentGroupId: string): SessionStats[] {
  const sessions = getSessionsForAgent(agentGroupId);
  return sessions.map((session) => {
    const dbPath = path.join(SESSIONS_DIR, agentGroupId, session.id, 'outbound.db');
    let chatMessages = 0;
    let systemMessages = 0;
    try {
      if (fs.existsSync(dbPath)) {
        const sdb = new Database(dbPath, { readonly: true, fileMustExist: true });
        const rows = sdb.prepare(`SELECT kind, COUNT(*) as cnt FROM messages_out GROUP BY kind`).all() as { kind: string; cnt: number }[];
        sdb.close();
        for (const r of rows) {
          if (r.kind === 'chat') chatMessages = r.cnt;
          else if (r.kind === 'system') systemMessages = r.cnt;
        }
      }
    } catch {
      // session DB not accessible
    }
    return { session, chatMessages, systemMessages };
  });
}

export function updateAgentConfig(agentGroupId: string, updates: AgentConfigUpdate): void {
  const fields: string[] = [];
  const values: Record<string, unknown> = { id: agentGroupId };

  if ('model' in updates) { fields.push('model = @model'); values.model = updates.model ?? null; }
  if ('effort' in updates) { fields.push('effort = @effort'); values.effort = updates.effort ?? null; }
  if ('assistant_name' in updates) { fields.push('assistant_name = @assistant_name'); values.assistant_name = updates.assistant_name ?? null; }
  if ('max_messages_per_prompt' in updates) { fields.push('max_messages_per_prompt = @max_messages_per_prompt'); values.max_messages_per_prompt = updates.max_messages_per_prompt ?? null; }

  if (fields.length === 0) return;
  fields.push('updated_at = @updated_at');
  values.updated_at = new Date().toISOString();

  getDb()
    .prepare(`UPDATE container_configs SET ${fields.join(', ')} WHERE agent_group_id = @id`)
    .run(values);
}

export function getAllSessions(): { id: string; agent_group_id: string; container_status: string; last_active: string | null }[] {
  return getDb()
    .prepare(`SELECT id, agent_group_id, container_status, last_active FROM sessions WHERE status = 'active'`)
    .all() as { id: string; agent_group_id: string; container_status: string; last_active: string | null }[];
}

export function dbAvailable(): boolean {
  try { getDb(); return true; } catch { return false; }
}
