import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface TacheAttachment {
  id:           number
  produit_id:   number
  id_tache:     string
  storage_path: string
  file_name:    string
  file_size:    number | null
  mime_type:    string | null
  uploaded_by:  string | null
  created_at:   string
}

export function useTacheAttachments(produitId: number | null, idTache: string | null) {
  return useQuery({
    queryKey: ['tache_attachments', produitId, idTache],
    queryFn: async () => {
      if (!produitId || !idTache) return []
      const { data, error } = await supabase
        .from('tache_attachments')
        .select('*')
        .eq('produit_id', produitId)
        .eq('id_tache', idTache)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as TacheAttachment[]
    },
    enabled: !!produitId && !!idTache,
    staleTime: 15_000,
  })
}

export function useUploadAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ produit_id, id_tache, uploaded_by, file }: {
      produit_id: number; id_tache: string; uploaded_by: string; file: File
    }) => {
      const path = `${produit_id}/${id_tache}/${Date.now()}_${file.name}`
      const { error: upErr } = await supabase.storage.from('attachments').upload(path, file)
      if (upErr) throw upErr
      const { error } = await supabase.from('tache_attachments').insert({
        produit_id, id_tache, uploaded_by,
        storage_path: path, file_name: file.name, file_size: file.size, mime_type: file.type || null,
      })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['tache_attachments', v.produit_id, v.id_tache] }),
  })
}

export function useDeleteAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: TacheAttachment) => {
      await supabase.storage.from('attachments').remove([a.storage_path])
      const { error } = await supabase.from('tache_attachments').delete().eq('id', a.id)
      if (error) throw error
    },
    onSuccess: (_, a) => qc.invalidateQueries({ queryKey: ['tache_attachments', a.produit_id, a.id_tache] }),
  })
}

export async function getAttachmentUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('attachments').createSignedUrl(path, 3600)
  if (error) return null
  return data.signedUrl
}

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}
