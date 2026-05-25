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
  assistantName: string | null;
  provider: string;
  cliScope: string | null;
  sessionCount: number;
  container: ContainerInfo | null;
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
