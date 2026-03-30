import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { FlowchartNodeData, FlowchartNodeType } from '../../types';

const TYPE_STYLES: Record<FlowchartNodeType, string> = {
  entry: 'bg-[#8B1A1A] text-white border-[#6B1414]',
  main:  'bg-white text-stone-800 border-stone-300',
  side:  'bg-stone-50 text-stone-400 border-stone-200',
};

const TYPE_LABELS: Record<FlowchartNodeType, string> = {
  entry: '입문',
  main:  '일반',
  side:  '참고',
};

// Full node type used as the NodeProps generic
type FlowchartEditorNodeType = Node<FlowchartNodeData>;

export function FlowchartEditorNode({ data, type, selected }: NodeProps<FlowchartEditorNodeType>) {
  const nodeType = (type as FlowchartNodeType) ?? 'main';
  const typeStyle = TYPE_STYLES[nodeType] ?? TYPE_STYLES.main;

  return (
    <div
      className={`px-3 py-2 rounded-lg text-sm border shadow-sm min-w-[120px] max-w-[180px] transition-shadow ${typeStyle} ${
        selected ? 'ring-2 ring-stone-500 ring-offset-1 shadow-md' : ''
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-stone-400 !border-white"
      />

      <div className="flex items-start justify-between gap-1">
        <span className="text-[12px] font-medium leading-snug line-clamp-2 flex-1">
          {data.label}
        </span>
        <span
          className={`text-[9px] font-bold shrink-0 mt-0.5 px-1 py-0.5 rounded ${
            nodeType === 'entry'
              ? 'bg-white/20 text-white/80'
              : 'bg-stone-100 text-stone-400'
          }`}
        >
          {TYPE_LABELS[nodeType]}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-stone-400 !border-white"
      />
    </div>
  );
}
