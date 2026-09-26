import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
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

function getEdgeBetween(edges: FlowchartEdge[], sourceId: string, targetId: string): FlowchartEdge | undefined {
  return edges.find(e => e.source === sourceId && e.target === targetId);
}

/** 작가의 추천 읽기 순서를 세로 줄기로 보여 준다 */
export function FlowchartSidebar({ nodes, edges, setCompletionLogs, onExpand }: FlowchartSidebarProps) {
  if (nodes.length === 0) return null;

  const completedWorkIds = new Set(setCompletionLogs.map(l => l.workId));
  const ordered = buildOrderedList(nodes, edges);
  const doneCount = ordered.filter(o => completedWorkIds.has(o.node.data.workId)).length;

  return (
    <section aria-labelledby="reading-order-heading" className="panel p-5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 id="reading-order-heading" className="font-serif text-[19px] font-bold text-ink">
          읽기 순서
        </h2>
        <button type="button" onClick={onExpand} className="shrink-0 text-[13px] text-ink-muted transition-colors hover:text-ink">
          크게 보기
        </button>
      </div>
      <p className="tnum mb-5 text-[12.5px] text-ink-muted">
        {ordered.length}편 중 {doneCount}편 읽음
      </p>

      <ol>
        {ordered.map(({ node, depth }, index) => {
          const isEntry = node.type === 'entry';
          const isSide = node.type === 'side';
          const isCompleted = completedWorkIds.has(node.data.workId);
          const prevNode = index > 0 ? ordered[index - 1].node : null;
          const edgeLabel = prevNode ? (getEdgeBetween(edges, prevNode.id, node.id)?.label as string | undefined) : undefined;
          const isLast = index === ordered.length - 1;

          return (
            <li key={node.id} className="relative flex gap-3" style={{ paddingLeft: Math.min(depth, 3) * 12 }}>
              {!isLast && (
                <span aria-hidden className="absolute bottom-0 top-5 w-px bg-line" style={{ left: Math.min(depth, 3) * 12 + 7.5 }} />
              )}
              <span
                aria-hidden
                className={`relative z-[1] mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                  isCompleted
                    ? 'border-completed bg-completed text-paper-raised'
                    : isEntry
                      ? 'border-seal bg-paper-raised'
                      : isSide
                        ? 'scale-75 border-line-strong bg-paper-raised'
                        : 'border-ink-faint bg-paper-raised'
                }`}
              >
                {isCompleted && <Check size={10} strokeWidth={3.5} />}
              </span>
              <div className={`min-w-0 flex-1 ${isLast ? '' : 'pb-4'}`}>
                {edgeLabel && <p className="mb-0.5 text-[12px] italic text-ink-faint">{edgeLabel}</p>}
                <Link
                  to={`/book/${node.data.workId}`}
                  className={`block truncate text-[14px] decoration-line-strong underline-offset-4 hover:underline ${
                    isSide ? 'text-ink-muted' : 'font-medium text-ink'
                  }`}
                >
                  {node.data.label}
                </Link>
                <p className="mt-0.5 flex gap-2 text-[12px]">
                  {isEntry && <span className="font-medium text-seal">입문 추천</span>}
                  {isSide && <span className="text-ink-faint">곁가지</span>}
                  {isCompleted && <span className="text-completed-dark">완독</span>}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
