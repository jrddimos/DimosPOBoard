import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

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
      const { error } = await supabase.from('suggestions').insert(payload)
      if (error) throw error
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
      const { error } = await supabase.from('suggestions')
        .update({ titre, description, importance, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suggestions'] }),
  })
}

export function useUpdateSuggestionStatut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, statut }: { id: string; statut: SuggestionStatut }) => {
      const { error } = await supabase.from('suggestions').update({ statut, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suggestions'] }),
  })
}
