-- Run this in your own Supabase project's SQL editor.
-- Authentication must be enabled separately in Supabase and GitHub OAuth.
create table if not exists public.forge_projects (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot text not null default 'main',
  project jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot)
);
alter table public.forge_projects enable row level security;
create policy "Owners can read their saves" on public.forge_projects
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners can create their saves" on public.forge_projects
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners can update their saves" on public.forge_projects
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Owners can delete their saves" on public.forge_projects
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Private cloud folder for each Forge account.
-- Every account gets a stable UUID from Supabase Auth; saves live at
-- forge-saves/<auth-user-uuid>/project.json. The folder name is not a secret.
insert into storage.buckets (id, name, public)
values ('forge-saves', 'forge-saves', false)
on conflict (id) do update set public = false;

drop policy if exists "Forge users read only their own save folder" on storage.objects;
create policy "Forge users read only their own save folder"
on storage.objects for select to authenticated
using (bucket_id = 'forge-saves' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Forge users create saves in their own folder" on storage.objects;
create policy "Forge users create saves in their own folder"
on storage.objects for insert to authenticated
with check (bucket_id = 'forge-saves' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Forge users update saves in their own folder" on storage.objects;
create policy "Forge users update saves in their own folder"
on storage.objects for update to authenticated
using (bucket_id = 'forge-saves' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'forge-saves' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Forge users delete saves in their own folder" on storage.objects;
create policy "Forge users delete saves in their own folder"
on storage.objects for delete to authenticated
using (bucket_id = 'forge-saves' and (storage.foldername(name))[1] = (select auth.uid())::text);
