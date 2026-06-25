import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, MutationCache, QueryCache } from '@tanstack/react-query'
import { handleSupabaseError } from '@/lib/errorHandler'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ProduitProvider, useProduit } from '@/contexts/ProduitContext'
import { Spinner }     from '@/components/ui/Spinner'
import LoginPage       from '@/pages/auth/LoginPage'
import SetPasswordPage from '@/pages/auth/SetPasswordPage'
import ProduitsPage    from '@/pages/produits/ProduitsPage'
import EquipesUtilisateursPage from '@/pages/admin/EquipesUtilisateursPage'
import FinanceSetupPage        from '@/pages/admin/FinanceSetupPage'
import DashboardPage   from '@/pages/dashboard/DashboardPage'
import BacklogPage     from '@/pages/backlog/BacklogPage'
import SprintBoardPage from '@/pages/sprint/SprintBoardPage'
import TachesPage      from '@/pages/tache/TachesPage'
import SetupPage       from '@/pages/setup/SetupPage'
import DodPage         from '@/pages/dod/DodPage'
import MonTravailPage  from '@/pages/montravail/MonTravailPage'
import ActivitePage    from '@/pages/activite/ActivitePage'
import ReunionPage            from '@/pages/reunion/ReunionPage'
import ProduitDashboardPage  from '@/pages/produit-dashboard/ProduitDashboardPage'
import ProduitConfigPage     from '@/pages/produit-config/ProduitConfigPage'

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
  const { user, isAdmin, isLoading } = useAuth()
  const { produitActif } = useProduit()

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

  // Pages produit-spécifiques : redirige vers / si pas de produit
  const requireProduit = (el: React.ReactNode) =>
    produitActif ? el : <Navigate to="/" replace />

  return (
    <Routes>
      <Route path="/login"       element={<Navigate to="/" replace />} />
      <Route path="/produits"    element={<ProduitsPage />} />
      <Route path="/admin/equipes"   element={isAdmin ? <EquipesUtilisateursPage /> : <Navigate to="/" replace />} />
      <Route path="/admin/users"    element={<Navigate to="/admin/equipes" replace />} />
      <Route path="/admin/finance"  element={isAdmin ? <FinanceSetupPage /> : <Navigate to="/" replace />} />
      {/* Accessibles sans produit */}
      <Route path="/"            element={<DashboardPage />} />
      <Route path="/setup"       element={<SetupPage />} />
      {/* Nécessitent un produit */}
      <Route path="/backlog"     element={requireProduit(<BacklogPage />)} />
      <Route path="/sprint"      element={requireProduit(<SprintBoardPage />)} />
      <Route path="/taches"      element={requireProduit(<TachesPage />)} />
      <Route path="/dod"         element={requireProduit(<DodPage />)} />
      <Route path="/montravail"  element={<MonTravailPage />} />
      <Route path="/activite"    element={requireProduit(<ActivitePage />)} />
      <Route path="/reunion"             element={<ReunionPage />} />
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
