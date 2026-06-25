import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { RagConfig } from '@/types'
import { RAG_CONFIG_DEFAULT } from '@/types'

interface AppSettings {
  id: number
  rag_config_default: RagConfig | null
}

async function fetchAppSettings(): Promise<AppSettings | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw error
  return data as AppSettings | null
}

export function useAppSettings() {
  const { data, ...rest } = useQuery({
    queryKey: ['app_settings'],
    queryFn: fetchAppSettings,
    staleTime: 60_000,
  })
  return {
    ...rest,
    settings: data,
    ragConfigDefault: data?.rag_config_default ?? RAG_CONFIG_DEFAULT,
  }
}

export function useUpdateAppSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (updates: Partial<Omit<AppSettings, 'id'>>) => {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ id: 1, ...updates })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app_settings'] }),
  })
}
