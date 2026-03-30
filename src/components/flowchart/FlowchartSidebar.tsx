import type { FlowchartNode, FlowchartEdge, SetCompletionLog } from '../../types';

interface FlowchartSidebarProps {
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
  setCompletionLogs: SetCompletionLog[];
  onExpand: () => void;
}

interface OrderedNode {
  node: FlowchartNode;
  depth: number;
}

function buildOrderedList(nodes: FlowchartNode[], edges: FlowchartEdge[]): OrderedNode[] {
  // Build adjacency and in-degree maps
  const childrenOf = new Map<string, string[]>();
  const parentCount = new Map<string, number>();

  for (const n of nodes) {
    childrenOf.set(n.id, []);
    parentCount.set(n.id, 0);
  }
  for (const e of edges) {
    const children = childrenOf.get(e.source);
    if (children) children.push(e.target);
    parentCount.set(e.target, (parentCount.get(e.target) ?? 0) + 1);
  }

  // Roots: nodes with no parents; entry nodes always first
  const roots = nodes
    .filter(n => (parentCount.get(n.id) ?? 0) === 0)
    .sort((a, b) => (a.type === 'entry' ? -1 : b.type === 'entry' ? 1 : 0));

  const result: OrderedNode[] = [];
  const visited = new Set<string>();

  function walk(nodeId: string, depth: number) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    result.push({ node, depth });
    for (const childId of childrenOf.get(nodeId) ?? []) {
      walk(childId, depth + 1);
    }
  }

  for (const root of roots) {
    walk(root.id, 0);
  }

  // Add any remaining nodes not reachable from roots
  for (const n of nodes) {
    if (!visited.has(n.id)) {
      result.push({ node: n, depth: 0 });
    }
  }

  return result;
}

function hasDirectEdge(edges: FlowchartEdge[], sourceId: string, targetId: string): boolean {
  return edges.some(e => e.source === sourceId && e.target === targetId);
}

function getEdgeBetween(edges: FlowchartEdge[], sourceId: string, targetId: string): FlowchartEdge | undefined {
  return edges.find(e => e.source === sourceId && e.target === targetId);
}

export function FlowchartSidebar({ nodes, edges, setCompletionLogs, onExpand }: FlowchartSidebarProps) {
  if (nodes.length === 0) return null;

  const completedWorkIds = new Set(setCompletionLogs.map(l => l.workId));
  const ordered = buildOrderedList(nodes, edges);

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
      <h3 className="text-[11px] font-bold text-stone-400 uppercase tracking-widest mb-4">
        추천 읽기 순서
      </h3>

      <div className="space-y-0">
        {ordered.map(({ node, depth }, index) => {
          const isEntry = node.type === 'entry';
          const isSide = node.type === 'side';
          const isCompleted = completedWorkIds.has(node.data.workId);

          // Find edge connecting previous node to this one
          const prevNode = index > 0 ? ordered[index - 1].node : null;
          const showArrow = prevNode !== null && hasDirectEdge(edges, prevNode.id, node.id);
          const connectingEdge = prevNode ? getEdgeBetween(edges, prevNode.id, node.id) : undefined;
          const edgeLabel = connectingEdge?.label as string | undefined;

          return (
            <div key={node.id}>
              {showArrow && (
                <div className={`flex flex-col items-center py-0.5 ${depth > 0 ? `pl-${Math.min(depth * 4, 8)}` : ''}`}>
                  <div className="text-stone-300 text-xs leading-none">↓</div>
                  {edgeLabel && (
                    <span className="text-[10px] italic text-stone-400 text-center leading-tight">{edgeLabel}</span>
                  )}
                </div>
              )}

              <div
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isEntry
                    ? 'bg-[#8B1A1A] text-white'
                    : isSide
                    ? 'bg-stone-50 border border-stone-200 text-stone-400 ml-4'
                    : 'bg-stone-100 border border-stone-200 text-stone-800'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {isEntry && (
                    <span className="text-[10px] font-bold shrink-0 opacity-90">★ 입문</span>
                  )}
                  <span className="truncate text-[12px]">{node.data.label}</span>
                </div>
                {isCompleted && (
                  <span
                    className="shrink-0 text-[11px] font-bold"
                    style={{ color: isEntry ? '#a7f3a0' : '#639922' }}
                  >
                    ✓
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={onExpand}
        className="mt-4 w-full text-center text-[12px] text-stone-500 hover:text-stone-800 font-medium transition-colors py-1.5 border border-stone-200 rounded-lg hover:border-stone-400 hover:bg-stone-50"
      >
        전체 보기 →
      </button>
    </div>
  );
}
