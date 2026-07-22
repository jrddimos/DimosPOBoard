import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, MutationCache, QueryCache } from '@tanstack/react-query'
import { handleSupabaseError } from '@/lib/errorHandler'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ProduitProvider, useProduit } from '@/contexts/ProduitContext'
import { useTachesRealtime } from '@/hooks/useTachesRealtime'
import { Spinner }     from '@/components/ui/Spinner'
import LoginPage       from '@/pages/auth/LoginPage'
import SetPasswordPage from '@/pages/auth/SetPasswordPage'
import ProduitsPage    from '@/pages/produits/ProduitsPage'
import DashboardPage   from '@/pages/dashboard/DashboardPage'
import SprintBoardPage from '@/pages/sprint/SprintBoardPage'
import TachesPage      from '@/pages/tache/TachesPage'
import SetupPage       from '@/pages/setup/SetupPage'
import DodPage         from '@/pages/dod/DodPage'
import MonTravailPage  from '@/pages/montravail/MonTravailPage'
import ActivitePage    from '@/pages/activite/ActivitePage'
import ReunionPage            from '@/pages/reunion/ReunionPage'
import ReunionsHubPage        from '@/pages/reunion/ReunionsHubPage'
import ReunionDetailPage      from '@/pages/reunion/ReunionDetailPage'
import ProduitDashboardPage  from '@/pages/produit-dashboard/ProduitDashboardPage'
import ProduitConfigPage     from '@/pages/produit-config/ProduitConfigPage'
import PlanChargesPage       from '@/pages/plancharges/PlanChargesPage'
import RoadmapPage           from '@/pages/roadmap/RoadmapPage'

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.state.data !== undefined) return
      handleSupabaseError(error, String(query.queryKey[0] ?? ''))
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      handleSupabaseError(error, mutation.options.mutationKey?.[0] as string)
    },
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const err = error as { status?: number }
        if (err?.status === 403 || err?.status === 404) return false
        return failureCount < 2
      },
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: 0 },
  },
})

// ── Guard interne (a accès au contexte) ──────────────────────
function AppRoutes() {
  const { user, profile, isLoading } = useAuth()
  const { produitActif } = useProduit()
  // Synchro live des tâches entre utilisateurs (cf. useTachesRealtime) — pas
  // besoin de refresh pour voir les modifications faites par quelqu'un
  // d'autre, même pendant qu'un panneau de détail reste ouvert.
  useTachesRealtime()

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <Spinner />
    </div>
  )

  // Détection flow invite / reset capturé dans main.tsx avant que Supabase efface le hash
  const authFlow = sessionStorage.getItem('auth_flow')
  if (authFlow === 'invite' || authFlow === 'recovery') {
    return <SetPasswordPage />
  }

  if (!user) return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*"      element={<Navigate to="/login" replace />} />
    </Routes>
  )

  // Utilisateur créé par un admin avec un mot de passe temporaire (pas
  // d'email d'invitation, cf. Setup > Équipes & Utilisateurs) : changement
  // obligatoire avant tout accès à l'app.
  if (profile?.must_change_password) {
    return <SetPasswordPage />
  }

  // Pages produit-spécifiques : redirige vers / si pas de produit
  const requireProduit = (el: React.ReactNode) =>
    produitActif ? el : <Navigate to="/" replace />

  return (
    <Routes>
      <Route path="/login"       element={<Navigate to="/" replace />} />
      <Route path="/produits"    element={<ProduitsPage />} />
      {/* Compat : Équipes/Finance ont été fusionnés dans Setup */}
      <Route path="/admin/equipes"  element={<Navigate to="/setup?tab=equipes" replace />} />
      <Route path="/admin/users"    element={<Navigate to="/setup?tab=equipes" replace />} />
      <Route path="/admin/finance"  element={<Navigate to="/setup?tab=finance" replace />} />
      {/* Accessibles sans produit */}
      <Route path="/"            element={<DashboardPage />} />
      <Route path="/setup"       element={<SetupPage />} />
      <Route path="/roadmap"     element={<RoadmapPage />} />
      {/* Nécessitent un produit */}
      {/* Compat : Backlog a été fusionné dans Tâches */}
      <Route path="/backlog"     element={<Navigate to="/taches" replace />} />
      <Route path="/sprint"      element={requireProduit(<SprintBoardPage />)} />
      <Route path="/taches"      element={requireProduit(<TachesPage />)} />
      <Route path="/dod"         element={requireProduit(<DodPage />)} />
      <Route path="/montravail"  element={<MonTravailPage />} />
      <Route path="/activite"    element={requireProduit(<ActivitePage />)} />
      <Route path="/reunions"            element={<ReunionsHubPage />} />
      <Route path="/reunions/po"         element={<ReunionPage />} />
      <Route path="/reunions/:id"        element={<ReunionDetailPage />} />
      {/* Compat : anciens liens (notifications mention_reunion) */}
      <Route path="/reunion"             element={<ReunionPage />} />
      <Route path="/plan-charges"        element={<PlanChargesPage />} />
      <Route path="/produit-dashboard"  element={requireProduit(<ProduitDashboardPage />)} />
      <Route path="/produit-config"     element={requireProduit(<ProduitConfigPage />)} />
      <Route path="*"                   element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ProduitProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ProduitProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
