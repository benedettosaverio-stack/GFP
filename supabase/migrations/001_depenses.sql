-- GFP — suivi des dépenses
-- À coller dans Supabase → SQL Editor → Run (une seule fois).
-- Tables préfixées "ff_" pour cohabiter avec les tables existantes du projet.

-- 1. Opérations bancaires ---------------------------------------------------
create table if not exists public.ff_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  fingerprint text not null,                 -- empreinte (date|montant|libellé|compte) pour éviter les doublons
  date        date not null,
  label       text not null,                 -- libellé lisible
  raw         text not null,                 -- libellé brut de la banque
  amount      numeric(12, 2) not null,       -- négatif = sortie, positif = entrée
  category    text not null,
  account     text not null default 'Compte',
  source      text not null default 'Import',
  manual      boolean not null default false, -- catégorie corrigée à la main
  created_at  timestamptz not null default now(),
  unique (user_id, fingerprint)
);
create index if not exists ff_transactions_user_date on public.ff_transactions (user_id, date desc);

-- 2. Règles de catégorisation apprises (marchand → catégorie) ---------------
create table if not exists public.ff_rules (
  user_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  merchant_key text not null,
  category     text not null,
  updated_at   timestamptz not null default now(),
  primary key (user_id, merchant_key)
);

-- 3. Budgets mensuels par catégorie -----------------------------------------
create table if not exists public.ff_budgets (
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  category   text not null,
  amount     numeric(12, 2) not null check (amount > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

-- 4. Sécurité : chacun ne voit et ne modifie que ses propres lignes ---------
alter table public.ff_transactions enable row level security;
alter table public.ff_rules        enable row level security;
alter table public.ff_budgets      enable row level security;

drop policy if exists "ff_transactions_own" on public.ff_transactions;
create policy "ff_transactions_own" on public.ff_transactions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "ff_rules_own" on public.ff_rules;
create policy "ff_rules_own" on public.ff_rules
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "ff_budgets_own" on public.ff_budgets;
create policy "ff_budgets_own" on public.ff_budgets
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
