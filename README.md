# Dimos D3X+ — PO Board

Application de gestion produit pour la profileuse D3X+.

## Stack

- **React 18** + **TypeScript** + **Tailwind CSS**
- **Supabase** (BDD + Auth)
- **React Query** (cache données)
- **React Router** (navigation)
- **Zustand** (state auth)
- **Cloudflare Pages** (déploiement)

## Installation locale

```bash
# 1. Cloner le repo
git clone https://github.com/ton-org/dimos-d3x.git
cd dimos-d3x

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

## Déploiement Cloudflare Pages

### Via GitHub (recommandé)

1. Push le code sur GitHub
2. Dans Cloudflare Pages → "Create a project" → "Connect to Git"
3. Sélectionner le repo `dimos-d3x`
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

## Supabase — Auth

Dans le dashboard Supabase :
1. Authentication → Settings → Site URL : `https://ton-projet.pages.dev`
2. Authentication → Settings → Redirect URLs : ajouter `https://ton-projet.pages.dev/**`
3. Inviter les utilisateurs via Authentication → Users → Invite user

## Structure du projet

```
src/
├── components/
│   ├── ui/          Badge, Button, Card, Modal, Toast, Form, Spinner
│   └── layout/      Sidebar, Layout
├── pages/
│   ├── auth/        LoginPage
│   ├── dashboard/   DashboardPage (Vue Globale, Sprint, Roadmap Gantt)
│   ├── backlog/     BacklogPage (16 colonnes, filtres, panel détail)
│   ├── sprint/      SprintBoardPage (Kanban 4 colonnes)
│   ├── tache/       TachesPage (Ajouter, Modifier, Dupliquer, Supprimer)
│   └── setup/       SetupPage (Équipes, Sprints, Epics, Jalons, Métiers, Export)
├── hooks/           useTaches, useSprints, useEquipe, useToast
├── lib/             supabase.ts, utils.ts, authStore.ts
├── types/           index.ts (Tache, Sprint, MembreEquipe...)
└── constants/       index.ts (EPIC_LIST, COLORS, SPRINTS_LIST...)
```

## Variables d'environnement

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | URL du projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clé anonyme Supabase (publique) |
