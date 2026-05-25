import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../data/v2.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  }
  return db;
}

export interface AgentRow {
  id: string;
  name: string;
  folder: string;
  model: string | null;
  assistant_name: string | null;
  provider: string | null;
  cli_scope: string | null;
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
  status: string;
  container_status: string;
  last_active: string | null;
  created_at: string;
}

export function getAgents(): AgentRow[] {
  return getDb()
    .prepare(
      `SELECT
        ag.id, ag.name, ag.folder,
        cc.model, cc.assistant_name, cc.provider, cc.cli_scope
       FROM agent_groups ag
       LEFT JOIN container_configs cc ON cc.agent_group_id = ag.id
       ORDER BY ag.name`,
    )
    .all() as AgentRow[];
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
       FROM messaging_group_agents
       ORDER BY priority DESC`,
    )
    .all() as WiringRow[];
}

export function getSessions(): SessionRow[] {
  return getDb()
    .prepare(
      `SELECT id, agent_group_id, messaging_group_id, status, container_status, last_active, created_at
       FROM sessions
       WHERE status = 'active'
       ORDER BY last_active DESC`,
    )
    .all() as SessionRow[];
}

export function dbAvailable(): boolean {
  try {
    getDb();
    return true;
  } catch {
    return false;
  }
}
