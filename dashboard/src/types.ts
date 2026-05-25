export interface ContainerInfo {
  status: 'running' | 'stopped';
  uptimeSeconds: number | null;
  ramUsedMb: number | null;
  ramTotalMb: number | null;
  cpuPercent: number | null;
}

export interface AgentInfo {
  id: string;
  name: string;
  folder: string;
  model: string | null;
  effort: string | null;
  assistantName: string | null;
  provider: string;
  cliScope: string | null;
  sessionCount: number;
  container: ContainerInfo | null;
}

export interface AgentDetail extends AgentInfo {
  maxMessagesPerPrompt: number | null;
  skills: string | string[];
  mcpServers: Record<string, unknown>;
  packagesApt: string[];
  packagesNpm: string[];
  sessions: SessionInfo[];
  totalChatMessages: number;
}

export interface SessionInfo {
  id: string;
  messagingGroupId: string | null;
  containerStatus: string;
  lastActive: string | null;
  createdAt: string;
  chatMessages: number;
  systemMessages: number;
}

export interface MessagingGroupInfo {
  id: string;
  channelType: string;
  platformId: string;
  name: string | null;
  isGroup: boolean;
}

export interface WiringInfo {
  agentGroupId: string;
  messagingGroupId: string;
  sessionMode: string | null;
  engageMode: string;
  priority: number;
}

export interface TopologyData {
  agents: AgentInfo[];
  messagingGroups: MessagingGroupInfo[];
  wirings: WiringInfo[];
}

export interface ModelPricing {
  label: string;
  inputPer1M: number;
  outputPer1M: number;
  ctInputPer1M: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-7':            { label: 'Claude Opus 4.7',   inputPer1M: 15,   outputPer1M: 75,  ctInputPer1M: 1.5 },
  'claude-opus-4-5':            { label: 'Claude Opus 4.5',   inputPer1M: 15,   outputPer1M: 75,  ctInputPer1M: 1.5 },
  'claude-sonnet-4-6':          { label: 'Claude Sonnet 4.6', inputPer1M: 3,    outputPer1M: 15,  ctInputPer1M: 0.3 },
  'claude-haiku-4-5-20251001':  { label: 'Claude Haiku 4.5',  inputPer1M: 0.8,  outputPer1M: 4,   ctInputPer1M: 0.08 },
  'claude-haiku-4-5':           { label: 'Claude Haiku 4.5',  inputPer1M: 0.8,  outputPer1M: 4,   ctInputPer1M: 0.08 },
};

export const KNOWN_MODELS = Object.keys(MODEL_PRICING);
export const EFFORT_OPTIONS = ['auto', 'low', 'medium', 'high'] as const;
