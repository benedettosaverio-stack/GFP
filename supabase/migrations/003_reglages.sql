-- GFP — réglages personnels (catégories, règles par mot-clé, repères, affichage…) : à lancer après 002_comptes.sql
create table if not exists public.ff_settings (
  user_id    uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.ff_settings enable row level security;
drop policy if exists "ff_settings_own" on public.ff_settings;
create policy "ff_settings_own" on public.ff_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
