import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProduit } from '@/contexts/ProduitContext'

export interface Epic {
  id:         number
  produit_id: number
  code:       string
  nom:        string
  couleur:    string | null
  bg_couleur: string | null
  ordre:      number | null
}

// Valeur combinée telle que stockée sur taches.epic (ex: "EPIC 1 — Architecture & CDC")
export function epicFullName(e: Pick<Epic, 'code' | 'nom'>): string {
  return `${e.code} — ${e.nom}`
}

export function useEpics() {
  const { produitActif } = useProduit()
  const produitId = produitActif?.id ?? null

  return useQuery({
    queryKey: ['epics', produitId],
    queryFn: async () => {
      if (!produitId) return []
      const { data, error } = await supabase.from('epics').select('*').eq('produit_id', produitId).order('ordre').order('code')
      if (error) throw error
      return (data ?? []) as Epic[]
    },
    staleTime: 30_000,
    enabled: !!produitId,
  })
}

export function useEpicsByProduit(produitId: number | null) {
  return useQuery({
    queryKey: ['epics', produitId],
    queryFn: async () => {
      if (!produitId) return []
      const { data, error } = await supabase.from('epics').select('*').eq('produit_id', produitId).order('ordre').order('code')
      if (error) throw error
      return (data ?? []) as Epic[]
    },
    staleTime: 30_000,
    enabled: !!produitId,
  })
}

export function useCreateEpic() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()
  return useMutation({
    mutationFn: async ({ code, nom, couleur, bg_couleur }: { code: string; nom: string; couleur: string; bg_couleur: string }) => {
      if (!produitActif) throw new Error('Aucun produit sélectionné')
      // Toujours à la suite des Epics existants : sans `ordre` explicite, la
      // valeur par défaut (NULL) passerait EN PREMIER dans la liste (tri
      // ascendant = NULLS FIRST par défaut côté Postgres), pas à la fin.
      const { data: existing } = await supabase.from('epics').select('ordre').eq('produit_id', produitActif.id)
      const maxOrdre = (existing ?? []).reduce((m, e) => Math.max(m, e.ordre ?? 0), 0)
      const { error } = await supabase.from('epics').insert({ produit_id: produitActif.id, code, nom, couleur, bg_couleur, ordre: maxOrdre + 1 })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['epics', produitActif?.id] }),
  })
}

export function useUpdateEpic() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Pick<Epic, 'code' | 'nom' | 'couleur' | 'bg_couleur' | 'ordre'>> }) => {
      const { error } = await supabase.from('epics').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['epics', produitActif?.id] }),
  })
}

export function useDeleteEpic() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('epics').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['epics', produitActif?.id] }),
  })
}
