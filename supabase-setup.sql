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
