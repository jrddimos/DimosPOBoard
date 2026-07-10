import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Table de référence globale (comme équipes) : regroupement de produits pour
// la roadmap multi-produits (Gamme > Sous-gamme > Produit > Trimestre).
// parent_id renseigné = sous-gamme rattachée à une gamme de premier niveau.
export interface GammeProduit {
  id: number
  nom: string
  couleur: string | null
  ordre: number
  parent_id: number | null
  created_at: string
}

async function fetchGammesProduits(): Promise<GammeProduit[]> {
  const { data, error } = await supabase.from('gammes_produits').select('*').order('ordre').order('nom')
  if (error) throw error
  return data ?? []
}

export function useGammesProduits() {
  return useQuery({ queryKey: ['gammes-produits'], queryFn: fetchGammesProduits, staleTime: 60_000 })
}

export function useCreateGammeProduit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (gamme: Omit<GammeProduit, 'id' | 'created_at'>) => {
      const { error } = await supabase.from('gammes_produits').insert(gamme)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gammes-produits'] }),
  })
}

export function useUpdateGammeProduit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<GammeProduit> }) => {
      const { error } = await supabase.from('gammes_produits').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gammes-produits'] }),
  })
}

export function useDeleteGammeProduit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      // Les roadmap_items rattachés sont supprimés en cascade côté base
      // (ON DELETE CASCADE) — on invalide simplement leur cache ensuite.
      const { error } = await supabase.from('gammes_produits').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gammes-produits'] })
      qc.invalidateQueries({ queryKey: ['roadmap-items'] })
    },
  })
}
