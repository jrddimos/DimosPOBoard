import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/hooks/useActivityLog'
import type { TrimCheckItem } from '@/hooks/useProduits'

export interface TrimQuarterObjectifs {
  trimestre: string
  objectifs: TrimCheckItem[]
  // Icône lucide optionnelle choisie pour ce trimestre, affichée sur la barre.
  icone?: string | null
}

// Éléments de la Roadmap : entités de planification libres, décorrélées de la
// table produits et de son avancement — juste un nom, une gamme, une période
// (trimestre début/fin) et des objectifs libres par trimestre couvert, sans
// lien avec Setup Produit.
export interface RoadmapItem {
  id: number
  gamme_id: number
  nom: string
  couleur: string | null
  trimestre_debut: string
  trimestre_fin: string
  trimestre_objectifs: TrimQuarterObjectifs[]
  icone: string | null
  ordre: number
  created_at: string
}

async function fetchRoadmapItems(): Promise<RoadmapItem[]> {
  const { data, error } = await supabase.from('roadmap_items').select('*').order('ordre').order('trimestre_debut')
  if (error) throw error
  return data ?? []
}

export function useRoadmapItems() {
  return useQuery({ queryKey: ['roadmap-items'], queryFn: fetchRoadmapItems, staleTime: 30_000 })
}

export function useCreateRoadmapItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (item: Omit<RoadmapItem, 'id' | 'created_at'>) => {
      const { data, error } = await supabase.from('roadmap_items').insert(item).select().single()
      if (error) throw error
      const created = data as RoadmapItem
      await logActivity({ produit_id: null, action: 'create', target: String(created.id), title: created.nom, entity: 'roadmap_item' })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roadmap-items'] }),
  })
}

export function useUpdateRoadmapItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<RoadmapItem> }) => {
      const current = qc.getQueryData<RoadmapItem[]>(['roadmap-items'])?.find(r => r.id === id)
      const { error } = await supabase.from('roadmap_items').update(updates).eq('id', id)
      if (error) throw error
      const title = current?.nom ?? String(id)
      for (const key of Object.keys(updates) as (keyof typeof updates)[]) {
        const oldVal = current ? current[key] ?? null : null
        const newVal = updates[key] ?? null
        if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue
        await logActivity({
          produit_id: null, action: 'update', target: String(id), title, field: String(key),
          old_value: JSON.stringify(oldVal), new_value: JSON.stringify(newVal), entity: 'roadmap_item',
        })
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roadmap-items'] }),
  })
}

export function useDeleteRoadmapItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const current = qc.getQueryData<RoadmapItem[]>(['roadmap-items'])?.find(r => r.id === id)
      const { error } = await supabase.from('roadmap_items').delete().eq('id', id)
      if (error) throw error
      await logActivity({
        produit_id: null, action: 'delete', target: String(id), title: current?.nom ?? String(id),
        old_value: current ? JSON.stringify(current) : null, entity: 'roadmap_item',
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roadmap-items'] }),
  })
}
