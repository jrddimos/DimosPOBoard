import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface QuickNote {
  id: string
  user_id: string
  text: string
  done: boolean
  created_at: string
}

export function useQuickNotes(userId: string | undefined) {
  return useQuery({
    queryKey: ['quick_notes', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quick_notes')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as QuickNote[]
    },
    enabled: !!userId,
    staleTime: 30_000,
  })
}

export function useCreateQuickNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ user_id, text }: { user_id: string; text: string }) => {
      const { error } = await supabase.from('quick_notes').insert({ user_id, text })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['quick_notes', v.user_id] }),
  })
}

export function useToggleQuickNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string; user_id: string; done: boolean }) => {
      const { error } = await supabase.from('quick_notes').update({ done: params.done }).eq('id', params.id)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['quick_notes', v.user_id] }),
  })
}

export function useDeleteQuickNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string; user_id: string }) => {
      const { error } = await supabase.from('quick_notes').delete().eq('id', params.id)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['quick_notes', v.user_id] }),
  })
}

// Migration ponctuelle : reprend les notes encore stockées dans le localStorage
// (ancien système, pré-Supabase) et les bascule en base une seule fois. Nettoie
// la clé localStorage après succès pour ne pas la rejouer à chaque chargement.
export function useMigrateLegacyQuickNotes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const key = `quick_notes_${userId}`
      const raw = localStorage.getItem(key)
      if (!raw) return false
      // Retrait immédiat (synchrone, avant tout `await`) : si l'effet se
      // déclenche deux fois (StrictMode, double montage...), le second appel
      // trouvera la clé déjà supprimée et s'arrêtera ici, sans dupliquer.
      localStorage.removeItem(key)
      let legacy: { text: string; done: boolean }[] = []
      try { legacy = JSON.parse(raw) } catch { return false }
      if (!Array.isArray(legacy) || legacy.length === 0) return false
      const { error } = await supabase.from('quick_notes').insert(
        legacy.map(n => ({ user_id: userId, text: n.text, done: !!n.done }))
      )
      if (error) throw error
      return true
    },
    onSuccess: (migrated, userId) => {
      if (migrated) qc.invalidateQueries({ queryKey: ['quick_notes', userId] })
    },
  })
}
