import { useState } from 'react'
import { ChevronDown, X, Plus, Folder } from 'lucide-react'
import { CriteresEditor } from '@/components/ui/CriteresEditor'
import { AssignPickerMulti } from '@/components/ui/AssignPicker'
import { cn, serializeCriteres, serializeAssignees } from '@/lib/utils'
import type { CritereItem } from '@/lib/utils'
import type { Tache } from '@/types'
import type { UserProfile } from '@/contexts/AuthContext'

// Popup de création rapide déclenchée depuis l'arbre "Par Epic" — soit
// directement sur une ligne Epic (nouveau Conteneur OU nouvelle US racine),
// soit sur une ligne Conteneur (nouvelle US à l'intérieur, avec héritage
// silencieux de ses attributs de classement — même logique que
// SousTacheModal). Un Conteneur ne peut pas contenir un autre Conteneur,
// donc le toggle n'est proposé que dans le premier cas.
export function QuickAddModal({ epicLabel, conteneurParent, membres, onClose, onCreate }: {
  epicLabel: string
  conteneurParent?: Tache | null
  membres: UserProfile[]
  onClose: () => void
  onCreate: (payload: Partial<Tache>) => Promise<void>
}) {
  const [isConteneur, setIsConteneur] = useState(false)
  const [titre, setTitre] = useState('')
  const [moscow, setMoscow] = useState<string>(conteneurParent?.moscow ?? 'Must Have')
  const [priorite, setPriorite] = useState<string>(conteneurParent?.priorite ?? 'P2')
  const [effortJ, setEffortJ] = useState('')
  const [assignes, setAssignes] = useState<string[]>([])
  const [critereItems, setCritereItems] = useState<CritereItem[]>([])
  const [description, setDescription] = useState('')
  const [showMore, setShowMore] = useState(false)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!titre.trim()) return
    setSaving(true)
    try {
      await onCreate({
        titre: titre.trim(),
        type_tache: isConteneur ? 'Conteneur' : 'Tâche',
        epic: epicLabel,
        jalon: conteneurParent?.jalon ?? '',
        equipe: conteneurParent?.equipe ?? '',
        metier: conteneurParent?.metier ?? '',
        type_fonction: 'Fonction principale',
        statut: 'À faire',
        moscow: moscow as Tache['moscow'],
        priorite,
        effort_j: Number(effortJ) || 0,
        assigne_a: assignes.length ? serializeAssignees(assignes) : null,
        criteres: serializeCriteres(critereItems),
        description,
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
          <Plus size={14} className="text-indigo-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400 font-medium">{conteneurParent ? 'Nouvelle US dans' : 'Nouvel élément dans'}</p>
            <p className="text-sm font-bold text-navy truncate">
              {conteneurParent
                ? <>{conteneurParent.id_tache} — <span className="font-normal text-slate-500">{conteneurParent.titre}</span></>
                : epicLabel}
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
              className="ds-input w-full" placeholder="Ex : Conception mécanique avaloir" />
          </div>

          {!conteneurParent && (
            <label className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-navy cursor-pointer">
              <input type="checkbox" className="accent-indigo-500 w-3.5 h-3.5" checked={isConteneur}
                onChange={e => setIsConteneur(e.target.checked)} />
              <Folder size={13} className="text-amber-500 shrink-0" />
              Ceci est un conteneur de regroupement (pas un item de travail réel)
            </label>
          )}

          {!isConteneur && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="ds-label mb-1 block">Assigné à</label>
                  <AssignPickerMulti value={assignes} membres={membres} onChange={setAssignes} />
                </div>
                <div>
                  <label className="ds-label mb-1 block">Effort (j)</label>
                  <input type="number" value={effortJ} onChange={e => setEffortJ(e.target.value)}
                    className="ds-input w-full" min={0} step={0.1} placeholder="0" />
                </div>
              </div>

              <div>
                <label className="ds-label mb-1 block">Critères d'acceptation (DoD)</label>
                <div className="ds-input min-h-[72px] flex flex-col">
                  <CriteresEditor items={critereItems} onChange={setCritereItems} compact />
                </div>
              </div>

              <details className="pt-1" onToggle={e => setShowMore((e.target as HTMLDetailsElement).open)}>
                <summary className="ds-label cursor-pointer select-none list-none flex items-center gap-1.5">
                  <ChevronDown size={11} className={cn('transition-transform', showMore ? 'rotate-0' : '-rotate-90')} />
                  Plus d'options
                </summary>
                <div className="flex flex-col gap-3 mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="ds-label mb-1 block">MoSCoW</label>
                      <select value={moscow} onChange={e => setMoscow(e.target.value)} className="ds-select w-full">
                        {['Must Have', 'Should Have', 'Could Have', "Won't Have"].map(m => <option key={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="ds-label mb-1 block">Priorité</label>
                      <select value={priorite} onChange={e => setPriorite(e.target.value)} className="ds-select w-full">
                        {['P1', 'P2', 'P3', 'P4'].map(p => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="ds-label mb-1 block">User Story</label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)}
                      className="ds-textarea w-full" rows={2} placeholder="En tant que… je veux… afin de…" />
                  </div>
                </div>
              </details>
            </>
          )}

          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button type="submit" disabled={saving || !titre.trim()}
              className="ds-btn-primary flex-1 disabled:opacity-40 flex items-center justify-center gap-1.5">
              {saving ? 'Création…' : <><Plus size={13} /> Créer</>}
            </button>
            <button type="button" onClick={onClose} className="ds-btn">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  )
}
