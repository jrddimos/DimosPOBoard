import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/hooks/useActivityLog'

export type SuggestionStatut = 'nouvelle' | 'acceptee' | 'rejetee' | 'fermee'
export type SuggestionImportance = 'basse' | 'moyenne' | 'haute'

export interface Suggestion {
  id:          string
  auteur_id:   string
  titre:       string
  description: string | null
  statut:      SuggestionStatut
  importance:  SuggestionImportance
  created_at:  string
  updated_at:  string | null
}

export function useSuggestions() {
  return useQuery({
    queryKey: ['suggestions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('suggestions').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Suggestion[]
    },
    staleTime: 15_000,
  })
}

export function useCreateSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { auteur_id: string; titre: string; description: string | null; importance: SuggestionImportance }) => {
      const { data, error } = await supabase.from('suggestions').insert(payload).select().single()
      if (error) throw error
      const created = data as Suggestion
      await logActivity({ produit_id: null, action: 'create', target: created.id, title: created.titre, entity: 'suggestion' })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suggestions'] }),
  })
}

// Édition par l'auteur (titre/description/importance) — revenir compléter
// une proposition après coup, distinct du changement de statut (admin).
export function useUpdateSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, titre, description, importance }: {
      id: string; titre: string; description: string | null; importance: SuggestionImportance
    }) => {
      const current = qc.getQueryData<Suggestion[]>(['suggestions'])?.find(s => s.id === id)
      const { error } = await supabase.from('suggestions')
        .update({ titre, description, importance, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      const title = current?.titre ?? titre
      const updates = { titre, description, importance }
      for (const key of Object.keys(updates) as (keyof typeof updates)[]) {
        const oldVal = current ? current[key] ?? null : null
        const newVal = updates[key] ?? null
        if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue
        await logActivity({
          produit_id: null, action: 'update', target: id, title, field: String(key),
          old_value: JSON.stringify(oldVal), new_value: JSON.stringify(newVal), entity: 'suggestion',
        })
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suggestions'] }),
  })
}

export function useUpdateSuggestionStatut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: SuggestionStatut }) => {
      const current = qc.getQueryData<Suggestion[]>(['suggestions'])?.find(s => s.id === id)
      const { error } = await supabase.from('suggestions').update({ statut, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      if (current?.statut === statut) return
      await logActivity({
        produit_id: null, action: 'status', target: id, title: current?.titre ?? id, field: 'statut',
        old_value: JSON.stringify(current?.statut ?? null), new_value: JSON.stringify(statut), entity: 'suggestion',
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suggestions'] }),
  })
}
