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

// Calcul de capacité (Plan de charges, widget "Charge équipe") — dates +
// trigramme seulement, jamais `label` (motif potentiellement sensible,
// cf. migration 0070) : lit la vue `absences_capacite`, visible de tous,
// plutôt que la table `absences` (désormais restreinte à admin/PO/soi-même).
export type AbsenceCapacite = Pick<Absence, 'id' | 'trigramme' | 'annee' | 'date_debut' | 'date_fin'>

export function useAbsencesCapacite(annee: number) {
  return useQuery({
    queryKey: ['absences_capacite', annee],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('absences_capacite').select('*')
        .eq('annee', annee).order('date_debut')
      if (error) throw error
      return (data ?? []) as AbsenceCapacite[]
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
