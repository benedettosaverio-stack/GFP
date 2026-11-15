-- GFP — comptes (courant, épargne, joint) : à lancer après 001_depenses.sql
create table if not exists public.ff_accounts (
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  key        text not null,                     -- identifiant stocké dans ff_transactions.account
  label      text not null,                     -- nom affiché
  kind       text not null default 'courant' check (kind in ('courant', 'epargne', 'joint')),
  share      numeric(4, 3) not null default 1 check (share > 0 and share <= 1), -- ta part (compte joint)
  detected   text,                              -- compte détecté dans le relevé, pour le reconnaître au prochain import
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.ff_accounts enable row level security;
drop policy if exists "ff_accounts_own" on public.ff_accounts;
create policy "ff_accounts_own" on public.ff_accounts
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
