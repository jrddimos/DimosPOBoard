import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProduit } from '@/contexts/ProduitContext'

export interface DodItem {
  id:          number
  produit_id:  number
  code:        string
  titre:       string
  description: string | null
  categorie:   string | null
  actif:       boolean
  ordre:       number
  created_at:  string
}

export function useDod() {
  const { produitActif } = useProduit()
  const produitId = produitActif?.id ?? null

  return useQuery({
    queryKey: ['dod', produitId],
    queryFn: async () => {
      if (!produitId) return []
      const { data, error } = await supabase
        .from('dod')
        .select('*')
        .eq('produit_id', produitId)
        .order('ordre')
        .order('code')
      if (error) throw error
      return (data ?? []) as DodItem[]
    },
    staleTime: 30_000,
    enabled: !!produitId,
  })
}

export function useCreateDodItem() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async (payload: Omit<DodItem, 'id' | 'created_at' | 'produit_id'>) => {
      if (!produitActif) throw new Error('Aucun produit sélectionné')
      const { data, error } = await supabase
        .from('dod')
        .insert({ ...payload, produit_id: produitActif.id })
        .select()
        .single()
      if (error) throw error
      return data as DodItem
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dod', produitActif?.id] }),
  })
}

export function useUpdateDodItem() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<DodItem> }) => {
      const { error } = await supabase.from('dod').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dod', produitActif?.id] }),
  })
}

export function useDeleteDodItem() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('dod').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dod', produitActif?.id] }),
  })
}
