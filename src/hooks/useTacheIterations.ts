import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProduit } from '@/contexts/ProduitContext'
import { useUpdateTache } from '@/hooks/useTaches'
import type { Statut, Tache } from '@/types'

export interface TacheIteration {
  id: number
  produit_id: number
  id_tache: string
  numero: number
  objectif: string | null
  criteres: string | null
  effort_j: number | null
  assigne_a: string | null
  sprint: string | null
  statut: Statut
  resultat: string | null
  commentaire: string | null
  effort_realise_j: number | null
  created_at: string
  closed_at: string | null
}

const STATUTS_TERMINAUX: Statut[] = ['Fait', 'Bloqué', 'Transféré']

// id_tache n'est unique qu'au sein d'un produit (UNIQUE(produit_id, id_tache),
// cf. migration 0037) — deux produits peuvent avoir chacun une tâche
// "US-007" ; sans le filtre produit_id, cette requête mélangerait leurs
// itérations (même bug déjà rencontré et corrigé sur usePostits()).
export function useTacheIterations(id_tache: string | null, produitId: number | null) {
  return useQuery({
    queryKey: ['tache_iterations', id_tache, produitId],
    queryFn: async () => {
      if (!id_tache || !produitId) return []
      const { data, error } = await supabase
        .from('tache_iterations')
        .select('*')
        .eq('id_tache', id_tache)
        .eq('produit_id', produitId)
        .order('numero')
      if (error) throw error
      return (data ?? []) as TacheIteration[]
    },
    staleTime: 10_000,
    enabled: !!id_tache && !!produitId,
  })
}

// Crée l'itération suivante (numéro = max existant + 1 pour cette tâche),
// PUIS recopie effort/assigné/sprint/statut sur la tâche parente : le Kanban
// Sprint et les tableaux de bord ne lisent que les champs de la tâche
// elle-même (aucune notion de sous-enregistrement), donc sans cette
// synchronisation une itération resterait invisible partout ailleurs que le
// panneau de détail. Repasse aussi la tâche en "En cours" — une nouvelle
// itération, c'est une reprise du travail.
export function useCreateIteration() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()
  const updateTache = useUpdateTache()

  return useMutation({
    mutationFn: async (payload: {
      id_tache: string
      objectif: string
      criteres: string
      effort_j: number
      assigne_a: string | null
      sprint: string
    }) => {
      if (!produitActif) throw new Error('Aucun produit sélectionné')
      const { data: existing } = await supabase
        .from('tache_iterations')
        .select('numero')
        .eq('id_tache', payload.id_tache)
        .eq('produit_id', produitActif.id)
      const rows = existing ?? []

      // Aucune itération encore créée pour cette tâche : on fige l'état
      // ACTUEL de la tâche comme itération 1 avant de le remplacer par la
      // nouvelle itération — sinon le contenu affiché sous "Itération 1"
      // changerait rétroactivement à chaque itération suivante, puisque ces
      // champs (sprint/effort/assigné) vivent normalement sur la tâche
      // elle-même et sont écrasés à chaque synchronisation ci-dessous.
      if (rows.length === 0) {
        const { data: currentTache, error: tacheError } = await supabase
          .from('taches').select('*')
          .eq('id_tache', payload.id_tache).eq('produit_id', produitActif.id).single()
        if (tacheError) throw tacheError
        if (currentTache) {
          const { error: freezeError } = await supabase.from('tache_iterations').insert({
            produit_id: produitActif.id, id_tache: payload.id_tache, numero: 1,
            objectif: null, criteres: currentTache.criteres,
            effort_j: currentTache.effort_j, assigne_a: currentTache.assigne_a,
            sprint: currentTache.sprint_debut ?? currentTache.sprint ?? null,
            statut: currentTache.statut, resultat: null,
            commentaire: currentTache.commentaire,
          })
          if (freezeError) throw freezeError
        }
      }

      const numero = rows.reduce((m, r) => Math.max(m, r.numero), 1) + 1

      const { data, error } = await supabase
        .from('tache_iterations')
        .insert({ ...payload, produit_id: produitActif.id, numero, statut: 'À faire' })
        .select()
        .single()
      if (error) throw error

      await updateTache.mutateAsync({
        id_tache: payload.id_tache,
        updates: {
          effort_j: payload.effort_j,
          assigne_a: payload.assigne_a,
          sprint: payload.sprint || null,
          sprint_debut: payload.sprint || null,
          statut: 'En cours',
        },
      })

      return data as TacheIteration
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['tache_iterations', data.id_tache] })
      qc.invalidateQueries({ queryKey: ['taches', produitActif?.id ?? null] })
      qc.invalidateQueries({ queryKey: ['tache_iterations_counts', produitActif?.id ?? null] })
      qc.invalidateQueries({ queryKey: ['tache_iterations_all', produitActif?.id ?? null] })
    },
  })
}

// `syncToTache` recopie effort/assigné/sprint/statut sur la tâche parente,
// comme à la création (useCreateIteration) — à utiliser uniquement quand on
// édite la DERNIÈRE itération (celle qui représente l'état actuel du
// travail) : le Kanban Sprint et les dashboards ne lisent que les champs de
// la tâche elle-même, sans notion d'itération.
export function useUpdateIteration() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()
  const updateTache = useUpdateTache()

  return useMutation({
    mutationFn: async ({ id, id_tache, updates, syncToTache }: {
      id: number
      id_tache: string
      updates: Partial<Pick<TacheIteration, 'objectif' | 'criteres' | 'effort_j' | 'assigne_a' | 'sprint' | 'statut' | 'resultat' | 'commentaire'>>
      syncToTache?: boolean
    }) => {
      const patch: Record<string, unknown> = { ...updates }
      if (updates.statut && STATUTS_TERMINAUX.includes(updates.statut)) patch.closed_at = new Date().toISOString()
      const { error } = await supabase.from('tache_iterations').update(patch).eq('id', id)
      if (error) throw error

      if (syncToTache) {
        const tacheUpdates: Partial<Tache> = {}
        if ('effort_j' in updates) tacheUpdates.effort_j = updates.effort_j ?? 0
        if ('assigne_a' in updates) tacheUpdates.assigne_a = updates.assigne_a
        if ('sprint' in updates) { tacheUpdates.sprint = updates.sprint || null; tacheUpdates.sprint_debut = updates.sprint || null }
        if ('statut' in updates) tacheUpdates.statut = updates.statut
        if (Object.keys(tacheUpdates).length > 0) {
          await updateTache.mutateAsync({ id_tache, updates: tacheUpdates })
        }
      }

      return id_tache
    },
    onSuccess: (id_tache) => {
      qc.invalidateQueries({ queryKey: ['tache_iterations', id_tache] })
      qc.invalidateQueries({ queryKey: ['taches', produitActif?.id ?? null] })
      qc.invalidateQueries({ queryKey: ['tache_iterations_counts', produitActif?.id ?? null] })
      qc.invalidateQueries({ queryKey: ['tache_iterations_all', produitActif?.id ?? null] })
    },
  })
}

// Nombre d'itérations (lignes tache_iterations, y compris la 1ʳᵉ — figée en
// base dès qu'une 2ᵉ est créée, voir useCreateIteration) par tâche, pour tout
// le produit — utilisé pour le petit compteur affiché dans l'arbre du
// backlog sans faire une requête par tâche.
export function useIterationCounts(produitId: number | null) {
  return useQuery({
    queryKey: ['tache_iterations_counts', produitId],
    queryFn: async () => {
      if (!produitId) return new Map<string, number>()
      const { data, error } = await supabase.from('tache_iterations').select('id_tache').eq('produit_id', produitId)
      if (error) throw error
      const counts = new Map<string, number>()
      for (const row of data ?? []) counts.set(row.id_tache, (counts.get(row.id_tache) ?? 0) + 1)
      return counts
    },
    staleTime: 30_000,
    enabled: !!produitId,
  })
}

export function useDeleteIteration() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async ({ id, id_tache }: { id: number; id_tache: string }) => {
      const { error } = await supabase.from('tache_iterations').delete().eq('id', id)
      if (error) throw error
      return id_tache
    },
    onSuccess: (id_tache) => {
      qc.invalidateQueries({ queryKey: ['tache_iterations', id_tache] })
      qc.invalidateQueries({ queryKey: ['tache_iterations_counts', produitActif?.id ?? null] })
      qc.invalidateQueries({ queryKey: ['tache_iterations_all', produitActif?.id ?? null] })
    },
  })
}

// Toutes les itérations du produit, groupées par id_tache — pour calculer
// l'éligibilité au planning de sprint (US sans itération 'À faire' déjà
// planifiée) et afficher l'itération jouée pour un sprint donné, sans une
// requête par tâche (utilisé par le picker de sprint, Setup > Sprints).
export function useProduitIterations(produitId: number | null) {
  return useQuery({
    queryKey: ['tache_iterations_all', produitId],
    queryFn: async () => {
      if (!produitId) return new Map<string, TacheIteration[]>()
      const { data, error } = await supabase
        .from('tache_iterations').select('*')
        .eq('produit_id', produitId)
        .order('id_tache').order('numero')
      if (error) throw error
      const map = new Map<string, TacheIteration[]>()
      for (const row of (data ?? []) as TacheIteration[]) {
        const arr = map.get(row.id_tache)
        if (arr) arr.push(row); else map.set(row.id_tache, [row])
      }
      return map
    },
    staleTime: 10_000,
    enabled: !!produitId,
  })
}

// Clôture d'un sprint sur une US qui a démarré mais n'est pas terminée :
// fige l'itération en cours avec le temps réellement passé sur CE sprint
// (statut 'Transféré', jamais choisi manuellement), puis crée l'itération
// suivante avec le reste à faire (jamais négatif) dans le sprint de
// destination (ou le backlog si destSprint est null). Comme
// useCreateIteration, fige d'abord l'état actuel de la tâche comme
// itération 1 si aucune itération n'existe encore.
export function useTransferToNextIteration() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()
  const updateTache = useUpdateTache()

  return useMutation({
    mutationFn: async (payload: {
      id_tache: string
      tempsPasse: number
      closingSprint: string
      destSprint: string | null
      // État des critères d'acceptation cochés dans la modal de clôture :
      // figé tel quel sur l'itération transférée (photo de fin de sprint),
      // et reporté sur la nouvelle itération + la tâche (reste à faire).
      criteres?: string | null
    }) => {
      if (!produitActif) throw new Error('Aucun produit sélectionné')

      const [{ data: currentTache, error: tacheError }, { data: existing, error: iterError }] = await Promise.all([
        supabase.from('taches').select('*').eq('id_tache', payload.id_tache).eq('produit_id', produitActif.id).single(),
        supabase.from('tache_iterations').select('*').eq('id_tache', payload.id_tache).eq('produit_id', produitActif.id).order('numero'),
      ])
      if (tacheError) throw tacheError
      if (iterError) throw iterError
      const iterations = (existing ?? []) as TacheIteration[]
      const criteres = payload.criteres ?? currentTache.criteres

      const closingNumero = iterations.length ? Math.max(...iterations.map(i => i.numero)) : 1
      const effortInitial = iterations.length
        ? iterations.find(i => i.numero === closingNumero)?.effort_j ?? 0
        : currentTache.effort_j ?? 0

      if (iterations.length === 0) {
        const { error: freezeError } = await supabase.from('tache_iterations').insert({
          produit_id: produitActif.id, id_tache: payload.id_tache, numero: 1,
          objectif: null, criteres,
          effort_j: currentTache.effort_j, assigne_a: currentTache.assigne_a,
          sprint: payload.closingSprint, statut: currentTache.statut,
          resultat: null, commentaire: currentTache.commentaire,
        })
        if (freezeError) throw freezeError
      }

      const { error: closeErr } = await supabase.from('tache_iterations')
        .update({ statut: 'Transféré', effort_realise_j: payload.tempsPasse, criteres, closed_at: new Date().toISOString() })
        .eq('produit_id', produitActif.id).eq('id_tache', payload.id_tache).eq('numero', closingNumero)
      if (closeErr) throw closeErr

      const reste = Math.max(0, effortInitial - payload.tempsPasse)

      const { data: newIter, error: insErr } = await supabase.from('tache_iterations')
        .insert({
          produit_id: produitActif.id, id_tache: payload.id_tache, numero: closingNumero + 1,
          objectif: null, criteres, effort_j: reste,
          assigne_a: currentTache.assigne_a, sprint: payload.destSprint, statut: 'En cours',
          resultat: null, commentaire: currentTache.commentaire,
        })
        .select()
        .single()
      if (insErr) throw insErr

      await updateTache.mutateAsync({
        id_tache: payload.id_tache,
        updates: {
          effort_j: reste,
          sprint: payload.destSprint ?? '',
          sprint_debut: payload.destSprint,
          statut: 'En cours',
          criteres,
        },
      })

      return newIter as TacheIteration
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['tache_iterations', data.id_tache] })
      qc.invalidateQueries({ queryKey: ['taches', produitActif?.id ?? null] })
      qc.invalidateQueries({ queryKey: ['tache_iterations_counts', produitActif?.id ?? null] })
      qc.invalidateQueries({ queryKey: ['tache_iterations_all', produitActif?.id ?? null] })
    },
  })
}
