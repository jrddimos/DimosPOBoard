import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ProduitMessage {
  id:         number
  produit_id: number
  user_id:    string | null
  texte:      string
  created_at: string
}

export function useProduitMessages(produitId: number | null) {
  return useQuery({
    queryKey: ['produit_messages', produitId],
    queryFn: async () => {
      if (!produitId) return []
      const { data, error } = await supabase
        .from('produit_messages')
        .select('*')
        .eq('produit_id', produitId)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as ProduitMessage[]
    },
    enabled: !!produitId,
    staleTime: 10_000,
    refetchInterval: 20_000,
  })
}

export function useAddProduitMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (m: { produit_id: number; user_id: string; texte: string }) => {
      const { error } = await supabase.from('produit_messages').insert(m)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['produit_messages', v.produit_id] }),
  })
}

export function useDeleteProduitMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: number; produit_id: number }) => {
      const { error } = await supabase.from('produit_messages').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['produit_messages', v.produit_id] }),
  })
}
