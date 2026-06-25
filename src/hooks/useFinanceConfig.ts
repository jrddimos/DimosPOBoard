import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface EquipeTjm {
  equipe_id: number
  tjm:       number  // € / jour
}

export interface TrimConfig {
  id:           string  // ex: "Q3-2026"
  label:        string  // ex: "Q3 2026"
  jours_ouvres: number
}

export interface FinanceConfig {
  id:             number
  jours_par_trim: number
  equipe_tjms:    EquipeTjm[]
  trimestres:     TrimConfig[]
  updated_at:     string
}

const DEFAULT_CONFIG: Omit<FinanceConfig, 'id' | 'updated_at'> = {
  jours_par_trim: 65,
  equipe_tjms:    [],
  trimestres:     [],
}

const FALLBACK: FinanceConfig = {
  id: 1,
  ...DEFAULT_CONFIG,
  updated_at: '',
}

async function fetchConfig(): Promise<FinanceConfig> {
  const { data, error } = await supabase
    .from('finance_config')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw error
  // Ligne absente : on travaille avec les valeurs par défaut jusqu'au premier Enregistrer
  return (data as FinanceConfig) ?? FALLBACK
}

export function useFinanceConfig() {
  return useQuery({
    queryKey: ['finance_config'],
    queryFn:  fetchConfig,
    staleTime: 5 * 60_000,
    select: (data) => ({
      ...DEFAULT_CONFIG,
      ...data,
      equipe_tjms: (data.equipe_tjms ?? []) as EquipeTjm[],
      trimestres:  (data.trimestres  ?? []) as TrimConfig[],
    }),
  })
}

export function useUpdateFinanceConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (updates: { jours_par_trim?: number; equipe_tjms?: EquipeTjm[]; trimestres?: TrimConfig[] }) => {
      const { error } = await supabase
        .from('finance_config')
        .upsert({ id: 1, ...updates, updated_at: new Date().toISOString() })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance_config'] }),
  })
}
