import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';

// Extended data shape enriched before passing to ReactFlow
export interface FlowchartBookNodeData extends Record<string, unknown> {
  workId: string;
  label: string;
  coverImageUrl: string;
  isCompleted: boolean;
  publishedYear?: number;
}

// Full node type used as the NodeProps generic
type FlowchartBookNode = Node<FlowchartBookNodeData>;

export function FlowchartBookNode({ data, type }: NodeProps<FlowchartBookNode>) {
  const navigate = useNavigate();
  const isEntry = type === 'entry';
  const isSide = type === 'side';

  const handleClick = useCallback(() => {
    navigate(`/book/${data.workId}`);
  }, [navigate, data.workId]);

  return (
    <div
      onClick={handleClick}
      className={`cursor-pointer group relative transition-transform hover:-translate-y-0.5 ${isSide ? 'opacity-75' : ''}`}
      style={{ width: 110 }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      {/* Cover image */}
      <div
        className="relative aspect-[2/3] w-full rounded-md overflow-hidden shadow-md"
        style={data.isCompleted ? { outline: '2px solid #639922', outlineOffset: '2px' } : undefined}
      >
        {data.coverImageUrl ? (
          <img
            src={data.coverImageUrl as string}
            alt={data.label as string}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-stone-200 flex items-center justify-center">
            <span className="text-stone-400 text-[10px] text-center px-1">{data.label as string}</span>
          </div>
        )}

        {/* Entry banner */}
        {isEntry && (
          <div className="absolute bottom-0 left-0 right-0 bg-[#8B1A1A]/90 text-white text-[9px] font-bold text-center py-1 tracking-wide">
            ★ 입문 추천
          </div>
        )}

        {/* Reading status dot */}
        <div
          className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm"
          style={{ backgroundColor: data.isCompleted ? '#639922' : '#a8a29e' }}
        />
      </div>

      {/* Title */}
      <p className={`mt-1.5 text-[11px] font-medium text-center leading-tight line-clamp-2 px-0.5 ${
        isEntry ? 'text-stone-900' : 'text-stone-700'
      }`}>
        {data.label as string}
      </p>

      {/* Year */}
      {data.publishedYear && (
        <p className="text-[10px] text-stone-400 text-center mt-0.5">{data.publishedYear as number}</p>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}
