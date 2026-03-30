import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { FlowchartNodeType } from '../../types';

interface EditorBookNodeData extends Record<string, unknown> {
  workId: string;
  label: string;
  coverImageUrl?: string;
  publishedYear?: number;
}

type EditorBookNode = Node<EditorBookNodeData>;

export function FlowchartEditorBookNode({ data, type, selected }: NodeProps<EditorBookNode>) {
  const isEntry = type === 'entry' as FlowchartNodeType;
  const isSide = type === 'side' as FlowchartNodeType;

  return (
    <div
      className={`relative ${isSide ? 'opacity-75' : ''} ${selected ? 'ring-2 ring-stone-500 ring-offset-1 rounded-md' : ''}`}
      style={{ width: 110 }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      {/* Cover image */}
      <div className="relative aspect-[2/3] w-full rounded-md overflow-hidden shadow-md">
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
