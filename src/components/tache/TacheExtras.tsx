import { useState, useRef } from 'react'
import { useTacheCommentaires, useAddCommentaire, useDeleteCommentaire } from '@/hooks/useTacheCommentaires'
import { useTacheAttachments, useUploadAttachment, useDeleteAttachment, getAttachmentUrl, formatFileSize } from '@/hooks/useTacheAttachments'
import { MessageSquare, Send, Paperclip, Download as DownloadIcon, X } from 'lucide-react'
import { MentionField } from '@/components/ui/MentionField'
import type { UserProfile } from '@/contexts/AuthContext'
import type { Tache } from '@/types'
import type { useToast } from '@/hooks/useToast'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-bold text-navy/75 uppercase tracking-wide mb-1.5 block">{children}</label>
}

// Discussion (commentaires + @mentions) et Pièces jointes — partagé entre le
// panneau Tâches et le panneau Sprint Board pour ne pas dupliquer cette
// logique assez lourde dans les deux pages.
// Temps passé (chrono + pointage) volontairement masqué pour l'instant.
export function TacheExtras({ produitId, tache, membres, userId, toast }: {
  produitId: number | null
  tache: Tache
  membres: UserProfile[]
  userId: string | null
  toast: ReturnType<typeof useToast>
}) {
  const { data: commentaires = [] } = useTacheCommentaires(produitId, tache.id_tache)
  const addCommentaire = useAddCommentaire()
  const deleteCommentaire = useDeleteCommentaire()
  const [commentDraft, setCommentDraft] = useState('')

  const { data: attachments = [] } = useTacheAttachments(produitId, tache.id_tache)
  const uploadAttachment = useUploadAttachment()
  const deleteAttachment = useDeleteAttachment()
  const attachFileRef = useRef<HTMLInputElement>(null)

  function submitComment() {
    if (!produitId || !userId || !commentDraft.trim()) return
    addCommentaire.mutate({ produit_id: produitId, id_tache: tache.id_tache, user_id: userId, texte: commentDraft.trim() })
    setCommentDraft('')
  }

  async function openAttachment(path: string) {
    const url = await getAttachmentUrl(path)
    if (url) window.open(url, '_blank')
    else toast("Impossible d'ouvrir le fichier", 'error')
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Fil de discussion */}
      <div>
        <SectionLabel><span className="flex items-center gap-1.5"><MessageSquare size={11}/> Discussion ({commentaires.length})</span></SectionLabel>
        <div className="flex flex-col gap-2">
          {commentaires.length === 0 ? (
            <p className="text-xs text-subtle italic">Aucun commentaire</p>
          ) : (
            <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
              {commentaires.map(c => {
                const auteur = membres.find(m => m.user_id === c.user_id)
                return (
                  <div key={c.id} className="bg-bg rounded-lg px-2.5 py-2 group/com">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-semibold text-navy">{auteur?.trigramme ?? auteur?.display_name ?? '—'}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-subtle/60">{new Date(c.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        {c.user_id === userId && (
                          <button onClick={() => produitId && deleteCommentaire.mutate({ id: c.id, produit_id: produitId, id_tache: tache.id_tache })}
                            className="max-md:opacity-100 opacity-0 group-hover/com:opacity-100 text-subtle hover:text-red transition-all"><X size={10}/></button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-navy/85 whitespace-pre-wrap break-words">{c.texte}</p>
                  </div>
                )
              })}
            </div>
          )}
          {userId && (
            <div className="flex items-center gap-1.5">
              <div className="flex-1">
                <MentionField value={commentDraft} onChange={setCommentDraft} membres={membres}
                  onEnter={submitComment} dropDirection="up"
                  placeholder="Écrire un commentaire… @trg pour mentionner"
                  className="ds-input text-xs w-full"/>
              </div>
              <button onClick={submitComment} disabled={!commentDraft.trim() || addCommentaire.isPending}
                className="ds-btn-primary ds-btn-sm shrink-0"><Send size={12}/></button>
            </div>
          )}
        </div>
      </div>

      {/* Pièces jointes — deuxième colonne */}
      <div className="flex flex-col gap-4">
      {/* Pièces jointes */}
      {produitId && (
        <div>
          <SectionLabel><span className="flex items-center gap-1.5"><Paperclip size={11}/> Pièces jointes ({attachments.length})</span></SectionLabel>
          <div className="flex flex-col gap-1.5">
            {attachments.length === 0 ? (
              <p className="text-xs text-subtle italic">Aucune pièce jointe</p>
            ) : attachments.map(a => (
              <div key={a.id} className="flex items-center gap-2 text-xs bg-bg rounded-lg px-2.5 py-2 group/att">
                <button onClick={() => openAttachment(a.storage_path)} className="flex-1 min-w-0 flex items-center gap-1.5 text-left hover:text-indigo-600">
                  <DownloadIcon size={11} className="shrink-0"/>
                  <span className="truncate font-medium text-navy group-hover/att:text-indigo-600">{a.file_name}</span>
                </button>
                <span className="text-[11px] text-subtle shrink-0">{formatFileSize(a.file_size)}</span>
                {(a.uploaded_by === userId) && (
                  <button onClick={() => deleteAttachment.mutate(a)} className="max-md:opacity-100 opacity-0 group-hover/att:opacity-100 text-subtle hover:text-red transition-all shrink-0"><X size={11}/></button>
                )}
              </div>
            ))}
            {userId && (
              <>
                <input ref={attachFileRef} type="file" className="hidden"
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (!file || !produitId || !userId) return
                    if (file.size > 10 * 1024 * 1024) { toast('Fichier trop volumineux (max 10 Mo)', 'error'); return }
                    await uploadAttachment.mutateAsync({ produit_id: produitId, id_tache: tache.id_tache, uploaded_by: userId, file })
                    toast('Fichier ajouté')
                    e.target.value = ''
                  }}/>
                <button onClick={() => attachFileRef.current?.click()} disabled={uploadAttachment.isPending}
                  className="ds-btn ds-btn-sm flex items-center justify-center gap-1.5 mt-0.5">
                  <Paperclip size={11}/> {uploadAttachment.isPending ? 'Envoi…' : 'Ajouter un fichier'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
