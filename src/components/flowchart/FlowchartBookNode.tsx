import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Check } from 'lucide-react';

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
      className={`group relative cursor-pointer transition-transform hover:-translate-y-0.5 ${isSide ? 'opacity-70' : ''}`}
      style={{ width: 110 }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      <div
        className="book-cover relative aspect-[2/3] w-full"
        style={data.isCompleted ? { outline: '2px solid #4d7a2e', outlineOffset: '3px' } : undefined}
      >
        {data.coverImageUrl ? (
          <img src={data.coverImageUrl} alt={data.label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#5b4f45] px-2">
            <span className="text-center font-serif text-[11px] font-bold leading-snug text-[#f3ebdb]">{data.label}</span>
          </div>
        )}

        {isEntry && (
          <div className="absolute inset-x-0 bottom-0 z-[2] bg-seal/95 py-1 text-center text-[10px] font-bold tracking-wide text-paper-raised">
            입문 추천
          </div>
        )}

        {data.isCompleted && (
          <div className="absolute right-1.5 top-1.5 z-[2] flex h-4 w-4 items-center justify-center rounded-full bg-completed text-paper-raised shadow-sm">
            <Check size={10} strokeWidth={3.5} />
          </div>
        )}
      </div>

      <p className={`mt-2 line-clamp-2 px-0.5 text-center text-[11.5px] font-medium leading-tight ${isEntry ? 'text-ink' : 'text-ink-soft'}`}>
        {data.label}
      </p>

      {data.publishedYear && <p className="tnum mt-0.5 text-center text-[10.5px] text-ink-faint">{data.publishedYear}</p>}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}
