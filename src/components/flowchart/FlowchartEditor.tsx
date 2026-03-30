import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  type Connection,
  type NodeTypes,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Loader2, Save, RotateCcw, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchFlowchartByAuthor, upsertFlowchart } from '../../services/db';
import type { FlowchartNode, FlowchartEdge, FlowchartNodeType } from '../../types';
import { FlowchartEditorNode } from './FlowchartEditorNode';

// Module-scope nodeTypes — never inside component
const nodeTypes: NodeTypes = {
  entry: FlowchartEditorNode as unknown as NodeTypes[string],
  main:  FlowchartEditorNode as unknown as NodeTypes[string],
  side:  FlowchartEditorNode as unknown as NodeTypes[string],
};

interface AuthorWork {
  id: string;
  title: string;
  published_year: number | null;
}

interface StatusMsg {
  type: 'success' | 'error';
  text: string;
}

interface ContextMenu {
  x: number;
  y: number;
  nodeId: string;
}

export function FlowchartEditor() {
  const [authors, setAuthors] = useState<string[]>([]);
  const [selectedAuthor, setSelectedAuthor] = useState('');
  const [authorWorks, setAuthorWorks] = useState<AuthorWork[]>([]);
  const [loadingAuthors, setLoadingAuthors] = useState(true);
  const [loadingWorks, setLoadingWorks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<StatusMsg | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowchartNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowchartEdge>([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Load unique authors on mount
  useEffect(() => {
    async function loadAuthors() {
      const { data } = await supabase
        .from('works')
        .select('author')
        .order('author');
      if (data) {
        const unique = Array.from(new Set(data.map(r => r.author as string)));
        setAuthors(unique);
      }
      setLoadingAuthors(false);
    }
    loadAuthors();
  }, []);

  // Load flowchart + works when author changes
  useEffect(() => {
    if (!selectedAuthor) {
      setNodes([]);
      setEdges([]);
      setAuthorWorks([]);
      return;
    }

    async function loadForAuthor() {
      setLoadingWorks(true);
      setStatus(null);
      try {
        const [fc, worksRes] = await Promise.all([
          fetchFlowchartByAuthor(selectedAuthor),
          supabase
            .from('works')
            .select('id, title, published_year')
            .eq('author', selectedAuthor)
            .order('published_year', { ascending: true }),
        ]);

        setNodes(fc?.nodes ?? []);
        setEdges(fc?.edges ?? []);
        setAuthorWorks((worksRes.data ?? []) as AuthorWork[]);
      } catch (err) {
        setStatus({ type: 'error', text: err instanceof Error ? err.message : '데이터 로드 실패' });
      } finally {
        setLoadingWorks(false);
      }
    }
    loadForAuthor();
  }, [selectedAuthor, setNodes, setEdges]);

  const onConnect = useCallback(
    (conn: Connection) => setEdges(eds => addEdge({ ...conn, animated: false }, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const workId = e.dataTransfer.getData('workId');
      const label = e.dataTransfer.getData('label');
      if (!workId) return;

      // Check if this work is already on canvas
      if (nodes.some(n => n.data.workId === workId)) {
        setStatus({ type: 'error', text: '이미 캔버스에 있는 작품입니다.' });
        return;
      }

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const newNode: FlowchartNode = {
        id: `node-${Date.now()}`,
        type: 'main',
        position,
        data: { workId, label },
      };
      setNodes(nds => [...nds, newNode]);
    },
    [nodes, screenToFlowPosition, setNodes]
  );

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
  }, []);

  const changeNodeType = useCallback((nodeId: string, newType: FlowchartNodeType) => {
    setNodes(nds =>
      nds.map(n =>
        n.id === nodeId
          ? { ...n, type: newType }
          : // If setting entry, demote previous entry to main
          newType === 'entry' && n.type === 'entry'
          ? { ...n, type: 'main' as FlowchartNodeType }
          : n
      )
    );
    setContextMenu(null);
  }, [setNodes]);

  async function handleSave() {
    if (!selectedAuthor) return;
    setSaving(true);
    setStatus(null);
    try {
      await upsertFlowchart(selectedAuthor, nodes, edges);
      setStatus({ type: 'success', text: '플로우차트가 저장되었습니다.' });
    } catch (err) {
      setStatus({ type: 'error', text: err instanceof Error ? err.message : '저장 실패' });
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setNodes([]);
    setEdges([]);
    setStatus(null);
  }

  return (
    <div className="flex flex-col h-[640px]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-200 bg-stone-50 flex-wrap">
        {loadingAuthors ? (
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Loader2 size={14} className="animate-spin" /> 작가 목록 로딩 중...
          </div>
        ) : (
          <select
            value={selectedAuthor}
            onChange={e => setSelectedAuthor(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-stone-300 bg-white text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400 max-w-[220px]"
          >
            <option value="">작가 선택...</option>
            {authors.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={handleReset}
            disabled={!selectedAuthor || (nodes.length === 0 && edges.length === 0)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-stone-600 border border-stone-300 rounded-lg hover:bg-stone-100 disabled:opacity-40 transition-colors"
          >
            <RotateCcw size={13} /> 초기화
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedAuthor || saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            저장
          </button>
        </div>

        {status && (
          <div className={`flex items-center gap-1.5 text-sm px-3 py-1 rounded-lg w-full sm:w-auto ${
            status.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {status.type === 'success'
              ? <CheckCircle2 size={13} />
              : <AlertCircle size={13} />}
            {status.text}
          </div>
        )}
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: works list */}
        <div className="w-56 border-r border-stone-200 flex flex-col bg-stone-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-stone-200">
            <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
              작품 목록
            </p>
            <p className="text-[10px] text-stone-400 mt-0.5">드래그하여 캔버스에 추가</p>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loadingWorks ? (
              <div className="flex items-center gap-2 text-xs text-stone-400 p-2">
                <Loader2 size={12} className="animate-spin" /> 불러오는 중...
              </div>
            ) : !selectedAuthor ? (
              <p className="text-xs text-stone-400 p-2">작가를 선택하세요.</p>
            ) : authorWorks.length === 0 ? (
              <p className="text-xs text-stone-400 p-2">등록된 작품이 없습니다.</p>
            ) : (
              authorWorks.map(work => {
                const onCanvas = nodes.some(n => n.data.workId === work.id);
                return (
                  <div
                    key={work.id}
                    draggable={!onCanvas}
                    onDragStart={e => {
                      e.dataTransfer.setData('workId', work.id);
                      e.dataTransfer.setData('label', work.title);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    className={`px-2.5 py-2 rounded-lg text-[12px] border transition-colors select-none ${
                      onCanvas
                        ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-default'
                        : 'bg-white text-stone-700 border-stone-200 cursor-grab hover:border-stone-400 hover:bg-stone-50 active:cursor-grabbing'
                    }`}
                  >
                    <p className="font-medium line-clamp-1">{work.title}</p>
                    {work.published_year && (
                      <p className="text-[10px] text-stone-400 mt-0.5">{work.published_year}년</p>
                    )}
                    {onCanvas && (
                      <p className="text-[10px] text-stone-400 mt-0.5">✓ 추가됨</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative" ref={reactFlowWrapper}>
          {!selectedAuthor && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <p className="text-stone-400 text-sm font-serif">작가를 선택하면 편집을 시작할 수 있습니다.</p>
            </div>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeContextMenu={onNodeContextMenu}
            onClick={() => setContextMenu(null)}
            nodeTypes={nodeTypes}
            fitView={nodes.length > 0}
            deleteKeyCode="Delete"
          >
            <Controls />
            <Background color="#e7e5e4" gap={20} size={1} />
          </ReactFlow>

          {/* Context menu */}
          {contextMenu && (
            <div
              className="absolute z-50 bg-white border border-stone-200 rounded-lg shadow-xl py-1 min-w-[120px]"
              style={{ left: contextMenu.x - (reactFlowWrapper.current?.getBoundingClientRect().left ?? 0), top: contextMenu.y - (reactFlowWrapper.current?.getBoundingClientRect().top ?? 0) }}
            >
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider px-3 pt-1 pb-1.5">노드 타입</p>
              {(['entry', 'main', 'side'] as FlowchartNodeType[]).map(t => {
                const labels = { entry: '★ 입문 (entry)', main: '일반 (main)', side: '참고 (side)' };
                return (
                  <button
                    key={t}
                    onClick={() => changeNodeType(contextMenu.nodeId, t)}
                    className="w-full text-left px-3 py-1.5 text-[12px] text-stone-700 hover:bg-stone-50 transition-colors"
                  >
                    {labels[t]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Usage hint */}
      <div className="px-4 py-2 bg-stone-50 border-t border-stone-100 text-[10px] text-stone-400 flex gap-4 flex-wrap">
        <span>🖱 노드 우클릭 → 타입 변경</span>
        <span>🔗 노드 하단 핸들 드래그 → 연결</span>
        <span>🗑 노드 선택 후 Delete → 삭제</span>
      </div>
    </div>
  );
}
