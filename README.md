# Dimos D3X+ — PO Board

Application de gestion produit pour la profileuse D3X+ : roadmap, sprints, plan de charges, DoD, réunions et pilotage portefeuille.

## Stack

- **React 18** + **TypeScript** + **Tailwind CSS**
- **Supabase** (BDD + Auth, migrations SQL versionnées)
- **React Query** (cache données)
- **React Router** (navigation)
- **Zustand** (state auth)
- **Vitest** + Testing Library (tests)
- **Cloudflare Pages** (déploiement)

## Installation locale

```bash
# 1. Cloner le repo
git clone https://github.com/jrddimos/DimosPOBoard.git
cd DimosPOBoard

# 2. Installer les dépendances
npm install

# 3. Copier le fichier d'environnement
cp .env.example .env

# 4. Remplir le .env avec tes clés Supabase
# VITE_SUPABASE_URL=https://pnbggstjuvgesmdowppa.supabase.co
# VITE_SUPABASE_ANON_KEY=ta_clé_anon_ici

# 5. Lancer en développement
npm run dev
```

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | Serveur de développement Vite |
| `npm run build` | Build de production (`tsc` + `vite build`) |
| `npm run preview` | Prévisualisation du build |
| `npm test` | Tests Vitest |
| `npm run lint` | ESLint |

## Déploiement Cloudflare Pages

### Via GitHub (recommandé)

1. Push le code sur GitHub
2. Dans Cloudflare Pages → "Create a project" → "Connect to Git"
3. Sélectionner le repo `DimosPOBoard`
4. Configuration build :
   - **Framework preset** : Vite
   - **Build command** : `npm run build`
   - **Build output directory** : `dist`
5. Variables d'environnement (onglet "Environment variables") :
   ```
   VITE_SUPABASE_URL = https://pnbggstjuvgesmdowppa.supabase.co
   VITE_SUPABASE_ANON_KEY = ta_clé_anon_ici
   ```
6. Deploy !

### Via drag & drop (sans GitHub)

```bash
npm run build
# Glisser le dossier `dist/` dans Cloudflare Pages
```

## Supabase

### Auth

Dans le dashboard Supabase :
1. Authentication → Settings → Site URL : `https://ton-projet.pages.dev`
2. Authentication → Settings → Redirect URLs : ajouter `https://ton-projet.pages.dev/**`
3. Inviter les utilisateurs via Authentication → Users → Invite user

### Migrations

Le schéma est versionné dans `supabase/migrations/` (0001 → 0048) : tâches et itérations, épics/jalons, exigences, DoD, post-it board, gammes produits, roadmap items…

## Structure du projet

```
src/
├── components/
│   ├── ui/          Badge, Button, Card, Modal, Toast, Wizard, DodLinkPicker…
│   ├── layout/      Sidebar (thèmes), Layout
│   ├── tache/       FastTaskBoard, TacheTree, QuickAddModal, SousTacheModal…
│   ├── dod/         ReferentielTree, CouvertureTree
│   └── produit/     TrimObjectifsChecklist
├── pages/
│   ├── auth/              LoginPage
│   ├── dashboard/         Vue Globale, cockpit Portefeuille, charts
│   ├── roadmap/           Roadmap produit (Gantt, jalons)
│   ├── sprint/            SprintBoardPage (Kanban)
│   ├── tache/             TachesPage (arbre, itérations, dépendances)
│   ├── plancharges/       Plan de charges équipes
│   ├── dod/               Référentiel DoD et couverture
│   ├── produits/          Portefeuille + wizard de création
│   ├── produit-dashboard/ Tableau de bord par produit
│   ├── produit-config/    Configuration produit
│   ├── reunion/           Hub réunions + détail
│   ├── montravail/        Vue "Mon travail"
│   ├── activite/          Journal d'activité
│   ├── admin/             Équipes/utilisateurs, finance
│   └── setup/             Setup (équipes, sprints, epics, jalons, export)
├── hooks/           useTaches, useSprints, usePlanCharges, useReunions, useDod…
├── lib/             supabase.ts, utils.ts, authStore.ts, exportExcel, exportPdf
├── utils/           produitMetrics, joursFeries
├── types/           index.ts (Tache, Sprint, Produit, MembreEquipe…)
└── constants/       index.ts (couleurs, listes…)

supabase/
└── migrations/      Schéma SQL versionné (0001 → 0048) + dev_bootstrap.sql
```

## Variables d'environnement

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | URL du projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clé anonyme Supabase (publique) |
