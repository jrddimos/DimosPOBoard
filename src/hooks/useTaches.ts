import { logActivity } from '@/hooks/useActivityLog'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProduit } from '@/contexts/ProduitContext'
import { parseCriteres, serializeCriteres } from '@/lib/utils'
import type { Tache } from '@/types'

// ── Fetch ──────────────────────────────────────────────────────
export function useTaches() {
  const { produitActif } = useProduit()
  const produitId = produitActif?.id ?? null

  return useQuery({
    queryKey: ['taches', produitId],
    queryFn: async () => {
      // ordre_backlog d'abord (réordonnancement manuel, NULL = jamais
      // réordonnée → après, par id_tache) : c'est cet ordre qui pilote la
      // numérotation d'affichage 1.1, 1.2… dans toutes les vues.
      let q = supabase.from('taches').select('*')
        .order('ordre_backlog', { ascending: true, nullsFirst: false })
        .order('id_tache')
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
      const { data, error } = await supabase.from('taches').select('*')
        .order('ordre_backlog', { ascending: true, nullsFirst: false })
        .order('id_tache')
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
      const { data, error } = await supabase.from('taches').select('*')
        .order('ordre_backlog', { ascending: true, nullsFirst: false })
        .order('id_tache')
        .eq('produit_id', produitId)
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

      // Lire le numéro max puis insérer laisse une fenêtre de course entre
      // deux créations quasi simultanées sur le même produit (ex: plusieurs
      // personnes qui cliquent "+" sur le board Fast Task en même temps) :
      // les deux peuvent lire le même "prochain numéro" avant que l'un des
      // deux inserts ne soit committé. La contrainte UNIQUE(produit_id,
      // id_tache) (migration 0037) transforme cette collision silencieuse en
      // erreur détectable — on relit alors le nouveau max et on réessaie,
      // au lieu de faire échouer la création pour l'utilisateur.
      for (let attempt = 0; attempt < 5; attempt++) {
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
        if (!error) return data as Tache
        if (error.code !== '23505') throw error
        // Collision détectée (id_tache déjà pris entre-temps) : on réessaie
        // avec le numéro suivant, sauf à la dernière tentative.
        if (attempt === 4) throw error
      }
      throw new Error('Impossible de générer un identifiant de tâche unique après plusieurs tentatives')
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

      // Cascade "critère lié" : une sous-tâche qui passe à Fait peut couvrir
      // un critère d'acceptation de sa tâche parente (cf. SousTacheModal).
      // On ne coche ce critère que si TOUTES les sous-tâches rattachées au
      // même critère sont Fait — jamais l'inverse (une sous-tâche Fait n'est
      // pas rouverte, une nouvelle itération de la tâche prend le relais).
      if (updates.statut === 'Fait') {
        const { data: self } = await supabase.from('taches').select('parent_id, critere_lie_id')
          .eq('id_tache', id_tache).eq('produit_id', produitId).single()
        if (self?.parent_id && self?.critere_lie_id) {
          const { data: siblings } = await supabase.from('taches').select('id_tache, statut')
            .eq('parent_id', self.parent_id).eq('critere_lie_id', self.critere_lie_id).eq('produit_id', produitId)
          const allDone = (siblings ?? []).every(s => s.id_tache === id_tache || s.statut === 'Fait')
          if (allDone) {
            const { data: iters } = await supabase.from('tache_iterations').select('id, criteres')
              .eq('id_tache', self.parent_id).eq('produit_id', produitId).order('numero', { ascending: false }).limit(1)
            const latestIter = iters?.[0]
            const rawCriteres = latestIter
              ? latestIter.criteres
              : (await supabase.from('taches').select('criteres').eq('id_tache', self.parent_id).eq('produit_id', produitId).single()).data?.criteres ?? null

            const items = parseCriteres(rawCriteres)
            if (items.some(i => i.id === self.critere_lie_id && !i.checked)) {
              const next = serializeCriteres(items.map(i => i.id === self.critere_lie_id ? { ...i, checked: true } : i))
              if (latestIter) await supabase.from('tache_iterations').update({ criteres: next }).eq('id', latestIter.id)
              // Synchronisé sur la tâche parente dans tous les cas : que la
              // source soit la dernière itération ou la tâche elle-même,
              // c'est `taches.criteres` que lisent le backlog et les vues
              // filtrées (même logique que syncToTache ailleurs).
              await supabase.from('taches').update({ criteres: next }).eq('id_tache', self.parent_id).eq('produit_id', produitId)
            }
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['taches', produitActif?.id ?? null] })
      qc.invalidateQueries({ queryKey: ['tache_iterations'] })
    },
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

      // Garde-fou : une tâche liée (directement ou via une itération) à un
      // sprint clôturé ne doit plus pouvoir être supprimée — les données de
      // sprints clôturés servent de référence figée pour le dashboard/Plan
      // de charges, la suppression fausserait rétroactivement ces chiffres.
      if (produitId) {
        const { data: closed } = await supabase.from('sprints').select('numero').eq('statut', 'cloture').eq('produit_id', produitId)
        const closedSet = new Set((closed ?? []).map(s => s.numero))
        if (closedSet.size > 0) {
          const { data: tacheRow } = await supabase.from('taches').select('sprint_debut').eq('id_tache', id_tache).eq('produit_id', produitId).single()
          if (tacheRow?.sprint_debut && closedSet.has(tacheRow.sprint_debut)) {
            throw new Error(`Impossible de supprimer ${id_tache} : elle appartient au sprint clôturé ${tacheRow.sprint_debut}.`)
          }
          const { data: iters } = await supabase.from('tache_iterations').select('sprint').eq('id_tache', id_tache).eq('produit_id', produitId)
          const closedIter = (iters ?? []).find(i => i.sprint && closedSet.has(i.sprint))
          if (closedIter) {
            throw new Error(`Impossible de supprimer ${id_tache} : une de ses itérations appartient au sprint clôturé ${closedIter.sprint}.`)
          }
        }
      }

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
      // Dernier segment, pas le 2e (`split('.')[1]`) : quand le parent est
      // lui-même une sous-tâche (id du type "US-005.2"), [1] retombait
      // systématiquement sur le "2" du parent au lieu du suffixe du sibling
      // — les nums calculés étaient donc tous égaux, produisant un id déjà
      // pris dès la 2e sous-tâche (collision silencieuse) puis un 409 sur la
      // 3e (violation de la contrainte unique id_tache+produit_id).
      const nums = (subs ?? []).map(s => parseInt(s.id_tache.split('.').pop() ?? '0', 10))
      let nextNum = nums.length ? Math.max(...nums) + 1 : 1

      // Filet de sécurité contre une vraie collision concurrente (double
      // clic, deux onglets…) : retente avec le numéro suivant plutôt que de
      // remonter un 409 à l'utilisateur.
      for (let attempt = 0; attempt < 5; attempt++) {
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
        if (!error) return data as Tache
        if (error.code !== '23505') throw error
        nextNum++
      }
      throw new Error("Impossible de générer un identifiant de sous-tâche unique")
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['taches', produitActif?.id ?? null] }),
  })
}
