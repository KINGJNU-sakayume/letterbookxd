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
      className={`relative ${isSide ? 'opacity-70' : ''} ${selected ? 'rounded-[3px] ring-2 ring-ink-soft ring-offset-2 ring-offset-paper' : ''}`}
      style={{ width: 110 }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      {/* Cover image */}
      <div className="book-cover relative aspect-[2/3] w-full">
        {data.coverImageUrl ? (
          <img
            src={data.coverImageUrl as string}
            alt={data.label as string}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#5b4f45] px-2">
            <span className="text-center font-serif text-[11px] font-bold leading-snug text-[#f3ebdb]">{data.label as string}</span>
          </div>
        )}

        {/* Entry banner */}
        {isEntry && (
          <div className="absolute inset-x-0 bottom-0 z-[2] bg-seal/95 py-1 text-center text-[10px] font-bold tracking-wide text-paper-raised">
            입문 추천
          </div>
        )}
      </div>

      {/* Title */}
      <p className={`mt-2 line-clamp-2 px-0.5 text-center text-[11.5px] font-medium leading-tight ${
        isEntry ? 'text-ink' : 'text-ink-soft'
      }`}>
        {data.label as string}
      </p>

      {/* Year */}
      {data.publishedYear && (
        <p className="tnum mt-0.5 text-center text-[10.5px] text-ink-faint">{data.publishedYear as number}</p>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}
