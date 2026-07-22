import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// Widget cockpit "Scorecard" (vue FL3) — suivi hebdomadaire d'incréments
// livrés par initiative transverse (hors produits D3X), portefeuille donc
// pas de produit_id. `valeur` sur scorecard_increments est CUMULATIVE
// (comme dans le classeur Excel d'origine), pas un delta hebdo.
// `objectif_texte`/`statut` (cf. 0062) portent une note qualitative par
// semaine ("qu'est-ce qui devait être fait ?" / atteint ou non) —
// indépendants de `valeur`, une semaine peut n'avoir que l'un des deux.

export interface ScorecardInitiative {
  id:                  number
  nom:                 string
  semaine_depart:      number
  semaine_deadline:    number
  objectif_increments: number
  couleur:             string | null
  ordre:               number
  created_by:          string | null
  created_at:          string
}

export type ScorecardStatut = 'OK' | 'KO'

export interface ScorecardIncrement {
  id:             number
  initiative_id:  number
  semaine:        number
  valeur:         number | null
  objectif_texte: string | null
  statut:         ScorecardStatut | null
  created_at:     string
}

const QK_INITIATIVES = ['scorecard_initiatives']
const QK_INCREMENTS  = ['scorecard_increments']

export function useScorecardInitiatives() {
  return useQuery({
    queryKey: QK_INITIATIVES,
    queryFn: async () => {
      const { data, error } = await supabase.from('scorecard_initiatives').select('*').order('ordre').order('id')
      if (error) throw error
      return (data ?? []) as ScorecardInitiative[]
    },
    staleTime: 30_000,
  })
}

export function useScorecardIncrements() {
  return useQuery({
    queryKey: QK_INCREMENTS,
    queryFn: async () => {
      const { data, error } = await supabase.from('scorecard_increments').select('*').order('semaine')
      if (error) throw error
      return (data ?? []) as ScorecardIncrement[]
    },
    staleTime: 30_000,
  })
}

export function useCreateScorecardInitiative() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (payload: { nom: string; semaine_depart: number; semaine_deadline: number; objectif_increments: number; ordre?: number }) => {
      const { error } = await supabase.from('scorecard_initiatives').insert({ ...payload, created_by: user?.id ?? null })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_INITIATIVES }),
  })
}

export function useUpdateScorecardInitiative() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Pick<ScorecardInitiative, 'nom' | 'semaine_depart' | 'semaine_deadline' | 'objectif_increments' | 'couleur' | 'ordre'>> }) => {
      const { error } = await supabase.from('scorecard_initiatives').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_INITIATIVES }),
  })
}

export function useDeleteScorecardInitiative() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('scorecard_initiatives').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK_INITIATIVES })
      qc.invalidateQueries({ queryKey: QK_INCREMENTS })
    },
  })
}

// Saisie hebdo : une ligne par (initiative, semaine) — upsert pour permettre
// de corriger une semaine sans dupliquer la ligne. Payload volontairement
// partiel (seuls les champs fournis sont insérés/mis à jour, cf. PostgREST
// upsert) : modifier `statut` seul ne touche pas `valeur`/`objectif_texte`
// déjà en base sur la même semaine, et réciproquement.
export function useUpsertScorecardIncrement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { initiative_id: number; semaine: number; valeur?: number | null; objectif_texte?: string | null; statut?: ScorecardStatut | null }) => {
      const { error } = await supabase.from('scorecard_increments').upsert(payload, { onConflict: 'initiative_id,semaine' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_INCREMENTS }),
  })
}

export function useDeleteScorecardIncrement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('scorecard_increments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_INCREMENTS }),
  })
}
