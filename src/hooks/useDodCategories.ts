import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProduit } from '@/contexts/ProduitContext'

export interface DodCategorie {
  id:         number
  produit_id: number
  nom:        string
  ordre:      number
  created_at: string
}

export function useDodCategories() {
  const { produitActif } = useProduit()
  const produitId = produitActif?.id ?? null

  return useQuery({
    queryKey: ['dod_categories', produitId],
    queryFn: async () => {
      if (!produitId) return []
      const { data, error } = await supabase
        .from('dod_categories')
        .select('*')
        .eq('produit_id', produitId)
        .order('ordre')
        .order('nom')
      if (error) throw error
      return (data ?? []) as DodCategorie[]
    },
    staleTime: 30_000,
    enabled: !!produitId,
  })
}

export function useCreateDodCategorie() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async (nom: string) => {
      if (!produitActif) throw new Error('Aucun produit sélectionné')
      const { error } = await supabase.from('dod_categories').insert({ produit_id: produitActif.id, nom })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dod_categories', produitActif?.id] }),
  })
}

export function useRenameDodCategorie() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async ({ id, nom }: { id: number; nom: string }) => {
      const { error } = await supabase.from('dod_categories').update({ nom }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dod_categories', produitActif?.id] }),
  })
}

export function useDeleteDodCategorie() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('dod_categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dod_categories', produitActif?.id] }),
  })
}
