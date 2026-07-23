import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/hooks/useActivityLog'

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
      const { data, error } = await supabase.from('gammes_produits').insert(gamme).select().single()
      if (error) throw error
      const created = data as GammeProduit
      await logActivity({ produit_id: null, action: 'create', target: String(created.id), title: created.nom, entity: 'gamme' })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gammes-produits'] }),
  })
}

export function useUpdateGammeProduit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<GammeProduit> }) => {
      const current = qc.getQueryData<GammeProduit[]>(['gammes-produits'])?.find(g => g.id === id)
      const { error } = await supabase.from('gammes_produits').update(updates).eq('id', id)
      if (error) throw error
      const title = current?.nom ?? String(id)
      for (const key of Object.keys(updates) as (keyof typeof updates)[]) {
        const oldVal = current ? current[key] ?? null : null
        const newVal = updates[key] ?? null
        if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue
        await logActivity({
          produit_id: null, action: 'update', target: String(id), title, field: String(key),
          old_value: JSON.stringify(oldVal), new_value: JSON.stringify(newVal), entity: 'gamme',
        })
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gammes-produits'] }),
  })
}

export function useDeleteGammeProduit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const current = qc.getQueryData<GammeProduit[]>(['gammes-produits'])?.find(g => g.id === id)
      // Les roadmap_items rattachés sont supprimés en cascade côté base
      // (ON DELETE CASCADE) — on invalide simplement leur cache ensuite.
      const { error } = await supabase.from('gammes_produits').delete().eq('id', id)
      if (error) throw error
      await logActivity({
        produit_id: null, action: 'delete', target: String(id), title: current?.nom ?? String(id),
        old_value: current ? JSON.stringify(current) : null, entity: 'gamme',
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gammes-produits'] })
      qc.invalidateQueries({ queryKey: ['roadmap-items'] })
    },
  })
}
