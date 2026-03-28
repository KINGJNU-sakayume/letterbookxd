import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BookText, MapPin } from 'lucide-react';

export function AuthorPage() {
  const { name } = useParams();
  const [author, setAuthor] = useState<any>(null);
  const [works, setWorks] = useState<any[]>([]);

  useEffect(() => {
    async function fetchAuthorData() {
      if (!name) return;

      try {
        // 1. 작가 정보 가져오기
        const { data: authorData } = await supabase
          .from('authors')
          .select('*')
          .eq('name', name)
          .maybeSingle();
        setAuthor(authorData);

        // 2. 작품 목록 가져오기
        const { data: worksData, error } = await supabase
          .from('works')
          .select(`
            id,
            title,
            published_year,
            representative_edition_id,
            editions!work_id (
              id,
              cover_url,
              publisher
            )
          `)
          .eq('author', name)
          .order('published_year', { ascending: true });

        if (error) {
          console.error("데이터 로드 에러 상세:", error);
          return;
        }

        // 3. 표지 결정 로직
        const processedWorks = worksData?.map(work => {
          const editions = (work.editions as any[]) || [];
          const repEdition = editions.find(e => e.id === work.representative_edition_id);
          const displayCover = 
            repEdition?.cover_url || 
            editions[0]?.cover_url || 
            '';

          return {
            ...work,
            display_cover: displayCover
          };
        });

        setWorks(processedWorks || []);
      } catch (err) {
        console.error("처리 중 에러:", err);
      }
    }
    fetchAuthorData();
  }, [name]);

  if (!author) return <div className="p-10 text-center text-stone-500 font-serif">작가 정보를 불러오는 중...</div>;

  return (
    <main className="max-w-5xl mx-auto px-4 py-12">
      {/* 상단 Hero 영역 */}
      <div className="flex flex-col md:flex-row gap-10 mb-16">
        <div className="w-48 h-64 bg-stone-200 rounded-lg overflow-hidden shadow-lg shrink-0">
          <img src={author.photo_url} alt={author.name} className="w-full h-full object-cover" />
        </div>
        <div className="flex-1">
          <h1 className="text-4xl font-bold text-stone-900 mb-2">{author.name}</h1>
          <p className="text-xl text-stone-500 mb-4 font-serif">{author.birth_death}</p>
          
          <div className="flex items-center gap-4 text-sm text-stone-400 mb-6">
            <span className="flex items-center gap-1">
              <BookText size={16}/> 등록 작품 {works.length}개
            </span>
          </div>

          {/* [수정사항 1] 국적 표시 스타일 변경: 검정 배경 + 흰색 글씨 */}
          <div className="flex flex-wrap gap-2 mb-8">
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-stone-800 text-white text-[11px] font-bold rounded uppercase tracking-wider shadow-sm">
              <MapPin size={11} className="text-stone-300"/> {author.country}
            </span>

            {author.awards && author.awards.map((award: string, index: number) => (
    <span 
      key={index}
      className="px-2 py-0.5 border border-stone-200 bg-white text-stone-600 text-[11px] font-medium rounded hover:border-stone-400 transition-colors shadow-sm"
    >
      {award}
    </span>
  ))}
</div>

          <p className="text-stone-700 leading-relaxed text-lg break-keep max-w-2xl font-serif">
            {author.bio}
          </p>
        </div>
      </div>

      <hr className="border-stone-100 mb-12" />

      {/* 하단: 작품 리스트 */}
      <section>
        {/* [수정사항 2] 타이틀 한글화: 등록된 작품 */}
        <h2 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-8">등록된 작품</h2>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {works.map((work) => (
            <Link key={work.id} to={`/book/${work.id}`} className="group cursor-pointer">
              <div className="aspect-[2/3] bg-stone-100 rounded-md overflow-hidden mb-3 shadow-sm group-hover:shadow-md transition-all group-hover:-translate-y-1">
                <img 
                  src={work.display_cover} 
                  alt={work.title} 
                  className="w-full h-full object-cover transition-transform group-hover:scale-105" 
                />
              </div>
              <h3 className="text-[13px] font-bold text-stone-800 line-clamp-1 group-hover:text-stone-600">
                {work.title}
              </h3>
              <p className="text-[11px] text-stone-400 font-serif">
                {work.published_year}년
              </p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}