import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProduit } from '@/contexts/ProduitContext'
import { useCreateTache } from '@/hooks/useTaches'
import type { Statut } from '@/types'

export interface PostitGroup {
  id: number
  produit_id: number
  nom: string
  x: number
  y: number
  width: number
  height: number
  couleur: string | null
  created_at: string
}

export interface Postit {
  id: number
  produit_id: number
  id_tache: string
  group_id: number | null
  x: number
  y: number
  couleur: string
  created_at: string
  titre: string
  statut: Statut
}

// Un post-it n'a pas de FK dure vers `taches` (id_tache n'a pas de contrainte
// UNIQUE en base, voir migration 0030) — jointure faite ici côté client
// plutôt que via l'embedding PostgREST (qui exige une FK déclarée).
export function usePostits() {
  const { produitActif } = useProduit()
  const produitId = produitActif?.id ?? null

  return useQuery({
    queryKey: ['postits', produitId],
    queryFn: async () => {
      if (!produitId) return []
      const { data: rows, error } = await supabase.from('tache_postit').select('*').eq('produit_id', produitId)
      if (error) throw error
      const ids = (rows ?? []).map(r => r.id_tache)
      if (!ids.length) return []
      // `id_tache` n'est unique QUE par produit (généré par produit dans
      // useCreateTache) — sans ce filtre, une US-001 d'un autre produit
      // écrase la bonne ligne dans la Map ci-dessous.
      const { data: taches, error: e2 } = await supabase.from('taches').select('id_tache, titre, statut').eq('produit_id', produitId).in('id_tache', ids)
      if (e2) throw e2
      const byId = new Map((taches ?? []).map(t => [t.id_tache, t]))
      return (rows ?? []).map(r => ({
        ...r,
        titre: byId.get(r.id_tache)?.titre ?? '(tâche introuvable)',
        statut: byId.get(r.id_tache)?.statut ?? 'À faire',
      })) as Postit[]
    },
    staleTime: 10_000,
    enabled: !!produitId,
  })
}

export function usePostitGroups() {
  const { produitActif } = useProduit()
  const produitId = produitActif?.id ?? null

  return useQuery({
    queryKey: ['postit_groups', produitId],
    queryFn: async () => {
      if (!produitId) return []
      const { data, error } = await supabase.from('postit_groups').select('*').eq('produit_id', produitId)
      if (error) throw error
      return (data ?? []) as PostitGroup[]
    },
    staleTime: 10_000,
    enabled: !!produitId,
  })
}

// Crée la tâche minimaliste sous-jacente (réutilise useCreateTache — même
// génération d'ID US-XXX que le reste de l'appli, epic vide volontairement :
// c'est ce qui la rend visible dans le filtre "Epic manquant" de la liste)
// puis sa ligne de présentation sur le board.
export function useCreatePostit() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()
  const createTache = useCreateTache()

  return useMutation({
    mutationFn: async ({ titre, x, y, couleur, groupId }: { titre: string; x: number; y: number; couleur: string; groupId?: number | null }) => {
      if (!produitActif) throw new Error('Aucun produit sélectionné')
      const tache = await createTache.mutateAsync({ titre, epic: '', statut: 'À faire' })
      const { data, error } = await supabase
        .from('tache_postit')
        .insert({ produit_id: produitActif.id, id_tache: tache.id_tache, x, y, couleur, group_id: groupId ?? null })
        .select()
        .single()
      if (error) throw error
      return { ...data, titre: tache.titre, statut: tache.statut } as Postit
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['postits', produitActif?.id] })
      qc.invalidateQueries({ queryKey: ['taches', produitActif?.id] })
    },
  })
}

export function useUpdatePostitColor() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async ({ id, couleur }: { id: number; couleur: string }) => {
      const { error } = await supabase.from('tache_postit').update({ couleur }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['postits', produitActif?.id] }),
  })
}

export function useUpdatePostitPosition() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async ({ id, x, y, groupId }: { id: number; x: number; y: number; groupId?: number | null }) => {
      const updates: Record<string, unknown> = { x, y }
      if (groupId !== undefined) updates.group_id = groupId
      const { error } = await supabase.from('tache_postit').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['postits', produitActif?.id] }),
  })
}

// Retire le post-it du board — la tâche sous-jacente n'est PAS supprimée,
// elle reste visible dans la liste normale (filtre "Epic manquant").
export function useDeletePostit() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('tache_postit').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['postits', produitActif?.id] }),
  })
}

export function useCreateGroup() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async ({ nom, x, y }: { nom: string; x: number; y: number }) => {
      if (!produitActif) throw new Error('Aucun produit sélectionné')
      const { data, error } = await supabase
        .from('postit_groups')
        .insert({ produit_id: produitActif.id, nom, x, y })
        .select()
        .single()
      if (error) throw error
      return data as PostitGroup
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['postit_groups', produitActif?.id] }),
  })
}

export function useUpdateGroup() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Pick<PostitGroup, 'nom' | 'x' | 'y' | 'width' | 'height'>> }) => {
      const { error } = await supabase.from('postit_groups').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['postit_groups', produitActif?.id] }),
  })
}

export function useDeleteGroup() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('postit_groups').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['postit_groups', produitActif?.id] })
      qc.invalidateQueries({ queryKey: ['postits', produitActif?.id] }) // group_id remis à null (ON DELETE SET NULL)
    },
  })
}

// Vide le board (tous les post-it + tous les groupes du produit) pour
// repartir d'un board propre. Les tâches sous-jacentes ne sont PAS
// supprimées — même logique que le retrait d'un post-it individuel, elles
// restent dans le backlog normal (filtre "Epic manquant").
export function useClearBoard() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async () => {
      if (!produitActif) throw new Error('Aucun produit sélectionné')
      const { error: e1 } = await supabase.from('tache_postit').delete().eq('produit_id', produitActif.id)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('postit_groups').delete().eq('produit_id', produitActif.id)
      if (e2) throw e2
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['postits', produitActif?.id] })
      qc.invalidateQueries({ queryKey: ['postit_groups', produitActif?.id] })
    },
  })
}
