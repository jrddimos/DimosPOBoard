import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProduit } from '@/contexts/ProduitContext'
import { logActivity } from '@/hooks/useActivityLog'
import type { Sprint } from '@/types'

// ── useSprints ─────────────────────────────────────────────────
export function useSprints() {
  const { produitActif } = useProduit()
  const produitId = produitActif?.id ?? null

  return useQuery({
    queryKey: ['sprints', produitId],
    queryFn: async () => {
      let q = supabase.from('sprints').select('*').order('numero')
      if (produitId) q = q.eq('produit_id', produitId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Sprint[]
    },
    staleTime: 30_000,
  })
}

// ── useSprintsByProduit — sprints d'un produit précis, indépendant
//    du produit actif du contexte (utile pour comparer/zoomer sur
//    un autre produit que celui sélectionné, ex: Dashboard) ────
export function useSprintsByProduit(produitId: number | null) {
  return useQuery({
    queryKey: ['sprints', produitId],
    queryFn: async () => {
      if (!produitId) return []
      const { data, error } = await supabase.from('sprints').select('*').eq('produit_id', produitId).order('numero')
      if (error) throw error
      return (data ?? []) as Sprint[]
    },
    enabled: !!produitId,
    staleTime: 30_000,
  })
}

// ── useSprintActif ─────────────────────────────────────────────
export function useSprintActif() {
  const { produitActif } = useProduit()
  const produitId = produitActif?.id ?? null

  return useQuery({
    queryKey: ['sprint-actif', produitId],
    queryFn: async () => {
      let q = supabase.from('sprints').select('*').eq('statut', 'en_cours').limit(1)
      if (produitId) q = q.eq('produit_id', produitId)
      const { data, error } = await q
      if (error) return null
      return (data && data.length > 0) ? data[0] as Sprint : null
    },
    staleTime: 15_000,
  })
}

// ── useClosedSprints ───────────────────────────────────────────
export function useClosedSprints() {
  const { produitActif } = useProduit()
  const produitId = produitActif?.id ?? null

  return useQuery({
    queryKey: ['sprints-closed', produitId],
    queryFn: async () => {
      let q = supabase.from('sprints').select('numero').eq('statut', 'cloture')
      if (produitId) q = q.eq('produit_id', produitId)
      const { data } = await q
      return (data ?? []).map(s => s.numero) as string[]
    },
    staleTime: 60_000,
  })
}

// ── useUpsertSprint ────────────────────────────────────────────
// Une seule fonction sert à la fois la création et la modification (upsert
// sur numero+produit_id) — pour journaliser correctement, on distingue les
// deux en amont via le cache : absent = création, présent = modification
// (une entrée par champ réellement changé, même principe que useUpdateTache).
export function useUpsertSprint() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async (sprint: Partial<Sprint> & { numero: string }) => {
      if (!produitActif) throw new Error('Aucun produit sélectionné')
      const pid = produitActif.id
      const current = qc.getQueryData<Sprint[]>(['sprints', pid])?.find(s => s.numero === sprint.numero)

      const { error } = await supabase
        .from('sprints')
        .upsert(
          { ...sprint, produit_id: pid },
          { onConflict: 'numero,produit_id' }
        )
      if (error) throw error

      if (!current) {
        await logActivity({ produit_id: pid, action: 'create', target: sprint.numero, title: `Sprint ${sprint.numero}`, entity: 'sprint' })
        return
      }
      for (const key of Object.keys(sprint) as (keyof Sprint)[]) {
        if (key === 'numero') continue
        const oldVal = current[key] ?? null
        const newVal = sprint[key] ?? null
        if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue
        await logActivity({
          produit_id: pid, action: 'update', target: sprint.numero, title: `Sprint ${sprint.numero}`, field: String(key),
          old_value: JSON.stringify(oldVal), new_value: JSON.stringify(newVal), entity: 'sprint',
        })
      }
    },
    onSuccess: () => {
      const pid = produitActif?.id ?? null
      qc.invalidateQueries({ queryKey: ['sprints', pid] })
      qc.invalidateQueries({ queryKey: ['sprint-actif', pid] })
      qc.invalidateQueries({ queryKey: ['sprints-closed', pid] })
    },
  })
}

// ── useDeleteSprint ────────────────────────────────────────────
export function useDeleteSprint() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async (numero: string) => {
      const pid = produitActif?.id ?? null
      const current = qc.getQueryData<Sprint[]>(['sprints', pid])?.find(s => s.numero === numero)
      let query = supabase.from('sprints').delete().eq('numero', numero)
      // `numero` seul n'est pas unique entre produits (contrainte UNIQUE sur
      // (numero, produit_id)) — sans ce scope, supprimer "S01" pouvait aussi
      // effacer le sprint homonyme d'un AUTRE produit (même bug de collision
      // déjà corrigé côté tâches via id_tache).
      if (pid) query = query.eq('produit_id', pid)
      const { error } = await query
      if (error) throw error
      if (pid) await logActivity({
        produit_id: pid, action: 'delete', target: numero, title: `Sprint ${numero}`,
        old_value: current ? JSON.stringify(current) : null, entity: 'sprint',
      })
    },
    onSuccess: () => {
      const pid = produitActif?.id ?? null
      qc.invalidateQueries({ queryKey: ['sprints', pid] })
    },
  })
}
