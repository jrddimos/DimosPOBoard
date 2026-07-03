import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface TacheDependance {
  id:         number
  produit_id: number
  bloque_id:  string  // id_tache qui bloque
  bloquee_id: string  // id_tache qui est bloquée
  created_at: string
}

export function useTacheDependances(produitId: number | null) {
  return useQuery({
    queryKey: ['tache_dependances', produitId],
    queryFn: async () => {
      if (!produitId) return []
      const { data, error } = await supabase
        .from('tache_dependances')
        .select('*')
        .eq('produit_id', produitId)
      if (error) throw error
      return (data ?? []) as TacheDependance[]
    },
    enabled: !!produitId,
    staleTime: 30_000,
  })
}

export function useAddDependance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (dep: { produit_id: number; bloque_id: string; bloquee_id: string }) => {
      const { error } = await supabase.from('tache_dependances').insert(dep)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['tache_dependances', v.produit_id] }),
  })
}

export function useRemoveDependance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: number; produit_id: number }) => {
      const { error } = await supabase.from('tache_dependances').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['tache_dependances', v.produit_id] }),
  })
}

// Une tâche est bloquée si au moins une des tâches qui la bloquent n'est pas "Fait"
export function isBloqueeParDependance(
  idTache: string,
  dependances: TacheDependance[],
  taches: { id_tache: string; statut: string }[],
): string[] {
  const statutById = new Map(taches.map(t => [t.id_tache, t.statut]))
  return dependances
    .filter(d => d.bloquee_id === idTache && statutById.get(d.bloque_id) !== 'Fait')
    .map(d => d.bloque_id)
}
