import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Un item de layout react-grid-layout ; `i` = clé du widget (cockpit/widgets.tsx)
export interface ViewLayoutItem { i: string; x: number; y: number; w: number; h: number }

// 'portefeuille' = vues nommées du cockpit · 'produit' = disposition du dashboard produit
export type ViewContexte = 'portefeuille' | 'produit'

export interface DashboardView {
  id: number
  user_id: string
  nom: string
  layout: ViewLayoutItem[]
  ordre: number
  contexte: ViewContexte
  created_at: string
}

export function useDashboardViews(userId: string | undefined, contexte: ViewContexte = 'portefeuille') {
  return useQuery({
    queryKey: ['dashboard_views', userId, contexte],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_dashboard_views').select('*')
        .eq('user_id', userId!).eq('contexte', contexte).order('ordre').order('id')
      if (error) throw error
      return (data ?? []) as DashboardView[]
    },
    enabled: !!userId,
  })
}

export function useCreateDashboardView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { user_id: string; nom: string; layout: ViewLayoutItem[]; contexte: ViewContexte }) => {
      const { data, error } = await supabase
        .from('user_dashboard_views').insert(payload).select().single()
      if (error) throw error
      return data as DashboardView
    },
    onSuccess: (v) => qc.invalidateQueries({ queryKey: ['dashboard_views', v.user_id] }),
  })
}

export function useUpdateDashboardView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Pick<DashboardView, 'nom' | 'layout' | 'ordre'>> }) => {
      const { data, error } = await supabase
        .from('user_dashboard_views').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data as DashboardView
    },
    onSuccess: (v) => qc.invalidateQueries({ queryKey: ['dashboard_views', v.user_id] }),
  })
}

export function useDeleteDashboardView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: number; user_id: string }) => {
      const { error } = await supabase.from('user_dashboard_views').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, { user_id }) => qc.invalidateQueries({ queryKey: ['dashboard_views', user_id] }),
  })
}
