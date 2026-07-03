import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface TacheTemps {
  id:         number
  produit_id: number
  id_tache:   string
  user_id:    string | null
  date:       string // YYYY-MM-DD
  minutes:    number
  note:       string | null
  created_at: string
}

export function useTacheTemps(produitId: number | null, idTache: string | null) {
  return useQuery({
    queryKey: ['tache_temps', produitId, idTache],
    queryFn: async () => {
      if (!produitId || !idTache) return []
      const { data, error } = await supabase
        .from('tache_temps')
        .select('*')
        .eq('produit_id', produitId)
        .eq('id_tache', idTache)
        .order('date', { ascending: false })
      if (error) throw error
      return (data ?? []) as TacheTemps[]
    },
    enabled: !!produitId && !!idTache,
    staleTime: 15_000,
  })
}

export function useAddTemps() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (t: { produit_id: number; id_tache: string; user_id: string; date: string; minutes: number; note?: string }) => {
      const { error } = await supabase.from('tache_temps').insert(t)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['tache_temps', v.produit_id, v.id_tache] }),
  })
}

export function useDeleteTemps() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: number; produit_id: number; id_tache: string }) => {
      const { error } = await supabase.from('tache_temps').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['tache_temps', v.produit_id, v.id_tache] }),
  })
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
}
