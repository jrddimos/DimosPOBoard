import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ActivityLog {
  id:         number
  // null = entrée transverse (Setup > Global), pas rattachée à un produit
  // précis (équipes, finance, gammes, ROCKS, roadmap, suggestions…).
  produit_id: number | null
  user_id:    string | null
  action:     'create' | 'update' | 'delete' | 'status' | 'restore'
  target:     string
  title:      string
  field:      string | null
  old_value:  string | null
  new_value:  string | null
  // Table réellement visée par cette entrée — null (par défaut historique)
  // = une tâche (target = id_tache) ; sinon 'dod' (target = code), 'sprint'
  // (target = numero), 'epic'/'jalon'/'produit'/'equipe'/'finance_config'/
  // 'fermeture'/'gamme'/'rocks'/'roadmap_item'/'suggestion' (target = id
  // numérique ou uuid en texte), 'utilisateur' (target = user_id, uuid).
  // Nécessaire pour qu'"Annuler"/"Restaurer" (page Activité / Setup > Global)
  // sache quelle table cibler au lieu de supposer toujours `taches` — voir
  // entityConfig() dans useActivityUndo.ts pour le mapping complet.
  entity:     string | null
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

// ── Journal "Global" (Setup > Global, admin) ─────────────────────
// Entrées transverses, non rattachées à un produit précis (équipes, users,
// finance, fermetures, gammes, ROCKS, roadmap, suggestions…). RLS : la
// policy activite_select retombe sur is_admin() quand produit_id IS NULL
// (has_produit_role(NULL,...) ne peut jamais matcher une ligne), donc cet
// onglet est de fait déjà réservé aux admins sans migration supplémentaire.
export function useGlobalActivityLog() {
  return useQuery({
    queryKey: ['activite', 'global'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activite')
        .select('*')
        .is('produit_id', null)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as ActivityLog[]
    },
    staleTime: 15_000,
  })
}

export function useClearGlobalActivityLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('activite').delete().is('produit_id', null)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activite', 'global'] }),
  })
}

// Insertion directe (pas de hook de mutation dédié) — appelée en tâche de fond
// depuis les mutations de useTaches.ts / useEquipes.ts / etc., pas depuis un
// composant. `produit_id: null` = entrée transverse (cf. useGlobalActivityLog).
export async function logActivity(entry: {
  produit_id: number | null
  action:     ActivityLog['action']
  target:     string
  title:      string
  field?:     string
  old_value?: string | null
  new_value?: string | null
  entity?:    string
}) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('activite').insert({ ...entry, user_id: user?.id ?? null })
  if (error) console.error('[activite] insert failed:', error.message)
}
