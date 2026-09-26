-- Replace the legacy hard-coded owner with the Auth identity for test@test.com.
-- This migration deliberately follows 20260926_rls.sql rather than rewriting it.
do $$
declare
  legacy_owner constant uuid := 'd004d5f7-5e75-4336-b33c-ca4b2d39f99e';
  auth_owner uuid;
begin
  select id into strict auth_owner
  from auth.users
  where lower(email) = lower('test@test.com');

  -- auth_owner was selected from auth.users before updating the FK-backed column.
  if auth_owner <> legacy_owner then
    update public.logs
    set user_id = auth_owner
    where user_id = legacy_owner;
  end if;

  -- Authorization belongs in immutable app_metadata, never user_metadata.
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', 'admin')
  where id = auth_owner;
exception
  when no_data_found then
    raise exception 'Auth user test@test.com must exist before this migration runs';
  when too_many_rows then
    raise exception 'More than one Auth user has email test@test.com';
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['works', 'editions', 'authors', 'series', 'author_flowcharts']
  loop
    execute format('drop policy if exists "authenticated write" on public.%I', t);
    execute format('drop policy if exists "owner write" on public.%I', t);
    execute format('drop policy if exists "admin write" on public.%I', t);
    execute format(
      'create policy "admin write" on public.%I for all to authenticated using ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'') with check ((auth.jwt() -> ''app_metadata'' ->> ''role'') = ''admin'')',
      t
    );
  end loop;
end $$;

drop policy if exists "public read" on public.logs;
drop policy if exists "owner insert" on public.logs;
drop policy if exists "owner update" on public.logs;
drop policy if exists "owner delete" on public.logs;

create policy "owner select" on public.logs
  for select to authenticated
  using (user_id = auth.uid());

create policy "owner insert" on public.logs
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "owner update" on public.logs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "owner delete" on public.logs
  for delete to authenticated
  using (user_id = auth.uid());
