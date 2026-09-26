-- Single-owner public library policy.
-- Public visitors can read catalogue/reading data. Only authenticated sessions can
-- mutate catalogue tables. Disable public Auth sign-ups in the Supabase dashboard.

alter table if exists public.works enable row level security;
alter table if exists public.editions enable row level security;
alter table if exists public.authors enable row level security;
alter table if exists public.series enable row level security;
alter table if exists public.author_flowcharts enable row level security;
alter table if exists public.logs enable row level security;

drop policy if exists "Public can read works" on public.works;
create policy "Public can read works" on public.works for select to anon, authenticated using (true);
drop policy if exists "Authenticated can insert works" on public.works;
create policy "Authenticated can insert works" on public.works for insert to authenticated with check ((select auth.uid()) is not null);
drop policy if exists "Authenticated can update works" on public.works;
create policy "Authenticated can update works" on public.works for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
drop policy if exists "Authenticated can delete works" on public.works;
create policy "Authenticated can delete works" on public.works for delete to authenticated using ((select auth.uid()) is not null);

drop policy if exists "Public can read editions" on public.editions;
create policy "Public can read editions" on public.editions for select to anon, authenticated using (true);
drop policy if exists "Authenticated can insert editions" on public.editions;
create policy "Authenticated can insert editions" on public.editions for insert to authenticated with check ((select auth.uid()) is not null);
drop policy if exists "Authenticated can update editions" on public.editions;
create policy "Authenticated can update editions" on public.editions for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
drop policy if exists "Authenticated can delete editions" on public.editions;
create policy "Authenticated can delete editions" on public.editions for delete to authenticated using ((select auth.uid()) is not null);

drop policy if exists "Public can read authors" on public.authors;
create policy "Public can read authors" on public.authors for select to anon, authenticated using (true);
drop policy if exists "Authenticated can insert authors" on public.authors;
create policy "Authenticated can insert authors" on public.authors for insert to authenticated with check ((select auth.uid()) is not null);
drop policy if exists "Authenticated can update authors" on public.authors;
create policy "Authenticated can update authors" on public.authors for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
drop policy if exists "Authenticated can delete authors" on public.authors;
create policy "Authenticated can delete authors" on public.authors for delete to authenticated using ((select auth.uid()) is not null);

drop policy if exists "Public can read series" on public.series;
create policy "Public can read series" on public.series for select to anon, authenticated using (true);
drop policy if exists "Authenticated can insert series" on public.series;
create policy "Authenticated can insert series" on public.series for insert to authenticated with check ((select auth.uid()) is not null);
drop policy if exists "Authenticated can update series" on public.series;
create policy "Authenticated can update series" on public.series for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
drop policy if exists "Authenticated can delete series" on public.series;
create policy "Authenticated can delete series" on public.series for delete to authenticated using ((select auth.uid()) is not null);

drop policy if exists "Public can read flowcharts" on public.author_flowcharts;
create policy "Public can read flowcharts" on public.author_flowcharts for select to anon, authenticated using (true);
drop policy if exists "Authenticated can insert flowcharts" on public.author_flowcharts;
create policy "Authenticated can insert flowcharts" on public.author_flowcharts for insert to authenticated with check ((select auth.uid()) is not null);
drop policy if exists "Authenticated can update flowcharts" on public.author_flowcharts;
create policy "Authenticated can update flowcharts" on public.author_flowcharts for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
drop policy if exists "Authenticated can delete flowcharts" on public.author_flowcharts;
create policy "Authenticated can delete flowcharts" on public.author_flowcharts for delete to authenticated using ((select auth.uid()) is not null);

drop policy if exists "Public can read logs" on public.logs;
create policy "Public can read logs" on public.logs for select to anon, authenticated using (true);
drop policy if exists "Owner can insert logs" on public.logs;
create policy "Owner can insert logs" on public.logs for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Owner can update logs" on public.logs;
create policy "Owner can update logs" on public.logs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Owner can delete logs" on public.logs;
create policy "Owner can delete logs" on public.logs for delete to authenticated using ((select auth.uid()) = user_id);
