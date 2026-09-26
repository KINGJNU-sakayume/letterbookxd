import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PenTool, BookOpen, Library, Layers, GitBranch, LogOut, Database, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ReactFlowProvider } from '@xyflow/react';
import { FlowchartEditor } from '../components/flowchart';
import { QuickAddBook } from '../features/admin/QuickAddBook';
import { AuthorForm, EditionForm, SeriesForm, WorkForm } from '../features/admin/CatalogForms';
import { CatalogManager } from '../features/admin/CatalogManager';

type Tab = 'quick' | 'manage' | 'work' | 'edition' | 'author' | 'series' | 'flowchart';

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('quick');
  const navigate = useNavigate();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/admin/login', { replace: true });
  }

  return (
    <main className="min-h-[calc(100vh-56px)] bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-stone-900 mb-1">관리자 큐레이션</h1>
            <p className="text-sm text-stone-500">작품, 판본, 작가 및 시리즈 데이터를 직접 관리합니다.</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-stone-500 border border-stone-200 rounded-lg hover:text-stone-800 hover:border-stone-400"
          >
            <LogOut size={14} /> 로그아웃
          </button>
        </div>
        <div className="flex gap-1 mb-6 border-b border-stone-200 overflow-x-auto hide-scrollbar">
          <TabBtn active={tab === 'quick'} onClick={() => setTab('quick')} icon={<Zap size={15} />} label="빠른 등록" />
          <TabBtn active={tab === 'manage'} onClick={() => setTab('manage')} icon={<Database size={15} />} label="데이터 관리" />
          <TabBtn active={tab === 'work'} onClick={() => setTab('work')} icon={<BookOpen size={15} />} label="작품 추가" />
          <TabBtn active={tab === 'edition'} onClick={() => setTab('edition')} icon={<Library size={15} />} label="판본 추가" />
          <TabBtn active={tab === 'author'} onClick={() => setTab('author')} icon={<PenTool size={15} />} label="작가 추가" />
          <TabBtn active={tab === 'series'} onClick={() => setTab('series')} icon={<Layers size={15} />} label="시리즈 추가" />
          <TabBtn active={tab === 'flowchart'} onClick={() => setTab('flowchart')} icon={<GitBranch size={15} />} label="플로우차트 편집" />
        </div>
        <div className={`bg-white rounded-xl border border-stone-200 shadow-sm ${tab === 'flowchart' ? 'p-0 overflow-hidden' : 'p-6'}`}>
          {tab === 'quick' ? <QuickAddBook />
           : tab === 'manage' ? <CatalogManager />
           : tab === 'work' ? <WorkForm />
           : tab === 'edition' ? <EditionForm />
           : tab === 'author' ? <AuthorForm />
           : tab === 'series' ? <SeriesForm />
           : <FlowchartEditorWrapper />}
        </div>
      </div>
    </main>
  );
}

function FlowchartEditorWrapper() {
  return (
    <ReactFlowProvider>
      <FlowchartEditor />
    </ReactFlowProvider>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
        active ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-500 hover:text-stone-700'
      }`}
    >
      {icon}{label}
    </button>
  );
}
