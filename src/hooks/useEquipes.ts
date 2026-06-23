import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Equipe, MembreEquipe } from '@/types'

// ── Équipes (groupes) ─────────────────────────────────────────
async function fetchEquipes(): Promise<Equipe[]> {
  const { data, error } = await supabase.from('equipes').select('*').order('nom')
  if (error) throw error
  return data ?? []
}

export function useEquipes() {
  return useQuery({ queryKey: ['equipes'], queryFn: fetchEquipes, staleTime: 60_000 })
}

export function useCreateEquipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (equipe: Omit<Equipe,'id'|'created_at'>) => {
      const { error } = await supabase.from('equipes').insert(equipe)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipes'] }),
  })
}

export function useUpdateEquipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Equipe> }) => {
      const { error } = await supabase.from('equipes').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipes'] }),
  })
}

export function useDeleteEquipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      // Désaffecter les membres d'abord
      await supabase.from('membres').update({ equipe_id: null }).eq('equipe_id', id)
      const { error } = await supabase.from('equipes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipes'] })
      qc.invalidateQueries({ queryKey: ['equipe'] })
    },
  })
}

// ── Membres ───────────────────────────────────────────────────
async function fetchEquipe(): Promise<MembreEquipe[]> {
  const { data, error } = await supabase.from('membres').select('*').order('trigramme')
  if (error) throw error
  return data ?? []
}

export function useEquipe() {
  return useQuery({ queryKey: ['equipe'], queryFn: fetchEquipe, staleTime: 60_000 })
}

export function useAddMembre() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (membre: Omit<MembreEquipe,'id'>) => {
      const { error } = await supabase.from('membres').insert(membre)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipe'] }),
  })
}

export function useUpdateMembre() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<MembreEquipe> }) => {
      const { error } = await supabase.from('membres').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipe'] }),
  })
}

export function useDeleteMembre() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('membres').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipe'] }),
  })
}

// ── Sync equipe sur les tâches ────────────────────────────────
// Pour chaque équipe, met à jour tache.equipe = equipe.nom
// pour toutes les tâches dont assigne_a correspond à un membre de cette équipe.
export function useSyncEquipesTaches() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const [{ data: equipes }, { data: membres }] = await Promise.all([
        supabase.from('equipes').select('id, nom').eq('actif', true),
        supabase.from('membres').select('trigramme, equipe_id').eq('actif', true),
      ])
      if (!equipes || !membres) return { updated: 0 }

      // Une requête par équipe : update tache.equipe pour tous les membres de cette équipe
      for (const eq of equipes) {
        const trigrammes = (membres as { trigramme: string; equipe_id: number | null }[])
          .filter(m => m.equipe_id === eq.id)
          .map(m => m.trigramme)
        if (!trigrammes.length) continue
        await supabase.from('taches').update({ equipe: eq.nom }).in('assigne_a', trigrammes)
      }
      return { ok: true }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taches'] }),
  })
}
