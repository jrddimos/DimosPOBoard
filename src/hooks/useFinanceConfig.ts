import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/hooks/useActivityLog'

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
      // Singleton (id toujours 1) — pas de undo/restore par ligne possible,
      // juste une entrée par champ modifié pour la traçabilité (target fixe).
      const current = qc.getQueryData<FinanceConfig>(['finance_config'])
      const { error } = await supabase
        .from('finance_config')
        .upsert({ id: 1, ...updates, updated_at: new Date().toISOString() })
      if (error) throw error
      for (const key of Object.keys(updates) as (keyof typeof updates)[]) {
        const oldVal = current ? current[key] ?? null : null
        const newVal = updates[key] ?? null
        if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue
        await logActivity({
          produit_id: null, action: 'update', target: '1', title: 'Configuration finance', field: String(key),
          old_value: JSON.stringify(oldVal), new_value: JSON.stringify(newVal), entity: 'finance_config',
        })
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance_config'] }),
  })
}
