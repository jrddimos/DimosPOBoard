import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProduit } from '@/contexts/ProduitContext'
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
export function useUpsertSprint() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async (sprint: Partial<Sprint> & { numero: string }) => {
      if (!produitActif) throw new Error('Aucun produit sélectionné')
      const { error } = await supabase
        .from('sprints')
        .upsert(
          { ...sprint, produit_id: produitActif.id },
          { onConflict: 'numero,produit_id' }
        )
      if (error) throw error
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
      const { error } = await supabase.from('sprints').delete().eq('numero', numero)
      if (error) throw error
    },
    onSuccess: () => {
      const pid = produitActif?.id ?? null
      qc.invalidateQueries({ queryKey: ['sprints', pid] })
    },
  })
}
