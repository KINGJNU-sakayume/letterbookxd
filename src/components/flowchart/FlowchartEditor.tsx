import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  type EdgeTypes,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Loader2, Save, RotateCcw, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchFlowchartByAuthor, upsertFlowchart } from '../../services/db';
import type { FlowchartNode, FlowchartEdge, FlowchartNodeType } from '../../types';
import { FlowchartEditorBookNode } from './FlowchartEditorBookNode';
import { FlowchartEditorEdge } from './FlowchartEditorEdge';

// Module-scope nodeTypes and edgeTypes — never inside component
const nodeTypes: NodeTypes = {
  entry: FlowchartEditorBookNode as unknown as NodeTypes[string],
  main:  FlowchartEditorBookNode as unknown as NodeTypes[string],
  side:  FlowchartEditorBookNode as unknown as NodeTypes[string],
};

const edgeTypes: EdgeTypes = {
  step: FlowchartEditorEdge as unknown as EdgeTypes[string],
};

interface AuthorWork {
  id: string;
  title: string;
  published_year: number | null;
  representative_cover_url?: string;
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
            .select('id, title, published_year, representative_cover_url')
            .eq('author', selectedAuthor)
            .order('published_year', { ascending: true }),
        ]);

        setNodes(fc?.nodes ?? []);
        setEdges(fc?.edges ?? []);
        if (worksRes.error) throw worksRes.error;
        setAuthorWorks((worksRes.data ?? []) as AuthorWork[]);
      } catch (err) {
        setStatus({ type: 'error', text: err instanceof Error ? err.message : '데이터 로드 실패' });
      } finally {
        setLoadingWorks(false);
      }
    }
    loadForAuthor();
  }, [selectedAuthor, setNodes, setEdges]);

  const enrichedNodes = useMemo(() =>
    nodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        coverImageUrl: authorWorks.find(w => w.id === n.data.workId)?.representative_cover_url ?? '',
        publishedYear: authorWorks.find(w => w.id === n.data.workId)?.published_year ?? undefined,
      },
    })),
    [nodes, authorWorks]
  );

  const onConnect = useCallback(
    (conn: Connection) => setEdges(eds => addEdge({ ...conn, animated: false, type: 'step' }, eds)),
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
    <div className="flex h-[calc(100vh-380px)] min-h-[560px] flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-paper px-4 py-3">
        {loadingAuthors ? (
          <div className="flex items-center gap-2 text-[14px] text-ink-muted">
            <Loader2 size={14} className="animate-spin" /> 작가 목록을 불러오는 중
          </div>
        ) : (
          <select
            value={selectedAuthor}
            onChange={e => setSelectedAuthor(e.target.value)}
            aria-label="작가"
            className="field-select h-9 w-auto max-w-[240px] py-0 text-[14px]"
          >
            <option value="">작가를 고르세요</option>
            {authors.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleReset}
            disabled={!selectedAuthor || (nodes.length === 0 && edges.length === 0)}
            className="btn btn-secondary btn-sm"
          >
            <RotateCcw size={13} /> 비우기
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedAuthor || saving}
            className="btn btn-primary btn-sm"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            저장
          </button>
        </div>

        {status && (
          <div className={`flex w-full items-center gap-1.5 rounded-[5px] border px-3 py-1 text-[13.5px] sm:w-auto ${
            status.type === 'success'
              ? 'border-completed-border bg-completed-light text-completed-dark'
              : 'border-seal/25 bg-seal-soft text-seal-dark'
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
        <div className="flex w-60 flex-col overflow-hidden border-r border-line bg-paper">
          <div className="border-b border-line px-3 py-2.5">
            <p className="text-[13px] font-semibold text-ink-soft">작품</p>
            <p className="mt-0.5 text-[12px] text-ink-muted">캔버스로 끌어다 놓으세요</p>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loadingWorks ? (
              <div className="flex items-center gap-2 p-2 text-[12.5px] text-ink-muted">
                <Loader2 size={12} className="animate-spin" /> 불러오는 중
              </div>
            ) : !selectedAuthor ? (
              <p className="p-2 text-[12.5px] text-ink-muted">먼저 작가를 고르세요.</p>
            ) : authorWorks.length === 0 ? (
              <p className="p-2 text-[12.5px] text-ink-muted">등록된 작품이 없습니다.</p>
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
                    className={`select-none rounded-[5px] border px-2.5 py-2 text-[13px] transition-colors ${
                      onCanvas
                        ? 'cursor-default border-line-soft bg-paper-sunken text-ink-faint'
                        : 'cursor-grab border-line bg-paper-raised text-ink-soft hover:border-line-strong active:cursor-grabbing'
                    }`}
                  >
                    <p className="line-clamp-1 font-medium">{work.title}</p>
                    <p className="mt-0.5 text-[11.5px] text-ink-faint">
                      {work.published_year ? `${work.published_year}년` : ''}
                      {onCanvas && `${work.published_year ? ' · ' : ''}캔버스에 있음`}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative" ref={reactFlowWrapper}>
          {!selectedAuthor && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <p className="font-serif text-[15px] text-ink-muted">작가를 고르면 읽기 순서를 그릴 수 있습니다.</p>
            </div>
          )}
          <ReactFlow
            nodes={enrichedNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeContextMenu={onNodeContextMenu}
            onClick={() => setContextMenu(null)}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{ type: 'step' }}
            fitView={nodes.length > 0}
            fitViewOptions={{ padding: 0.3 }}
            deleteKeyCode="Delete"
          >
            <Controls />
            <Background color="#ddd5c6" gap={22} size={1} />
          </ReactFlow>

          {/* Context menu */}
          {contextMenu && (
            <div
              className="panel absolute z-50 min-w-[140px] py-1 shadow-pop"
              style={{ left: contextMenu.x - (reactFlowWrapper.current?.getBoundingClientRect().left ?? 0), top: contextMenu.y - (reactFlowWrapper.current?.getBoundingClientRect().top ?? 0) }}
            >
              <p className="px-3 pb-1.5 pt-1 text-[12px] font-medium text-ink-faint">이 책은</p>
              {(['entry', 'main', 'side'] as FlowchartNodeType[]).map(t => {
                const labels = { entry: '입문 추천', main: '본줄기', side: '곁가지' };
                return (
                  <button
                    key={t}
                    onClick={() => changeNodeType(contextMenu.nodeId, t)}
                    className="w-full px-3 py-1.5 text-left text-[13px] text-ink-soft transition-colors hover:bg-paper-sunken"
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
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line bg-paper px-4 py-2.5 text-[12px] text-ink-muted">
        <span>책을 오른쪽 클릭 — 입문·본줄기·곁가지 바꾸기</span>
        <span>아래쪽 가장자리에서 끌기 — 다음 책과 잇기</span>
        <span>선택 후 <kbd className="kbd">Delete</kbd> — 지우기</span>
        <span>선을 두 번 클릭 — 설명 붙이기</span>
      </div>
    </div>
  );
}
