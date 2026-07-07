import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProduit } from '@/contexts/ProduitContext'

export interface Jalon {
  id:         number
  produit_id: number
  code:       string
  couleur:    string
  ordre:      number
  created_at: string
}

export function useJalons() {
  const { produitActif } = useProduit()
  const produitId = produitActif?.id ?? null

  return useQuery({
    queryKey: ['jalons', produitId],
    queryFn: async () => {
      if (!produitId) return []
      const { data, error } = await supabase.from('jalons').select('*').eq('produit_id', produitId).order('ordre').order('code')
      if (error) throw error
      return (data ?? []) as Jalon[]
    },
    staleTime: 30_000,
    enabled: !!produitId,
  })
}

export function useJalonsByProduit(produitId: number | null) {
  return useQuery({
    queryKey: ['jalons', produitId],
    queryFn: async () => {
      if (!produitId) return []
      const { data, error } = await supabase.from('jalons').select('*').eq('produit_id', produitId).order('ordre').order('code')
      if (error) throw error
      return (data ?? []) as Jalon[]
    },
    staleTime: 30_000,
    enabled: !!produitId,
  })
}

export function useCreateJalon() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()
  return useMutation({
    mutationFn: async ({ code, couleur }: { code: string; couleur: string }) => {
      if (!produitActif) throw new Error('Aucun produit sélectionné')
      const { error } = await supabase.from('jalons').insert({ produit_id: produitActif.id, code, couleur })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jalons', produitActif?.id] }),
  })
}

export function useUpdateJalon() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Pick<Jalon, 'code' | 'couleur' | 'ordre'>> }) => {
      const { error } = await supabase.from('jalons').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jalons', produitActif?.id] }),
  })
}

export function useDeleteJalon() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('jalons').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jalons', produitActif?.id] }),
  })
}
