import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PlanChargeLine {
  id: string
  produit_id: number
  epic: string
  assigne_a: string
  semaine: number
  annee: number
  jours: number
}

export type LineKey = { produit_id: number; epic: string; assigne_a: string }

export function usePlanCharges(annee: number) {
  return useQuery({
    queryKey: ['plan-charges', annee],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_charges')
        .select('*')
        .eq('annee', annee)
      if (error) throw error
      return (data ?? []) as PlanChargeLine[]
    },
    staleTime: 30_000,
  })
}

export function useUpsertPlanCharge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (row: Omit<PlanChargeLine, 'id'>) => {
      const { error } = await supabase
        .from('plan_charges')
        .upsert(row, { onConflict: 'produit_id,epic,assigne_a,semaine,annee' })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['plan-charges', v.annee] }),
  })
}

export function useDeletePlanChargeLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ produit_id, epic, assigne_a, annee }: LineKey & { annee: number }) => {
      const { error } = await supabase
        .from('plan_charges')
        .delete()
        .eq('produit_id', produit_id)
        .eq('epic', epic)
        .eq('assigne_a', assigne_a)
        .eq('annee', annee)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['plan-charges', v.annee] }),
  })
}
