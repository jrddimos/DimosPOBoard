import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

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
      const { error } = await supabase.from('periodes_fermeture').insert(p)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['periodes_fermeture', v.annee] }),
  })
}

export function useDeletePeriodeFermeture() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, annee: _annee }: { id: number; annee: number }) => {
      const { error } = await supabase.from('periodes_fermeture').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['periodes_fermeture', v.annee] }),
  })
}
