import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface TacheCommentaire {
  id:         number
  produit_id: number
  id_tache:   string
  user_id:    string | null
  texte:      string
  created_at: string
}

export function useTacheCommentaires(produitId: number | null, idTache: string | null) {
  return useQuery({
    queryKey: ['tache_commentaires', produitId, idTache],
    queryFn: async () => {
      if (!produitId || !idTache) return []
      const { data, error } = await supabase
        .from('tache_commentaires')
        .select('*')
        .eq('produit_id', produitId)
        .eq('id_tache', idTache)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as TacheCommentaire[]
    },
    enabled: !!produitId && !!idTache,
    staleTime: 15_000,
  })
}

export function useAddCommentaire() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: { produit_id: number; id_tache: string; user_id: string; texte: string }) => {
      const { error } = await supabase.from('tache_commentaires').insert(c)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['tache_commentaires', v.produit_id, v.id_tache] }),
  })
}

export function useDeleteCommentaire() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: number; produit_id: number; id_tache: string }) => {
      const { error } = await supabase.from('tache_commentaires').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['tache_commentaires', v.produit_id, v.id_tache] }),
  })
}
