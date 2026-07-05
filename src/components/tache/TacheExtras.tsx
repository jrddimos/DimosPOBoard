import { useState, useEffect, useRef } from 'react'
import { useTacheCommentaires, useAddCommentaire, useDeleteCommentaire } from '@/hooks/useTacheCommentaires'
import { useTacheAttachments, useUploadAttachment, useDeleteAttachment, getAttachmentUrl, formatFileSize } from '@/hooks/useTacheAttachments'
import { useTacheTemps, useAddTemps, useDeleteTemps, formatMinutes } from '@/hooks/useTacheTemps'
import { useTimerStore, elapsedMinutes, formatElapsed } from '@/hooks/useTimer'
import { MessageSquare, Send, Paperclip, Download as DownloadIcon, Timer, Play, Square, X } from 'lucide-react'
import { MentionField } from '@/components/ui/MentionField'
import type { UserProfile } from '@/contexts/AuthContext'
import type { Tache } from '@/types'
import type { useToast } from '@/hooks/useToast'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-bold text-navy/75 uppercase tracking-wide mb-1.5 block">{children}</label>
}

// Discussion (commentaires + @mentions), Temps passé (chrono + pointage) et
// Pièces jointes — partagé entre le panneau Tâches et le panneau Sprint Board
// pour ne pas dupliquer cette logique assez lourde dans les deux pages.
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

  const { data: tempsEntries = [] } = useTacheTemps(produitId, tache.id_tache)
  const addTemps = useAddTemps()
  const deleteTemps = useDeleteTemps()
  const running = useTimerStore(s => s.running)
  const startTimer = useTimerStore(s => s.start)
  const stopTimer = useTimerStore(s => s.stop)
  const [, setTick] = useState(0)
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [manualHeures, setManualHeures] = useState('')

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setTick(v => v + 1), 1000)
    return () => clearInterval(id)
  }, [running])

  const timerIsHere = running?.id_tache === tache.id_tache

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

  async function stopAndSave() {
    if (!running || !produitId || !userId) return
    const minutes = elapsedMinutes(running.started_at)
    stopTimer()
    if (minutes < 1) { toast("Chrono arrêté (moins d'1 min, non enregistré)"); return }
    await addTemps.mutateAsync({ produit_id: produitId, id_tache: running.id_tache, user_id: userId, date: new Date().toISOString().slice(0, 10), minutes, note: 'Chrono' })
    toast(`${formatMinutes(minutes)} enregistrées sur ${running.id_tache}`)
  }

  function addManualTemps() {
    if (!produitId || !userId) return
    const h = parseFloat(manualHeures.replace(',', '.'))
    if (!h || h <= 0) { toast('Durée invalide', 'error'); return }
    addTemps.mutate({ produit_id: produitId, id_tache: tache.id_tache, user_id: userId, date: manualDate, minutes: Math.round(h * 60) })
    setManualHeures('')
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

      {/* Temps passé + Pièces jointes — deuxième colonne */}
      <div className="flex flex-col gap-4">
      {/* Temps passé : chrono + pointage manuel */}
      {produitId && userId && (
        <div>
          <SectionLabel><span className="flex items-center gap-1.5"><Timer size={11}/> Temps passé ({formatMinutes(tempsEntries.reduce((s, e) => s + e.minutes, 0))})</span></SectionLabel>
          <div className="flex flex-col gap-2">
            {timerIsHere ? (
              <button onClick={stopAndSave}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-rose-500 text-white hover:bg-rose-500 transition-colors">
                <Square size={11}/> Arrêter · {formatElapsed(running!.started_at)}
              </button>
            ) : running ? (
              <div className="text-xs text-subtle italic">Chrono en cours sur {running.id_tache} — arrête-le d'abord depuis cette tâche.</div>
            ) : (
              <button onClick={() => startTimer({ id_tache: tache.id_tache, titre: tache.titre, produit_id: produitId, started_at: new Date().toISOString() })}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-500 transition-colors">
                <Play size={11}/> Démarrer le chrono
              </button>
            )}

            <div className="flex items-center gap-1.5">
              <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} className="ds-input text-xs flex-1"/>
              <input type="text" value={manualHeures} onChange={e => setManualHeures(e.target.value)}
                placeholder="h" className="ds-input text-xs w-16" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManualTemps() } }}/>
              <button onClick={addManualTemps} disabled={!manualHeures.trim() || addTemps.isPending}
                className="ds-btn ds-btn-sm shrink-0">+</button>
            </div>

            {tempsEntries.length > 0 && (
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {tempsEntries.map(entry => (
                  <div key={entry.id} className="flex items-center gap-2 text-xs bg-bg rounded-lg px-2.5 py-1.5 group/temps">
                    <span className="text-subtle">{new Date(entry.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
                    <span className="font-semibold text-navy">{formatMinutes(entry.minutes)}</span>
                    {entry.note && <span className="text-subtle/60 italic">{entry.note}</span>}
                    {entry.user_id === userId && (
                      <button onClick={() => deleteTemps.mutate({ id: entry.id, produit_id: produitId, id_tache: tache.id_tache })}
                        className="ml-auto max-md:opacity-100 opacity-0 group-hover/temps:opacity-100 text-subtle hover:text-red transition-all"><X size={10}/></button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
