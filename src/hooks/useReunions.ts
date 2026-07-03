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
