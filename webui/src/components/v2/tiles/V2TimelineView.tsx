/**
 * V2TimelineView — Consolidated v2-native timeline visualization.
 *
 * Replaces v1 TimelineView + TimelineNode + TimelineArrow + TimelineLegend.
 * Uses v2 design tokens, CSS transitions (no framer-motion), and a useRef
 * for animated-node tracking (resets on unmount/session switch).
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Loader2, GitBranch, CheckCircle2 } from 'lucide-react';
import { useAgentStore, selectIsComplete } from '../../../stores/agentStore';
import type { TimelineNode as TimelineNodeType, TimelineData } from '../../../types';
import { getAgentColor } from '../../../utils/agentColors';

interface V2TimelineViewProps {
  onNodeClick?: (node: TimelineNodeType) => void;
}

// Layout constants — horizontal flow (time = left→right, agents = top→bottom rows)
const NODE_SIZE = 40;
const NODE_GAP_X = 100;     // horizontal spacing between nodes in same row
const ROW_HEIGHT = 120;      // vertical spacing between agent rows
const HEADER_WIDTH = 100;    // left column for agent labels
const PADDING = 40;

// ============================================================================
// Main Component
// ============================================================================

export function V2TimelineView({ onNodeClick }: V2TimelineViewProps) {
  const [timelineData, setTimelineData] = useState<TimelineData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sessionId = useAgentStore((state) => state.sessionId);
  const isComplete = useAgentStore(selectIsComplete);

  // Track animated nodes per instance (resets on unmount/session switch)
  const animatedNodesRef = useRef<Set<string>>(new Set());

  // Reset animated nodes when session changes
  useEffect(() => {
    animatedNodesRef.current.clear();
  }, [sessionId]);

  const hasFinalNode = useMemo(() => {
    return timelineData?.nodes.some(n => n.type === 'final') ?? false;
  }, [timelineData]);

  // Fetch timeline data
  const timelineDataRef = useRef(timelineData);
  timelineDataRef.current = timelineData;

  const fetchTimeline = useCallback(async () => {
    if (!sessionId) {
      setIsLoading(false);
      return;
    }
    if (!timelineDataRef.current) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/timeline`);
      if (!response.ok) throw new Error('Failed to fetch timeline');
      const data: TimelineData = await response.json();
      setTimelineData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timeline');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchTimeline();
    const interval = setInterval(fetchTimeline, 3000);
    return () => clearInterval(interval);
  }, [fetchTimeline]);

  // Calculate node positions — horizontal layout
  const nodePositions = useMemo(() => {
    if (!timelineData || timelineData.nodes.length === 0) {
      return new Map<string, { x: number; y: number }>();
    }

    const positions = new Map<string, { x: number; y: number }>();
    const { nodes, agents } = timelineData;

    const nodesByAgent = new Map<string, TimelineNodeType[]>();
    agents.forEach(agentId => nodesByAgent.set(agentId, []));

    nodes.forEach(node => {
      const agentNodes = nodesByAgent.get(node.agentId);
      if (agentNodes) agentNodes.push(node);
    });

    // Agents are rows (y), time flows left→right (x)
    agents.forEach((agentId, agentIndex) => {
      const agentNodes = nodesByAgent.get(agentId) || [];
      agentNodes.sort((a, b) => a.timestamp - b.timestamp);
      agentNodes.forEach((node, nodeIndex) => {
        const x = HEADER_WIDTH + PADDING + nodeIndex * NODE_GAP_X;
        const y = PADDING + agentIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
        positions.set(node.id, { x, y });
      });
    });

    return positions;
  }, [timelineData]);

  // SVG dimensions — horizontal layout
  const svgDimensions = useMemo(() => {
    if (!timelineData) return { width: 800, height: 300 };
    let maxX = HEADER_WIDTH + PADDING;
    nodePositions.forEach(pos => { maxX = Math.max(maxX, pos.x); });
    const width = Math.max(800, maxX + NODE_GAP_X + PADDING);
    const height = Math.max(300, PADDING * 2 + timelineData.agents.length * ROW_HEIGHT);
    return { width, height };
  }, [timelineData, nodePositions]);

  // Loading
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-v2-text-muted">
        <Loader2 className="w-8 h-8 animate-spin mb-3" />
        <p>Loading timeline...</p>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-400">
        <GitBranch className="w-12 h-12 mb-3 opacity-50" />
        <p className="font-medium">Failed to load timeline</p>
        <p className="text-sm text-v2-text-muted mt-1">{error}</p>
        <p className="text-xs text-v2-text-muted mt-2">Retrying automatically...</p>
      </div>
    );
  }

  // No session
  if (!sessionId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-v2-text-muted">
        <GitBranch className="w-12 h-12 mb-3 opacity-50" />
        <p>No active session</p>
        <p className="text-sm mt-1">Start a coordination to see the timeline</p>
      </div>
    );
  }

  // No data
  if (!timelineData || timelineData.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-v2-text-muted">
        <GitBranch className="w-12 h-12 mb-3 opacity-50" />
        <p>No timeline data yet</p>
        <p className="text-sm mt-1">Timeline will populate as agents submit answers and votes</p>
      </div>
    );
  }

  // Find latest vote per agent (to mark superseded votes)
  const latestVoteByAgent = new Map<string, number>();
  timelineData.nodes
    .filter(n => n.type === 'vote')
    .forEach(node => {
      const existing = latestVoteByAgent.get(node.agentId);
      if (!existing || node.timestamp > existing) {
        latestVoteByAgent.set(node.agentId, node.timestamp);
      }
    });

  return (
    <div className="flex flex-col h-full">
      {/* Legend */}
      <V2Legend />

      {/* Completion Banner */}
      {(isComplete || hasFinalNode) && (
        <div className="mx-4 mb-2 px-4 py-3 bg-v2-surface border border-emerald-600/50 rounded-lg flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <p className="text-emerald-400 font-medium text-sm">Coordination Complete</p>
            <p className="text-v2-text-muted text-xs">Final answer has been selected</p>
          </div>
        </div>
      )}

      {/* Timeline SVG */}
      <div className="flex-1 overflow-auto v2-scrollbar p-4">
        <svg width={svgDimensions.width} height={svgDimensions.height} className="min-w-full">
          {/* Swimlane horizontal grid lines (one per agent row) */}
          {timelineData.agents.map((_, index) => {
            const y = PADDING + index * ROW_HEIGHT + ROW_HEIGHT / 2;
            return (
              <line
                key={`grid-${index}`}
                x1={HEADER_WIDTH}
                y1={y}
                x2={svgDimensions.width - PADDING}
                y2={y}
                stroke="var(--v2-border)"
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity={0.3}
              />
            );
          })}

          {/* Agent row labels (left side) */}
          {timelineData.agents.map((agentId, index) => {
            const y = PADDING + index * ROW_HEIGHT + ROW_HEIGHT / 2;
            const color = getAgentColor(agentId, timelineData.agents);
            return (
              <g key={`header-${agentId}`}>
                <rect
                  x={4} y={y - 16} width={HEADER_WIDTH - 8} height={32} rx={6}
                  fill={`${color.hex}22`}
                  stroke={`${color.hex}60`}
                  strokeWidth="1"
                />
                <text
                  x={HEADER_WIDTH / 2} y={y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={color.hex}
                  className="text-xs font-medium"
                >
                  Agent {index + 1}
                </text>
              </g>
            );
          })}

          {/* Context arrows (behind nodes) */}
          {timelineData.nodes
            .filter(node => node.type !== 'vote')
            .map(node => {
              const nodePos = nodePositions.get(node.id);
              if (!nodePos) return null;
              return node.contextSources.map(sourceLabel => {
                const sourceNode = timelineData.nodes.find(n => n.label === sourceLabel);
                if (!sourceNode || sourceNode.type === 'vote') return null;
                if (sourceNode.timestamp >= node.timestamp) return null;
                const sourcePos = nodePositions.get(sourceNode.id);
                if (!sourcePos) return null;
                return (
                  <V2Arrow
                    key={`arrow-${sourceNode.id}-${node.id}`}
                    from={sourcePos}
                    to={nodePos}
                    type="context"
                  />
                );
              });
            })}

          {/* Vote arrows */}
          {timelineData.nodes
            .filter(n => n.type === 'vote' && n.votedFor)
            .map(node => {
              const nodePos = nodePositions.get(node.id);
              if (!nodePos || !node.votedFor) return null;

              let targetAnswer = timelineData.nodes.find(
                n => n.type === 'answer' && n.label === node.votedFor
              );
              if (!targetAnswer) {
                targetAnswer = timelineData.nodes.find(
                  n => n.type === 'answer' && n.agentId === node.votedFor
                );
              }

              if (!targetAnswer) {
                const labelMatch = node.votedFor.match(/agent(\d+)/);
                let targetAgentIndex = -1;
                if (labelMatch) {
                  targetAgentIndex = parseInt(labelMatch[1], 10) - 1;
                } else {
                  targetAgentIndex = timelineData.agents.indexOf(node.votedFor);
                }
                if (targetAgentIndex === -1 || targetAgentIndex >= timelineData.agents.length) return null;
                const targetY = PADDING + targetAgentIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
                return (
                  <V2Arrow
                    key={`vote-arrow-${node.id}`}
                    from={nodePos}
                    to={{ x: nodePos.x - 40, y: targetY }}
                    type="vote"
                  />
                );
              }

              const targetPos = nodePositions.get(targetAnswer.id);
              if (!targetPos) return null;
              return (
                <V2Arrow
                  key={`vote-arrow-${node.id}`}
                  from={nodePos}
                  to={targetPos}
                  type="vote"
                />
              );
            })}

          {/* Nodes */}
          {timelineData.nodes.map(node => {
            const pos = nodePositions.get(node.id);
            if (!pos) return null;

            const nodeSize = node.type === 'final' ? NODE_SIZE * 1.4 : NODE_SIZE;
            const filteredContextSources = node.contextSources.filter(sourceLabel => {
              const sourceNode = timelineData.nodes.find(n => n.label === sourceLabel);
              return sourceNode && sourceNode.timestamp < node.timestamp;
            });
            const displayNode = { ...node, contextSources: filteredContextSources };
            const isSuperseded = node.type === 'vote' &&
              node.timestamp !== latestVoteByAgent.get(node.agentId);

            return (
              <V2Node
                key={node.id}
                node={displayNode}
                x={pos.x}
                y={pos.y}
                size={nodeSize}
                agentOrder={timelineData.agents}
                isSuperseded={isSuperseded}
                animatedNodesRef={animatedNodesRef}
                onClick={() => onNodeClick?.(node)}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ============================================================================
// V2Legend
// ============================================================================

function V2Legend() {
  return (
    <div className="flex items-center gap-6 px-4 py-2 bg-v2-surface border-b border-v2-border">
      {/* Node types */}
      <div className="flex items-center gap-4">
        <span className="text-xs text-v2-text-muted uppercase tracking-wider">Nodes:</span>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 border border-blue-400" />
          <span className="text-xs text-v2-text-secondary">Answer</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 border border-amber-400" />
          <span className="text-xs text-v2-text-secondary">Vote</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-600 border border-yellow-400 shadow-[0_0_8px_rgba(234,179,8,0.4)]" />
          <span className="text-xs text-v2-text-secondary">Final</span>
        </div>
      </div>

      <div className="h-4 w-px bg-v2-border" />

      {/* Arrow types */}
      <div className="flex items-center gap-4">
        <span className="text-xs text-v2-text-muted uppercase tracking-wider">Arrows:</span>
        <div className="flex items-center gap-1.5">
          <svg width="24" height="12" className="overflow-visible">
            <defs>
              <marker id="legend-ctx" markerWidth="6" markerHeight="5" refX="5" refY="2.5" orient="auto">
                <polygon points="0 0, 6 2.5, 0 5" fill="#3B82F6" />
              </marker>
            </defs>
            <line x1="0" y1="6" x2="18" y2="6" stroke="#3B82F6" strokeWidth="2" markerEnd="url(#legend-ctx)" />
          </svg>
          <span className="text-xs text-v2-text-secondary">Context</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="24" height="12" className="overflow-visible">
            <defs>
              <marker id="legend-vt" markerWidth="6" markerHeight="5" refX="5" refY="2.5" orient="auto">
                <polygon points="0 0, 6 2.5, 0 5" fill="#F59E0B" />
              </marker>
            </defs>
            <line x1="0" y1="6" x2="18" y2="6" stroke="#F59E0B" strokeWidth="2.5" strokeDasharray="4 2" markerEnd="url(#legend-vt)" />
          </svg>
          <span className="text-xs text-v2-text-secondary">Vote</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// V2Arrow
// ============================================================================

interface V2ArrowProps {
  from: { x: number; y: number };
  to: { x: number; y: number };
  type: 'context' | 'vote';
}

const ARROW_COLORS = {
  context: '#3B82F6',
  vote: '#F59E0B',
};

function V2Arrow({ from, to, type }: V2ArrowProps) {
  const color = ARROW_COLORS[type];

  const path = useMemo(() => {
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const curveOffset = Math.min(50, Math.abs(dx) * 0.3);
    const controlY = dy > 0 ? midY - curveOffset : midY + curveOffset;

    if (Math.abs(dx) < 10) {
      return `M ${from.x} ${from.y} Q ${from.x + 40} ${midY} ${to.x} ${to.y}`;
    }
    return `M ${from.x} ${from.y} Q ${midX} ${controlY} ${to.x} ${to.y}`;
  }, [from, to]);

  const markerId = `ah-${type}-${from.x}-${from.y}-${to.x}-${to.y}`;

  return (
    <g>
      <defs>
        <marker id={markerId} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill={color} />
        </marker>
      </defs>
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={type === 'vote' ? 2.5 : 2}
        strokeOpacity={0.6}
        strokeDasharray={type === 'context' ? 'none' : '5 3'}
        markerEnd={`url(#${markerId})`}
      />
    </g>
  );
}

// ============================================================================
// V2Node
// ============================================================================

interface V2NodeProps {
  node: TimelineNodeType;
  x: number;
  y: number;
  size: number;
  agentOrder: string[];
  isSuperseded: boolean;
  animatedNodesRef: React.RefObject<Set<string>>;
  onClick?: () => void;
}

function V2Node({ node, x, y, size, agentOrder, isSuperseded, animatedNodesRef, onClick }: V2NodeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const radius = size / 2;

  // Get node colors
  const colors = useMemo(() => {
    if (node.type === 'answer') {
      const agentColor = getAgentColor(node.agentId, agentOrder);
      return {
        fill: `url(#agent-${node.agentId}-gradient)`,
        stroke: agentColor.hexLight,
        glow: `${agentColor.hex}66`,
        hex: agentColor.hex,
        hexLight: agentColor.hexLight,
      };
    }
    if (node.type === 'vote' && isSuperseded) {
      return { fill: 'url(#voteSupersededGrad)', stroke: '#6B7280', glow: 'rgba(107,114,128,0.3)' };
    }
    if (node.type === 'vote') {
      return { fill: 'url(#voteGrad)', stroke: '#FBBF24', glow: 'rgba(245,158,11,0.4)' };
    }
    // final
    return { fill: 'url(#finalGrad)', stroke: '#FDE047', glow: 'rgba(234,179,8,0.5)' };
  }, [node.type, node.agentId, agentOrder, isSuperseded]);

  // CSS-transition-based entrance: check ref, mark as seen
  const shouldAnimate = !animatedNodesRef.current?.has(node.id);
  useEffect(() => {
    animatedNodesRef.current?.add(node.id);
  }, [node.id, animatedNodesRef]);

  const formatTime = (ts: number) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const scale = isHovered ? 1.15 : (shouldAnimate ? 0 : 1);

  return (
    <g
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* Gradient defs */}
      <defs>
        {'hex' in colors && (
          <linearGradient id={`agent-${node.agentId}-gradient`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors.hexLight} />
            <stop offset="100%" stopColor={colors.hex} />
          </linearGradient>
        )}
        <linearGradient id="voteGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
        <linearGradient id="voteSupersededGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6B7280" />
          <stop offset="100%" stopColor="#4B5563" />
        </linearGradient>
        <linearGradient id="finalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#EAB308" />
          <stop offset="100%" stopColor="#CA8A04" />
        </linearGradient>
        <filter id={`glow-${node.id}`}>
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Hover glow */}
      {isHovered && (
        <circle cx={x} cy={y} r={radius + 6} fill={colors.glow} opacity={0.6} />
      )}

      {/* Main circle — CSS transition replaces framer-motion */}
      <circle
        cx={x}
        cy={y}
        r={radius}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={2}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: `${x}px ${y}px`,
          transition: 'transform 200ms ease-out',
        }}
        filter={node.type === 'final' ? `url(#glow-${node.id})` : undefined}
      />

      {/* Label inside node */}
      <text
        x={x} y={y + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-white text-xs font-bold select-none pointer-events-none"
      >
        {node.type === 'answer' && 'A'}
        {node.type === 'vote' && 'V'}
        {node.type === 'final' && '\u2605'}
      </text>

      {/* Label below */}
      <text
        x={x} y={y + radius + 14}
        textAnchor="middle"
        className="text-xs font-medium select-none pointer-events-none"
        fill={isSuperseded ? 'var(--v2-text-muted)' : 'var(--v2-text-secondary)'}
      >
        {node.label}{isSuperseded ? ' \u2717' : ''}
      </text>

      {/* Tooltip */}
      {isHovered && (
        <V2Tooltip node={node} x={x} y={y} radius={radius} formatTime={formatTime} />
      )}
    </g>
  );
}

// ============================================================================
// V2Tooltip
// ============================================================================

interface V2TooltipProps {
  node: TimelineNodeType;
  x: number;
  y: number;
  radius: number;
  formatTime: (ts: number) => string;
}

function V2Tooltip({ node, x, y, radius, formatTime }: V2TooltipProps) {
  const tooltipX = x + radius + 10;
  const tooltipY = y - 40;
  const lineHeight = 14;
  let currentY = tooltipY + 16;

  let contentLines = 2;
  if (node.type === 'vote' && node.votedFor) contentLines += 1;
  if (node.type === 'vote' && node.contextSources.length > 0) {
    contentLines += 1 + node.contextSources.length;
  } else if (node.contextSources.length > 0) {
    contentLines += 1 + Math.min(node.contextSources.length, 4);
  }

  const tooltipHeight = 20 + contentLines * lineHeight;
  const tooltipWidth = 150;

  return (
    <g>
      <rect
        x={tooltipX} y={tooltipY}
        width={tooltipWidth} height={tooltipHeight}
        rx={6}
        fill="var(--v2-surface)"
        stroke="var(--v2-border)"
        strokeWidth={1}
      />
      <text x={tooltipX + 8} y={currentY} className="text-xs font-medium" fill="var(--v2-text)">
        {node.label}
      </text>
      <text x={tooltipX + 8} y={currentY += lineHeight} className="text-xs" fill="var(--v2-text-muted)">
        {formatTime(node.timestamp)}
      </text>
      {node.type === 'vote' && node.votedFor && (
        <text x={tooltipX + 8} y={currentY += lineHeight} className="text-xs font-medium fill-amber-400">
          Voted: {node.votedFor}
        </text>
      )}
      {node.type === 'vote' && node.contextSources.length > 0 && (
        <>
          <text x={tooltipX + 8} y={currentY += lineHeight} className="text-xs" fill="var(--v2-text-muted)">
            Options:
          </text>
          {node.contextSources.map((source) => {
            const isSelected = source === node.votedFor || source.includes(node.votedFor || '');
            return (
              <text
                key={source}
                x={tooltipX + 12}
                y={currentY += lineHeight}
                className={isSelected ? 'text-xs font-medium fill-amber-300' : 'text-xs'}
                fill={isSelected ? undefined : 'var(--v2-text-secondary)'}
              >
                {isSelected ? '\u25CF ' : '\u25CB '}{source}
              </text>
            );
          })}
        </>
      )}
      {node.type !== 'vote' && node.contextSources.length > 0 && (
        <>
          <text x={tooltipX + 8} y={currentY += lineHeight} className="text-xs" fill="var(--v2-text-muted)">
            Context:
          </text>
          {node.contextSources.slice(0, 4).map((source) => (
            <text
              key={source}
              x={tooltipX + 12}
              y={currentY += lineHeight}
              className="text-xs fill-blue-400"
            >
              {'\u2190'} {source}
            </text>
          ))}
          {node.contextSources.length > 4 && (
            <text x={tooltipX + 12} y={currentY += lineHeight} className="text-xs" fill="var(--v2-text-muted)">
              +{node.contextSources.length - 4} more...
            </text>
          )}
        </>
      )}
    </g>
  );
}
