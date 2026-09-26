create extension if not exists pgcrypto;

create table if not exists public.edition_sets (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  publisher text not null,
  created_at timestamptz not null default now(),
  unique (work_id, publisher)
);

alter table public.edition_sets enable row level security;
drop policy if exists "Public can read edition sets" on public.edition_sets;
create policy "Public can read edition sets" on public.edition_sets for select to anon, authenticated using (true);
drop policy if exists "Authenticated can insert edition sets" on public.edition_sets;
create policy "Authenticated can insert edition sets" on public.edition_sets for insert to authenticated with check ((select auth.uid()) is not null);
drop policy if exists "Authenticated can update edition sets" on public.edition_sets;
create policy "Authenticated can update edition sets" on public.edition_sets for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
drop policy if exists "Authenticated can delete edition sets" on public.edition_sets;
create policy "Authenticated can delete edition sets" on public.edition_sets for delete to authenticated using ((select auth.uid()) is not null);

insert into public.edition_sets (work_id, publisher)
select distinct work_id, publisher
from public.editions
where work_id is not null and publisher is not null
on conflict (work_id, publisher) do nothing;

alter table public.editions add column if not exists edition_set_id uuid references public.edition_sets(id) on delete cascade;
update public.editions e
set edition_set_id = es.id
from public.edition_sets es
where e.edition_set_id is null
  and es.work_id = e.work_id
  and es.publisher = e.publisher;

alter table public.works add column if not exists author_id uuid references public.authors(id) on delete set null;
update public.works w
set author_id = a.id
from public.authors a
where w.author_id is null
  and lower(trim(w.author)) = lower(trim(a.name));

alter table public.series add column if not exists author_id uuid references public.authors(id) on delete set null;
update public.series s
set author_id = a.id
from public.authors a
where s.author_id is null
  and lower(trim(s.author)) = lower(trim(a.name));

alter table public.logs add column if not exists edition_set_uuid uuid references public.edition_sets(id) on delete set null;
update public.logs l
set edition_set_uuid = es.id
from public.edition_sets es
where l.edition_set_uuid is null
  and l.work_id = es.work_id
  and split_part(coalesce(l.edition_set_id, ''), '::', 2) = es.publisher;

create index if not exists idx_editions_edition_set_id on public.editions(edition_set_id);
create index if not exists idx_works_author_id on public.works(author_id);
create index if not exists idx_series_author_id on public.series(author_id);
create index if not exists idx_logs_edition_set_uuid on public.logs(edition_set_uuid);
