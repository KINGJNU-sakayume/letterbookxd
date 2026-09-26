-- Public reading, authenticated-owner writing.
-- Assumption: the repository is a single-owner public reading site and only the owner is invited to Supabase Auth.

alter table public.works enable row level security;
alter table public.editions enable row level security;
alter table public.authors enable row level security;
alter table public.series enable row level security;
alter table public.author_flowcharts enable row level security;
alter table public.logs enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['works','editions','authors','series','author_flowcharts']
  loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('drop policy if exists "authenticated write" on public.%I', t);
    execute format('create policy "public read" on public.%I for select using (true)', t);
    execute format('create policy "authenticated write" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

drop policy if exists "public read" on public.logs;
drop policy if exists "owner insert" on public.logs;
drop policy if exists "owner update" on public.logs;
drop policy if exists "owner delete" on public.logs;

create policy "public read" on public.logs for select using (true);
create policy "owner insert" on public.logs for insert to authenticated with check (user_id = auth.uid());
create policy "owner update" on public.logs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owner delete" on public.logs for delete to authenticated using (user_id = auth.uid());
