import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/hooks/useActivityLog'

export interface PeriodeFermeture {
  id:         number
  annee:      number
  label:      string
  date_debut: string  // YYYY-MM-DD
  date_fin:   string  // YYYY-MM-DD
}

export function usePeriodesFermeture(annee: number) {
  return useQuery({
    queryKey: ['periodes_fermeture', annee],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('periodes_fermeture')
        .select('*')
        .eq('annee', annee)
        .order('date_debut')
      if (error) throw error
      return (data ?? []) as PeriodeFermeture[]
    },
    staleTime: 60_000,
  })
}

export function useCreatePeriodeFermeture() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: Omit<PeriodeFermeture, 'id'>) => {
      const { data, error } = await supabase.from('periodes_fermeture').insert(p).select().single()
      if (error) throw error
      const created = data as PeriodeFermeture
      await logActivity({ produit_id: null, action: 'create', target: String(created.id), title: created.label, entity: 'fermeture' })
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['periodes_fermeture', v.annee] }),
  })
}

export function useDeletePeriodeFermeture() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, annee }: { id: number; annee: number }) => {
      const current = qc.getQueryData<PeriodeFermeture[]>(['periodes_fermeture', annee])?.find(p => p.id === id)
      const { error } = await supabase.from('periodes_fermeture').delete().eq('id', id)
      if (error) throw error
      await logActivity({
        produit_id: null, action: 'delete', target: String(id), title: current?.label ?? String(id),
        old_value: current ? JSON.stringify(current) : null, entity: 'fermeture',
      })
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['periodes_fermeture', v.annee] }),
  })
}
