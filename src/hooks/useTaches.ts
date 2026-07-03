import { logActivity } from '@/hooks/useActivityLog'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProduit } from '@/contexts/ProduitContext'
import type { Tache } from '@/types'

// ── Fetch ──────────────────────────────────────────────────────
export function useTaches() {
  const { produitActif } = useProduit()
  const produitId = produitActif?.id ?? null

  return useQuery({
    queryKey: ['taches', produitId],
    queryFn: async () => {
      let q = supabase.from('taches').select('*').order('id_tache')
      if (produitId) q = q.eq('produit_id', produitId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Tache[]
    },
    staleTime: 30_000,
  })
}

export function useAllTaches() {
  return useQuery({
    queryKey: ['taches', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('taches').select('*').order('id_tache')
      if (error) throw error
      return (data ?? []) as Tache[]
    },
    staleTime: 30_000,
  })
}

export function useTachesByProduit(produitId: number) {
  return useQuery({
    queryKey: ['taches', produitId],
    queryFn: async () => {
      const { data, error } = await supabase.from('taches').select('*').order('id_tache').eq('produit_id', produitId)
      if (error) throw error
      return (data ?? []) as Tache[]
    },
    staleTime: 30_000,
  })
}

// ── Create ─────────────────────────────────────────────────────
export function useCreateTache() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async (payload: Partial<Tache>) => {
      if (!produitActif) throw new Error('Aucun produit sélectionné')

      // Générer id_tache unique au produit
      const { data: all } = await supabase
        .from('taches')
        .select('id_tache')
        .eq('produit_id', produitActif.id)
        .like('id_tache', 'US-%')
      const nums = (all ?? []).map(t => parseInt(t.id_tache.replace('US-', ''), 10)).filter(Boolean)
      const next = nums.length ? Math.max(...nums) + 1 : 1
      const id_tache = `US-${String(next).padStart(3, '0')}`

      const { data, error } = await supabase
        .from('taches')
        .insert({
          ...payload,
          id_tache,
          produit_id: produitActif.id,
          statut: payload.statut ?? 'À faire',
          iteration: payload.iteration ?? 1,
        })
        .select()
        .single()
      if (error) throw error
      return data as Tache
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['taches', produitActif?.id ?? null] })
      if (data && produitActif) {
        logActivity({ produit_id: produitActif.id, action: 'create', target: data.id_tache, title: data.titre })
      }
    },
  })
}

// ── Update ─────────────────────────────────────────────────────
export function useUpdateTache() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async ({ id_tache, updates }: { id_tache: string; updates: Partial<Tache> }) => {
      const produitId = produitActif?.id ?? null
      const current = qc.getQueryData<Tache[]>(['taches', produitId])?.find(t => t.id_tache === id_tache)
      let query = supabase.from('taches').update(updates).eq('id_tache', id_tache)
      // id_tache n'est pas garanti unique entre produits (duplication historique) —
      // on scope systématiquement par produit actif pour ne jamais toucher une
      // tâche homonyme d'un autre produit (et éviter un 403 RLS sur du multi-lignes).
      if (produitId) query = query.eq('produit_id', produitId)
      const { error } = await query
      if (error) throw error
      if (!produitId) return
      if (updates.statut && current?.statut !== updates.statut) {
        logActivity({ produit_id: produitId, action: 'status', target: id_tache, title: current?.titre ?? '', field: 'statut', old_value: current?.statut, new_value: updates.statut })
      } else {
        const fields = Object.keys(updates).filter(k => k !== 'statut')
        if (fields.length > 0) {
          logActivity({ produit_id: produitId, action: 'update', target: id_tache, title: current?.titre ?? '', field: fields.join(', ') })
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taches', produitActif?.id ?? null] }),
  })
}

// ── Delete ─────────────────────────────────────────────────────
export function useDeleteTache() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async (id_tache: string) => {
      const produitId = produitActif?.id ?? null
      const current = qc.getQueryData<Tache[]>(['taches', produitId])?.find(t => t.id_tache === id_tache)
      let query = supabase.from('taches').delete().eq('id_tache', id_tache)
      if (produitId) query = query.eq('produit_id', produitId)
      const { error } = await query
      if (error) throw error
      if (produitId) logActivity({ produit_id: produitId, action: 'delete', target: id_tache, title: current?.titre ?? '' })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taches', produitActif?.id ?? null] }),
  })
}

// ── Create sous-tâche ──────────────────────────────────────────
export function useCreateSousTache() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async ({ parentId, payload }: { parentId: string; payload: Partial<Tache> }) => {
      if (!produitActif) throw new Error('Aucun produit sélectionné')

      const { data: subs } = await supabase
        .from('taches')
        .select('id_tache')
        .like('id_tache', `${parentId}.%`)
        .eq('produit_id', produitActif.id)
      const nums = (subs ?? []).map(s => parseInt(s.id_tache.split('.')[1] ?? '0', 10))
      const nextNum = nums.length ? Math.max(...nums) + 1 : 1
      const id_tache = `${parentId}.${nextNum}`

      const { data, error } = await supabase
        .from('taches')
        .insert({
          ...payload,
          id_tache,
          parent_id: parentId,
          produit_id: produitActif.id,
          statut: 'À faire',
          iteration: payload.iteration ?? 1,
        })
        .select()
        .single()
      if (error) throw error
      return data as Tache
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taches', produitActif?.id ?? null] }),
  })
}
