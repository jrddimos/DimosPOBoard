import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { parseAssignees } from '@/lib/utils'
import { logActivity } from '@/hooks/useActivityLog'
import type { UserProfile } from '@/contexts/AuthContext'
import type { Equipe } from '@/types'

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
      const { data, error } = await supabase.from('equipes').insert(equipe).select().single()
      if (error) throw error
      const created = data as Equipe
      await logActivity({ produit_id: null, action: 'create', target: String(created.id), title: created.nom, entity: 'equipe' })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipes'] }),
  })
}

export function useUpdateEquipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Equipe> }) => {
      const current = qc.getQueryData<Equipe[]>(['equipes'])?.find(e => e.id === id)
      const { error } = await supabase.from('equipes').update(updates).eq('id', id)
      if (error) throw error
      const title = current?.nom ?? String(id)
      for (const key of Object.keys(updates) as (keyof typeof updates)[]) {
        const oldVal = current ? current[key] ?? null : null
        const newVal = updates[key] ?? null
        if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue
        await logActivity({
          produit_id: null, action: 'update', target: String(id), title, field: String(key),
          old_value: JSON.stringify(oldVal), new_value: JSON.stringify(newVal), entity: 'equipe',
        })
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipes'] }),
  })
}

export function useDeleteEquipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const current = qc.getQueryData<Equipe[]>(['equipes'])?.find(e => e.id === id)
      // Désaffecter les utilisateurs d'abord
      await supabase.from('user_profiles').update({ equipe_id: null }).eq('equipe_id', id)
      const { error } = await supabase.from('equipes').delete().eq('id', id)
      if (error) throw error
      await logActivity({
        produit_id: null, action: 'delete', target: String(id), title: current?.nom ?? String(id),
        old_value: current ? JSON.stringify(current) : null, entity: 'equipe',
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipes'] })
      qc.invalidateQueries({ queryKey: ['utilisateurs'] })
    },
  })
}

// ── Utilisateurs (remplace l'ancienne table membres) ──────────
async function fetchUtilisateurs(): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .order('trigramme', { nullsFirst: false })
  if (error) throw error
  return (data ?? []) as UserProfile[]
}

export function useUtilisateurs() {
  return useQuery({ queryKey: ['utilisateurs'], queryFn: fetchUtilisateurs, staleTime: 60_000 })
}

// ── Dernière connexion (auth.users, admin uniquement) ───────────
export function useLastSignInDates(enabled = true) {
  return useQuery({
    queryKey: ['last-sign-in-dates'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_last_sign_in_dates')
      if (error) throw error
      const map = new Map<string, string | null>()
      ;(data ?? []).forEach((r: { user_id: string; last_sign_in_at: string | null }) => map.set(r.user_id, r.last_sign_in_at))
      return map
    },
    staleTime: 60_000,
    enabled,
  })
}

// Emails des utilisateurs (admin uniquement) — pour déclencher l'envoi d'un
// lien de réinitialisation de mot de passe à la place d'un utilisateur.
export function useUserEmails(enabled = true) {
  return useQuery({
    queryKey: ['user-emails'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_user_emails')
      if (error) throw error
      const map = new Map<string, string | null>()
      ;(data ?? []).forEach((r: { user_id: string; email: string | null }) => map.set(r.user_id, r.email))
      return map
    },
    staleTime: 60_000,
    enabled,
  })
}

// ── Sync equipe sur les tâches ────────────────────────────────
export function useSyncEquipesTaches() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const [{ data: equipes }, { data: utilisateurs }, { data: taches }] = await Promise.all([
        supabase.from('equipes').select('id, nom').eq('actif', true),
        supabase.from('user_profiles').select('trigramme, equipe_id').not('trigramme', 'is', null),
        // Une US peut porter plusieurs trigrammes séparés par virgule dans
        // assigne_a : un simple .in('assigne_a', trigrammes) ne matcherait
        // jamais ces lignes-là (comparaison exacte), d'où un filtrage côté
        // client via parseAssignees puis un .in('id_tache', ids) ciblé.
        supabase.from('taches').select('id_tache, assigne_a').not('assigne_a', 'is', null),
      ])
      if (!equipes || !utilisateurs || !taches) return { updated: 0 }

      for (const eq of equipes) {
        const trigrammes = new Set(
          (utilisateurs as { trigramme: string | null; equipe_id: number | null }[])
            .filter(u => u.equipe_id === eq.id && u.trigramme)
            .map(u => u.trigramme as string)
        )
        if (!trigrammes.size) continue
        const ids = (taches as { id_tache: string; assigne_a: string | null }[])
          .filter(t => parseAssignees(t.assigne_a).some(tri => trigrammes.has(tri)))
          .map(t => t.id_tache)
        if (!ids.length) continue
        await supabase.from('taches').update({ equipe: eq.nom }).in('id_tache', ids)
      }
      return { ok: true }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taches'] }),
  })
}
