import { useState, useCallback } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react';

export function FlowchartEditorEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  label,
}: EdgeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const { setEdges } = useReactFlow();

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 0,
  });

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue((label as string) ?? '');
    setIsEditing(true);
  }, [label]);

  const handleConfirm = useCallback(() => {
    setEdges(edges =>
      edges.map(e =>
        e.id === id ? { ...e, label: editValue.trim() || undefined } : e
      )
    );
    setIsEditing(false);
  }, [id, editValue, setEdges]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
    }
  }, [handleConfirm]);

  return (
    <>
      {/* Wide transparent hit area for double-click */}
      <path
        d={edgePath}
        strokeWidth={20}
        stroke="transparent"
        fill="none"
        className="pointer-events-all cursor-pointer"
        onDoubleClick={handleDoubleClick}
      />
      <BaseEdge path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="absolute nodrag nopan"
        >
          {isEditing ? (
            <input
              autoFocus
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={handleConfirm}
              onKeyDown={handleKeyDown}
              placeholder="설명"
              className="w-28 rounded-[4px] border border-line-strong bg-paper-raised px-1.5 py-0.5 text-[11px] text-ink shadow-sm outline-none focus:border-ink focus:ring-1 focus:ring-ink"
            />
          ) : label ? (
            <span
              className="cursor-pointer rounded-[4px] border border-line bg-paper-raised/95 px-1.5 py-0.5 text-[11px] italic text-ink-muted shadow-sm transition-colors hover:bg-paper"
              onDoubleClick={handleDoubleClick}
            >
              {label as string}
            </span>
          ) : (
            /* Invisible hit area when no label — double-click to add */
            <div
              className="w-8 h-4 rounded cursor-pointer"
              onDoubleClick={handleDoubleClick}
            />
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
