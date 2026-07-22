import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Reunion {
  id: number
  semaine: number
  annee: number
  animateur: string | null
  notes_seance: string | null
  phase_notes: string[]
  created_at: string
}

export interface ReunionRevue {
  id: number
  reunion_id: number
  produit_id: number
  statut_presente: string | null
  blocages: number
  notes: string | null
}

export interface ReunionSujet {
  id: number
  reunion_id: number
  type_tag: string | null
  titre: string
}

export function useReunionSemaine(semaine: number, annee: number) {
  return useQuery({
    queryKey: ['reunion', semaine, annee],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reunions')
        .select('*')
        .eq('semaine', semaine)
        .eq('annee', annee)
        .maybeSingle()
      if (error) throw error
      return data as Reunion | null
    },
  })
}

export function useRevuesByReunion(reunionId: number | null) {
  return useQuery({
    queryKey: ['reunion_revues', reunionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reunion_revues')
        .select('*')
        .eq('reunion_id', reunionId!)
      if (error) throw error
      return data as ReunionRevue[]
    },
    enabled: !!reunionId,
  })
}

export function useSujetsByReunion(reunionId: number | null) {
  return useQuery({
    queryKey: ['reunion_sujets', reunionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reunion_sujets')
        .select('*')
        .eq('reunion_id', reunionId!)
        .order('id')
      if (error) throw error
      return data as ReunionSujet[]
    },
    enabled: !!reunionId,
  })
}

export interface SaveReunionPayload {
  semaine: number
  annee: number
  animateur: string | null
  notes_seance: string | null
  phase_notes: string[]
  revues: Array<{
    produit_id: number
    statut_presente: string | null
    blocages: number
    notes: string | null
  }>
  sujets: Array<{
    type_tag: string | null
    titre: string
  }>
}

export function useSauvegarderReunion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: SaveReunionPayload) => {
      const { data: reunion, error: rErr } = await supabase
        .from('reunions')
        .upsert(
          { semaine: payload.semaine, annee: payload.annee, animateur: payload.animateur, notes_seance: payload.notes_seance, phase_notes: payload.phase_notes },
          { onConflict: 'semaine,annee' }
        )
        .select()
        .single()
      if (rErr) throw rErr
      const reunionId = (reunion as Reunion).id

      // Upsert (au lieu de delete+reinsert) pour que le trigger de mention
      // puisse comparer ancien/nouveau texte et ne notifier que les
      // mentions nouvellement ajoutées.
      const currentProduitIds = payload.revues.map(r => r.produit_id)
      if (currentProduitIds.length > 0) {
        await supabase.from('reunion_revues').delete().eq('reunion_id', reunionId)
          .not('produit_id', 'in', `(${currentProduitIds.join(',')})`)
      } else {
        await supabase.from('reunion_revues').delete().eq('reunion_id', reunionId)
      }
      if (payload.revues.length > 0) {
        const { error: rvErr } = await supabase
          .from('reunion_revues')
          .upsert(payload.revues.map(r => ({ ...r, reunion_id: reunionId })), { onConflict: 'reunion_id,produit_id' })
        if (rvErr) throw rvErr
      }

      await supabase.from('reunion_sujets').delete().eq('reunion_id', reunionId)
      const filteredSujets = payload.sujets.filter(s => s.titre.trim())
      if (filteredSujets.length > 0) {
        const { error: sjErr } = await supabase
          .from('reunion_sujets')
          .insert(filteredSujets.map(s => ({ ...s, reunion_id: reunionId })))
        if (sjErr) throw sjErr
      }

      return reunion as Reunion
    },
    onSuccess: (_, payload) => {
      qc.invalidateQueries({ queryKey: ['reunion', payload.semaine, payload.annee] })
      qc.invalidateQueries({ queryKey: ['reunion_revues'] })
      qc.invalidateQueries({ queryKey: ['reunion_sujets'] })
    },
  })
}

// ════════════════════════════════════════════════════════════════
// Réunions multi-types (migration 0020)
// ════════════════════════════════════════════════════════════════

export type SectionKey = 'revue_produits' | 'notes' | 'jalons' | 'actions' | 'decisions' | 'risques' | 'objectifs'

export interface ReunionType {
  id: number
  nom: string
  couleur: string
  sections: SectionKey[]
  builtin: string | null
  actif: boolean
  ordre: number
}

export interface ActionItem { id: string; titre: string; assigne: string; done: boolean }
export interface RisqueItem { id: string; texte: string; niveau: 'vert' | 'orange' | 'rouge' }
export interface DecisionItem { id: string; texte: string }
export interface ObjectifItem { id: string; texte: string; checked: boolean }

export interface SectionsData {
  notes?: string
  jalons?: string
  actions?: ActionItem[]
  decisions?: DecisionItem[]
  risques?: RisqueItem[]
  objectifs?: ObjectifItem[]
}

export interface ReunionGenerique extends Reunion {
  type_id: number | null
  titre: string | null
  date_reunion: string | null
  produit_id: number | null
  participants: string[]
  sections_data: SectionsData
  privee: boolean
  // Verrouille le contenu en lecture seule pour tout le monde sauf un admin
  // (qui peut déverrouiller temporairement côté front, cf. ReunionDetailPage)
  // — ne touche jamais date_reunion, qui reste celle d'origine.
  terminee: boolean
  created_by: string | null
}

export function useReunionTypes() {
  return useQuery({
    queryKey: ['reunion_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reunion_types').select('*').eq('actif', true).order('ordre')
      if (error) throw error
      return (data ?? []) as ReunionType[]
    },
    staleTime: 5 * 60_000,
  })
}

export function useReunionsList() {
  return useQuery({
    queryKey: ['reunions_list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reunions')
        .select('*')
        .order('date_reunion', { ascending: false, nullsFirst: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as ReunionGenerique[]
    },
  })
}

export function useReunionById(id: number | null) {
  return useQuery({
    queryKey: ['reunion_by_id', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reunions').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as ReunionGenerique | null
    },
    enabled: !!id,
  })
}

export function useCreateReunion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { type_id: number; titre: string; date_reunion: string; produit_id: number | null; privee?: boolean; participants?: string[] }) => {
      const { data, error } = await supabase
        .from('reunions')
        .insert({ participants: [], sections_data: {}, ...payload })
        .select()
        .single()
      if (error) throw error
      return data as ReunionGenerique
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reunions_list'] }),
  })
}

export function useUpdateReunionGenerique() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Pick<ReunionGenerique, 'titre' | 'animateur' | 'date_reunion' | 'produit_id' | 'participants' | 'sections_data' | 'privee' | 'terminee'>> }) => {
      const { data, error } = await supabase
        .from('reunions').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data as ReunionGenerique
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['reunions_list'] })
      qc.invalidateQueries({ queryKey: ['reunion_by_id', r.id] })
    },
  })
}

export function useDeleteReunion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('reunions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reunions_list'] }),
  })
}
