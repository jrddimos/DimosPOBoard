import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface AppNotification {
  id:         number
  user_id:    string
  produit_id: number | null
  type:       'assignation' | 'sprint_cloture' | 'tache_bloquee' | 'mention' | 'acces_demande' | 'mention_reunion' | 'mention_discussion'
  title:      string
  body:       string | null
  target:     string | null
  lu:         boolean
  created_at: string
}

export function useNotifications(userId: string | undefined) {
  return useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as AppNotification[]
    },
    enabled: !!userId,
    staleTime: 20_000,
    refetchInterval: 60_000,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: number; user_id: string }) => {
      const { error } = await supabase.from('notifications').update({ lu: true }).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['notifications', v.user_id] }),
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('notifications').update({ lu: true }).eq('user_id', userId).eq('lu', false)
      if (error) throw error
    },
    onSuccess: (_, userId) => qc.invalidateQueries({ queryKey: ['notifications', userId] }),
  })
}

export function useDeleteNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: number; user_id: string }) => {
      const { error } = await supabase.from('notifications').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['notifications', v.user_id] }),
  })
}
