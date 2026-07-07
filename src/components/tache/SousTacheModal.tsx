import { useState } from 'react'
import { ChevronDown, X, Plus, CornerDownRight } from 'lucide-react'
import { CriteresEditor } from '@/components/ui/CriteresEditor'
import { AssignPicker } from '@/components/ui/AssignPicker'
import { SPRINTS_LIST } from '@/constants'
import { cn, serializeCriteres } from '@/lib/utils'
import type { CritereItem } from '@/lib/utils'
import type { Tache } from '@/types'
import type { UserProfile } from '@/contexts/AuthContext'

// Formulaire de création de sous-tâche — unique et partagé entre Tâches
// et Sprint Board pour un workflow cohérent. Seuls Titre / Assigné /
// Effort / Critères sont demandés par défaut : tout le reste (Epic,
// Jalon, Type fonction, MoSCoW, Équipe, Thème) est hérité en silence
// de la tâche parente. Sprint, Priorité et le texte long restent
// accessibles via "Plus d'options" pour les cas qui en ont besoin.
export function SousTacheModal({ parent, sprint, membres, onClose, onCreate }: {
  parent: Tache
  sprint?: string | null
  membres: UserProfile[]
  onClose: () => void
  onCreate: (payload: Partial<Tache>) => Promise<void>
}) {
  const [titre, setTitre] = useState('')
  const [assigneA, setAssigneA] = useState('')
  const [effortJ, setEffortJ] = useState('')
  const [critereItems, setCritereItems] = useState<CritereItem[]>([])
  const [showMore, setShowMore] = useState(false)
  const [priorite, setPriorite] = useState('')
  const [sprintDebut, setSprintDebut] = useState(parent.sprint_debut || parent.sprint || sprint || '')
  const [description, setDescription] = useState('')
  const [lienDod, setLienDod] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!titre.trim()) return
    setSaving(true)
    try {
      await onCreate({
        titre: titre.trim(),
        assigne_a: assigneA || null,
        effort_j: Number(effortJ) || 0,
        criteres: serializeCriteres(critereItems),
        statut: 'À faire',
        // Hérité silencieusement de la tâche parente
        epic: parent.epic ?? '',
        jalon: parent.jalon ?? '',
        type_fonction: parent.type_fonction ?? 'Fonction principale',
        moscow: parent.moscow ?? 'Must Have',
        equipe: parent.equipe ?? '',
        metier: parent.metier ?? '',
        // Modifiable via "Plus d'options", sinon hérité aussi
        priorite: priorite || parent.priorite || '',
        sprint_debut: sprintDebut,
        sprint: sprintDebut,
        description,
        lien_dod: lienDod,
        commentaire,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <CornerDownRight size={14} className="text-indigo-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400 font-medium">Nouvelle sous-tâche de</p>
            <p className="text-sm font-bold text-navy truncate">
              {parent.id_tache} — <span className="font-normal text-slate-500">{parent.titre}</span>
            </p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-navy shrink-0">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4 flex flex-col gap-4">
          <div>
            <label className="ds-label mb-1 block">Titre <span className="text-rose-500">*</span></label>
            <input value={titre} onChange={e => setTitre(e.target.value)} autoFocus
              className="ds-input w-full" placeholder="Ex : Rédiger les critères…" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="ds-label mb-1 block">Assigné à</label>
              <AssignPicker value={assigneA || null} membres={membres} onAssign={setAssigneA} />
            </div>
            <div>
              <label className="ds-label mb-1 block">Effort (j)</label>
              <input type="number" value={effortJ} onChange={e => setEffortJ(e.target.value)}
                className="ds-input w-full" min={0} step={0.5} placeholder="0" />
            </div>
          </div>

          <div>
            <label className="ds-label mb-1 block">Critères d'acceptation (DoD)</label>
            <div className="ds-input min-h-[72px] flex flex-col">
              <CriteresEditor items={critereItems} onChange={setCritereItems} compact />
            </div>
          </div>

          <details className="pt-1 group/more" onToggle={e => setShowMore((e.target as HTMLDetailsElement).open)}>
            <summary className="ds-label cursor-pointer select-none list-none flex items-center gap-1.5">
              <ChevronDown size={11} className={cn('transition-transform', showMore ? 'rotate-0' : '-rotate-90')} />
              Plus d'options
            </summary>
            <div className="flex flex-col gap-3 mt-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="ds-label mb-1 block">Priorité</label>
                  <select value={priorite} onChange={e => setPriorite(e.target.value)} className="ds-select w-full">
                    <option value="">-- Héritée du parent --</option>
                    {['P1', 'P2', 'P3', 'P4'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="ds-label mb-1 block">Sprint</label>
                  <select value={sprintDebut} onChange={e => setSprintDebut(e.target.value)} className="ds-select w-full">
                    <option value="">--</option>
                    {SPRINTS_LIST.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="ds-label mb-1 block">User Story</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  className="ds-textarea w-full" rows={2} placeholder="En tant que… je veux… afin de…" />
              </div>
              <div>
                <label className="ds-label mb-1 block">Exigences</label>
                <input value={lienDod} onChange={e => setLienDod(e.target.value)} className="ds-input w-full" placeholder="F1.1, F1.2…" />
              </div>
              <div>
                <label className="ds-label mb-1 block">Commentaire PO</label>
                <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)} className="ds-textarea w-full" rows={2} />
              </div>
            </div>
          </details>

          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button type="submit" disabled={saving || !titre.trim()}
              className="ds-btn-primary flex-1 disabled:opacity-40 flex items-center justify-center gap-1.5">
              {saving ? 'Création…' : <><Plus size={13} /> Créer la sous-tâche</>}
            </button>
            <button type="button" onClick={onClose} className="ds-btn">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  )
}
