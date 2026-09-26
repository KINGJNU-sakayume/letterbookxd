-- Public reading, single-owner writing.
-- Only the Supabase Auth user below may mutate application data.
-- Owner UID: d004d5f7-5e75-4336-b33c-ca4b2d39f99e

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
    execute format('drop policy if exists "owner write" on public.%I', t);
    execute format('create policy "public read" on public.%I for select using (true)', t);
    execute format(
      'create policy "owner write" on public.%I for all to authenticated using (auth.uid() = %L::uuid) with check (auth.uid() = %L::uuid)',
      t,
      'd004d5f7-5e75-4336-b33c-ca4b2d39f99e',
      'd004d5f7-5e75-4336-b33c-ca4b2d39f99e'
    );
  end loop;
end $$;

drop policy if exists "public read" on public.logs;
drop policy if exists "owner insert" on public.logs;
drop policy if exists "owner update" on public.logs;
drop policy if exists "owner delete" on public.logs;

create policy "public read" on public.logs for select using (true);

create policy "owner insert" on public.logs
  for insert to authenticated
  with check (
    auth.uid() = 'd004d5f7-5e75-4336-b33c-ca4b2d39f99e'::uuid
    and user_id = 'd004d5f7-5e75-4336-b33c-ca4b2d39f99e'::uuid
  );

create policy "owner update" on public.logs
  for update to authenticated
  using (
    auth.uid() = 'd004d5f7-5e75-4336-b33c-ca4b2d39f99e'::uuid
    and user_id = 'd004d5f7-5e75-4336-b33c-ca4b2d39f99e'::uuid
  )
  with check (
    auth.uid() = 'd004d5f7-5e75-4336-b33c-ca4b2d39f99e'::uuid
    and user_id = 'd004d5f7-5e75-4336-b33c-ca4b2d39f99e'::uuid
  );

create policy "owner delete" on public.logs
  for delete to authenticated
  using (
    auth.uid() = 'd004d5f7-5e75-4336-b33c-ca4b2d39f99e'::uuid
    and user_id = 'd004d5f7-5e75-4336-b33c-ca4b2d39f99e'::uuid
  );
