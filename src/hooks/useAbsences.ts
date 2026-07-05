import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Absence {
  id:         number
  trigramme:  string
  annee:      number
  label:      string
  date_debut: string  // YYYY-MM-DD
  date_fin:   string  // YYYY-MM-DD
}

export function useAbsences(annee: number) {
  return useQuery({
    queryKey: ['absences', annee],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('absences').select('*')
        .eq('annee', annee).order('date_debut')
      if (error) throw error
      return (data ?? []) as Absence[]
    },
    staleTime: 60_000,
  })
}

export function useCreateAbsence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: Omit<Absence, 'id'>) => {
      const { error } = await supabase.from('absences').insert(a)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['absences', v.annee] }),
  })
}

export function useDeleteAbsence() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: number; annee: number }) => {
      const { error } = await supabase.from('absences').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['absences', v.annee] }),
  })
}
