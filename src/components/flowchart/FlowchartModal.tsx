import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Controls,
  Background,
  type NodeTypes,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { X } from 'lucide-react';
import type { FlowchartNode, FlowchartEdge, SetCompletionLog } from '../../types';
import { FlowchartBookNode, type FlowchartBookNodeData } from './FlowchartBookNode';

// Defined at module scope — never inside a component — to avoid React Flow re-mount loops
const nodeTypes: NodeTypes = {
  entry: FlowchartBookNode as unknown as NodeTypes[string],
  main: FlowchartBookNode as unknown as NodeTypes[string],
  side: FlowchartBookNode as unknown as NodeTypes[string],
};

interface WorkCoverInfo {
  id: string;
  display_cover: string;
  published_year?: number;
}

interface FlowchartModalProps {
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
  setCompletionLogs: SetCompletionLog[];
  works: WorkCoverInfo[];
  title?: string;
  onClose: () => void;
}

export function FlowchartModal({ nodes, edges, setCompletionLogs, works, title = '읽기 순서', onClose }: FlowchartModalProps) {
  const navigate = useNavigate();

  const completedWorkIds = useMemo(
    () => new Set(setCompletionLogs.map(l => l.workId)),
    [setCompletionLogs]
  );

  // Enrich nodes with cover image, completion state, and year before passing to ReactFlow
  const enrichedNodes = useMemo(() =>
    nodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        coverImageUrl: works.find(w => w.id === n.data.workId)?.display_cover ?? '',
        isCompleted: completedWorkIds.has(n.data.workId),
        publishedYear: works.find(w => w.id === n.data.workId)?.published_year,
      } satisfies FlowchartBookNodeData,
    })),
    [nodes, works, completedWorkIds]
  );

  const styledEdges = useMemo(
    () => edges.map(e => ({ ...e, style: { stroke: '#a39a89', strokeWidth: 1.5 }, labelStyle: { fontSize: 11, fill: '#6d665a' } })),
    [edges]
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const workId = (node.data as FlowchartBookNodeData).workId;
      if (workId) {
        navigate(`/book/${workId}`);
        onClose();
      }
    },
    [navigate, onClose]
  );

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6">
      <div className="animate-fade-in absolute inset-0 bg-ink/50" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-rise relative flex h-full max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-line bg-paper-raised shadow-pop"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line-soft px-5 py-3.5">
          <h2 className="font-serif text-[19px] font-bold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="btn-icon -mr-2" aria-label="닫기" autoFocus>
            <X size={18} />
          </button>
        </div>

        <div className="relative flex-1 bg-paper">
          <ReactFlow
            nodes={enrichedNodes}
            edges={enrichedNodes.length > 0 ? styledEdges : []}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={{ type: 'step' }}
            onNodeClick={handleNodeClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.3}
            maxZoom={2}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
          >
            <Controls showInteractive={false} />
            <Background color="#ddd5c6" gap={22} size={1} />
          </ReactFlow>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-t border-line-soft px-5 py-3 text-[12.5px] text-ink-muted">
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-completed" aria-hidden /> 읽은 책 (초록 테두리)
          </span>
          <span className="flex items-center gap-2">
            <span className="rounded-[3px] bg-seal px-1.5 py-0.5 text-[10.5px] font-bold text-paper-raised">입문 추천</span>
            처음 읽기 좋은 책
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full border border-line-strong bg-paper-raised opacity-70" aria-hidden /> 곁가지 (흐리게)
          </span>
          <span className="ml-auto hidden text-ink-faint sm:inline">표지를 누르면 작품으로 이동합니다</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
