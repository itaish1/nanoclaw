import { useEffect, useRef, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeChange,
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

function buildGraph(data: TopologyData, posOverrides: Map<string, { x: number; y: number }>, onSelectAgent: (id: string) => void): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  data.agents.forEach((agent, i) => {
    const id = `agent-${agent.id}`;
    const defaultPos = { x: AGENT_X, y: i * ROW_H + 40 };
    nodes.push({
      id,
      type: 'agent',
      position: posOverrides.get(id) ?? defaultPos,
      data: { ...agent, onSelect: onSelectAgent } as unknown as AgentNodeData,
    });
  });

  const channelAgentMap = new Map<string, Set<number>>();
  for (const w of data.wirings) {
    const agentIdx = data.agents.findIndex((a) => a.id === w.agentGroupId);
    if (agentIdx === -1) continue;
    const set = channelAgentMap.get(w.messagingGroupId) ?? new Set();
    set.add(agentIdx);
    channelAgentMap.set(w.messagingGroupId, set);
  }

  const sortedMg = [...data.messagingGroups].sort((a, b) => {
    const avgIdx = (id: string) => {
      const s = channelAgentMap.get(id);
      if (!s || s.size === 0) return 999;
      return [...s].reduce((acc, v) => acc + v, 0) / s.size;
    };
    return avgIdx(a.id) - avgIdx(b.id);
  });

  sortedMg.forEach((mg, i) => {
    const id = `channel-${mg.id}`;
    const defaultPos = { x: CHANNEL_X, y: i * CHANNEL_ROW_H + 40 };
    nodes.push({
      id,
      type: 'channel',
      position: posOverrides.get(id) ?? defaultPos,
      data: mg as unknown as ChannelNodeData,
    });
  });

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
}

export function TopologyView({ data, onSelectAgent }: { data: TopologyData; onSelectAgent: (id: string) => void }) {
  // Persists user-dragged positions across data refreshes
  const posOverrides = useRef<Map<string, { x: number; y: number }>>(new Map());

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Rebuild graph when data changes, preserving manual positions
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = buildGraph(data, posOverrides.current, onSelectAgent);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [data, onSelectAgent, setNodes, setEdges]);

  // Intercept node changes to capture drag-end positions
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type === 'position' && change.position && !change.dragging) {
        posOverrides.current.set(change.id, change.position);
      }
    }
    onNodesChange(changes);
  }, [onNodesChange]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
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
