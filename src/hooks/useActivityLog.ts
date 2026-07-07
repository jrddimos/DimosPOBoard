import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ActivityLog {
  id:         number
  produit_id: number
  user_id:    string | null
  action:     'create' | 'update' | 'delete' | 'status'
  target:     string
  title:      string
  field:      string | null
  old_value:  string | null
  new_value:  string | null
  created_at: string
}

export function useActivityLog(produitId: number | null) {
  return useQuery({
    queryKey: ['activite', produitId],
    queryFn: async () => {
      if (!produitId) return []
      const { data, error } = await supabase
        .from('activite')
        .select('*')
        .eq('produit_id', produitId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as ActivityLog[]
    },
    enabled: !!produitId,
    staleTime: 15_000,
  })
}

// ── Historique des passages à "Fait" (pour les courbes de burn-up) ──
export interface FaitTransition { produit_id: number; target: string; created_at: string }

async function fetchFaitTransitions(sinceISO: string, produitId?: number): Promise<FaitTransition[]> {
  let q = supabase
    .from('activite')
    .select('produit_id, target, created_at')
    .eq('field', 'statut')
    .eq('new_value', 'Fait')
    .gte('created_at', sinceISO)
    .order('created_at')
  if (produitId) q = q.eq('produit_id', produitId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as FaitTransition[]
}

// Une seule requête, tous produits confondus — pour les mini-graphiques du Portefeuille.
export function useAllFaitTransitions(sinceISO: string) {
  return useQuery({
    queryKey: ['activite-fait-all', sinceISO],
    queryFn: () => fetchFaitTransitions(sinceISO),
    staleTime: 60_000,
  })
}

// Scopée à un produit — pour le graphique détaillé du dashboard produit.
export function useFaitTransitions(produitId: number | null, sinceISO: string | null) {
  return useQuery({
    queryKey: ['activite-fait', produitId, sinceISO],
    queryFn: () => fetchFaitTransitions(sinceISO!, produitId!),
    enabled: !!produitId && !!sinceISO,
    staleTime: 60_000,
  })
}

// ── Boucles de vérification par exigence (F2.1 revérifiée 3x, etc.) ──
// Nombre de fois où une exigence est repassée à verifiee=true : 1 = validée
// du premier coup, ≥2 = elle a rebouclé (dé-vérifiée puis revalidée).
export function useVerificationLoops(produitId: number | null) {
  return useQuery({
    queryKey: ['verification-loops', produitId],
    queryFn: async () => {
      if (!produitId) return new Map<string, number>()
      const { data, error } = await supabase
        .from('activite')
        .select('target')
        .eq('produit_id', produitId)
        .eq('field', 'verifiee')
        .eq('new_value', 'true')
      if (error) throw error
      const map = new Map<string, number>()
      ;(data ?? []).forEach((r: { target: string }) => map.set(r.target, (map.get(r.target) ?? 0) + 1))
      return map
    },
    enabled: !!produitId,
    staleTime: 15_000,
  })
}

export function useClearActivityLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (produitId: number) => {
      const { error } = await supabase.from('activite').delete().eq('produit_id', produitId)
      if (error) throw error
    },
    onSuccess: (_, produitId) => qc.invalidateQueries({ queryKey: ['activite', produitId] }),
  })
}

// Insertion directe (pas de hook de mutation dédié) — appelée en tâche de fond
// depuis les mutations de useTaches.ts, pas depuis un composant.
export async function logActivity(entry: {
  produit_id: number
  action:     ActivityLog['action']
  target:     string
  title:      string
  field?:     string
  old_value?: string | null
  new_value?: string | null
}) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('activite').insert({ ...entry, user_id: user?.id ?? null })
  if (error) console.error('[activite] insert failed:', error.message)
}
