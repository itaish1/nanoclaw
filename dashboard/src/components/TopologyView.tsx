import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AgentNode, type AgentNodeData } from './AgentNode';
import { ChannelNode, type ChannelNodeData } from './ChannelNode';
import type { TopologyData } from '../types';

const nodeTypes = { agent: AgentNode, channel: ChannelNode };

const AGENT_X = 520;
const CHANNEL_X = 60;
const ROW_H = 220;
const CHANNEL_ROW_H = 100;

export function TopologyView({ data, onSelectAgent }: { data: TopologyData; onSelectAgent: (id: string) => void }) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Position agents
    data.agents.forEach((agent, i) => {
      nodes.push({
        id: `agent-${agent.id}`,
        type: 'agent',
        position: { x: AGENT_X, y: i * ROW_H + 40 },
        data: { ...agent, onSelect: onSelectAgent } as unknown as AgentNodeData,
      });
    });

    // Position messaging groups — group by which agents they connect to
    // to cluster them near their agents vertically
    const channelAgentMap = new Map<string, Set<number>>();
    for (const w of data.wirings) {
      const agentIdx = data.agents.findIndex((a) => a.id === w.agentGroupId);
      if (agentIdx === -1) continue;
      const set = channelAgentMap.get(w.messagingGroupId) ?? new Set();
      set.add(agentIdx);
      channelAgentMap.set(w.messagingGroupId, set);
    }

    // Sort messaging groups by average connected agent index
    const sortedMg = [...data.messagingGroups].sort((a, b) => {
      const avgIdx = (id: string) => {
        const s = channelAgentMap.get(id);
        if (!s || s.size === 0) return 999;
        return [...s].reduce((acc, v) => acc + v, 0) / s.size;
      };
      return avgIdx(a.id) - avgIdx(b.id);
    });

    sortedMg.forEach((mg, i) => {
      nodes.push({
        id: `channel-${mg.id}`,
        type: 'channel',
        position: { x: CHANNEL_X, y: i * CHANNEL_ROW_H + 40 },
        data: mg as unknown as ChannelNodeData,
      });
    });

    // Edges
    for (const w of data.wirings) {
      edges.push({
        id: `wire-${w.messagingGroupId}-${w.agentGroupId}`,
        source: `channel-${w.messagingGroupId}`,
        target: `agent-${w.agentGroupId}`,
        label: w.sessionMode ?? w.engageMode,
        style: { stroke: '#374151', strokeWidth: 1.5 },
        labelStyle: { fill: '#6B7280', fontSize: 10 },
        labelBgStyle: { fill: '#0F0F1A' },
        animated: true,
      });
    }

    return { nodes, edges };
  }, [data]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={2}
        colorMode="dark"
      >
        <Background color="#1E1E30" gap={24} />
        <Controls style={{ background: '#1E1E30', borderColor: '#2D2D45', color: '#94A3B8' }} />
        <MiniMap
          style={{ background: '#161625', border: '1px solid #2D2D45' }}
          nodeColor={() => '#2D2D45'}
          maskColor="rgba(0,0,0,0.4)"
        />
      </ReactFlow>
    </div>
  );
}
