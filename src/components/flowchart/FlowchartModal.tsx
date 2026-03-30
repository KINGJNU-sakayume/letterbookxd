import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Controls,
  Background,
  type NodeTypes,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
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
  onClose: () => void;
}

export function FlowchartModal({ nodes, edges, setCompletionLogs, works, onClose }: FlowchartModalProps) {
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

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div
        className="relative w-full h-full max-w-6xl bg-white rounded-xl overflow-hidden shadow-2xl flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Gradient axis bar */}
        <div className="relative h-9 shrink-0 flex items-center justify-between px-4 bg-gradient-to-r from-blue-100 via-stone-50 to-red-100 border-b border-stone-100">
          <span className="text-[11px] font-bold text-blue-600 tracking-wide">← 자전적</span>
          <span className="text-[10px] text-stone-400 italic">주제 스펙트럼</span>
          <span className="text-[11px] font-bold text-red-600 tracking-wide">이념적 →</span>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-1.5 right-3 z-20 w-7 h-7 flex items-center justify-center text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-full transition-colors text-lg font-light"
          aria-label="닫기"
        >
          ✕
        </button>

        {/* React Flow canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={enrichedNodes}
            edges={enrichedNodes.length > 0 ? edges : []}
            nodeTypes={nodeTypes}
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
            <Background color="#e7e5e4" gap={20} size={1} />
          </ReactFlow>
        </div>

        {/* Legend */}
        <div className="shrink-0 border-t border-stone-100 bg-white px-4 py-2.5 flex flex-wrap items-center gap-4">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mr-1">범례</span>
          <LegendItem color="#639922" label="읽음" filled />
          <LegendItem color="#a8a29e" label="미읽음" filled={false} />
          <div className="flex items-center gap-1.5">
            <span className="inline-block px-1.5 py-0.5 bg-[#8B1A1A] text-white text-[9px] font-bold rounded">★ 입문</span>
            <span className="text-[11px] text-stone-500">입문 추천</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-5 rounded border-2 border-[#639922]" />
            <span className="text-[11px] text-stone-500">읽은 책 표시</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendItem({ color, label, filled }: { color: string; label: string; filled: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-3 h-3 rounded-full border border-white/40 shadow-sm"
        style={{ backgroundColor: filled ? color : 'transparent', borderColor: color, borderWidth: 2 }}
      />
      <span className="text-[11px] text-stone-500">{label}</span>
    </div>
  );
}
