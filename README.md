# GFP — suivi des dépenses sans reporting

Tu importes ton relevé bancaire (PDF ou CSV), l'appli trie tout toute seule et te sort le bilan du mois.

- **Import** : relevé PDF (Allianz Banque et formats « JJ/MM JJ/MM/AAAA libellé montant »), export CSV Revolut, CSV bancaire générique (Date / Libellé / Montant ou Débit + Crédit). Plusieurs fichiers à la fois, glisser-déposer possible.
- **Catégorisation automatique** par mots-clés. Quand tu corriges une catégorie, l'appli l'applique à toutes les opérations du même marchand et **s'en souvient** pour les prochains imports.
- **Virements entre tes comptes** détectés (même montant, sens opposé, ≤ 4 jours, deux comptes différents) : ni rentrée, ni dépense. L'épargne (livret, assurance vie, PER) est comptée une seule fois dans « Mis de côté ».
- **Pas de doublons** : réimporter un relevé ne duplique rien.
- **Budgets mensuels** par catégorie, alertes de dépassement, points à retenir (achats répétés, abonnements annualisés, évolution vs mois précédent).

## Stack

Next.js 16 (App Router, TypeScript) · Supabase (Auth + Postgres avec RLS) · Vercel.
Le PDF est lu côté serveur (`/api/parse-pdf`, pdf.js) et **n'est jamais stocké** : seules les opérations extraites sont enregistrées dans Supabase.

```
app/
  page.tsx                 connexion → tableau de bord
  api/parse-pdf/route.ts   lecture des relevés PDF (utilisateur connecté uniquement)
components/                Dashboard, SummaryCard, CategoryBreakdown, TransactionList, ImportBar, AuthScreen
lib/
  categories.ts            catégories, couleurs, mots-clés
  categorize.ts            règles apprises + mots-clés → catégorie, empreinte anti-doublon
  parse/                   PDF (statement.ts + pdf.ts) et CSV
  transfers.ts             appariement des virements entre comptes
  stats.ts                 totaux du mois et « à retenir »
  db.ts                    accès Supabase
supabase/migrations/       schéma SQL (tables ff_*)
tests/                     tests de la logique métier (npm test)
```

## Mise en route

### 1. Base Supabase
Dans ton projet Supabase → **SQL Editor** → colle le contenu de `supabase/migrations/001_depenses.sql` → **Run**.
Ça crée 3 tables préfixées `ff_` (opérations, règles apprises, budgets), protégées par RLS : chaque utilisateur ne voit que ses données.

### 2. Vercel
**Add New → Project** → importe le dépôt `GFP` → ajoute les variables d'environnement :

| Variable | Valeur |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public key |
| `NEXT_PUBLIC_OWNER_NAMES` | ton nom tel qu'il apparaît sur les virements, ex. `PRENOM NOM,NOM PRENOM` (virements à ton nom = internes) |
| `NEXT_PUBLIC_SALARY_KEYWORDS` | nom de ton employeur sur le relevé (rentrées classées en Salaire) |

Les deux dernières restent hors du code, puisque le dépôt peut être public.

### 3. Connexion
Ouvre l'URL Vercel et connecte-toi avec un compte Supabase existant du projet, ou crée-en un.

## Développement

```bash
cp .env.example .env.local   # puis remplis les valeurs
npm install
npm run dev       # http://localhost:3000
npm test          # tests de la logique (parsing, catégories, virements, doublons)
npm run build
```
