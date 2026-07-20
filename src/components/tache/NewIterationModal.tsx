import { useState } from 'react'
import { X, Plus, RotateCcw, ShieldAlert } from 'lucide-react'
import { CriteresEditor } from '@/components/ui/CriteresEditor'
import { AssignPicker } from '@/components/ui/AssignPicker'
import { useSprints } from '@/hooks/useSprints'
import { parseCriteres, serializeCriteres, existingSprintNumeros } from '@/lib/utils'
import type { CritereItem } from '@/lib/utils'
import type { DodItem } from '@/hooks/useDod'
import type { UserProfile } from '@/contexts/AuthContext'

// Popup de création d'une itération (boucle de rework) sur une tâche —
// même gabarit que SousTacheModal.tsx. Les critères sont pré-remplis depuis
// l'itération précédente (ou les critères actuels de la tâche s'il s'agit
// de la 1ʳᵉ itération) : reprend "les mêmes" par défaut, éditables/vidables
// pour des critères spécifiques à cette reprise.
export function NewIterationModal({ taskTitre, numeroSuivant, initCriteres, initEffort, initAssigneA, initSprint, membres, exigencesVerifiees = [], onClose, onCreate }: {
  taskTitre: string
  numeroSuivant: number
  initCriteres: string | null
  initEffort: number | null
  initAssigneA: string | null
  initSprint: string | null
  membres: UserProfile[]
  // Exigences liées à la tâche (lien_dod) actuellement vérifiées : une
  // itération de rework remet l'ouvrage sur le métier, l'essai qui les a
  // validées n'est plus représentatif — proposées à la dé-vérification,
  // cochées par défaut (symétrique de proposeVerification, Sprint Board).
  exigencesVerifiees?: DodItem[]
  onClose: () => void
  onCreate: (payload: { objectif: string; criteres: string; effort_j: number; assigne_a: string | null; sprint: string; devalider: number[] }) => Promise<void>
}) {
  const { data: sprints = [] } = useSprints()
  const sprintNumeros = existingSprintNumeros(sprints)
  const [objectif, setObjectif] = useState('')
  const [critereItems, setCritereItems] = useState<CritereItem[]>(parseCriteres(initCriteres))
  const [effortJ, setEffortJ] = useState(String(initEffort ?? ''))
  const [assigneA, setAssigneA] = useState(initAssigneA ?? '')
  const [sprint, setSprint] = useState(initSprint ?? '')
  const [devalider, setDevalider] = useState<Set<number>>(() => new Set(exigencesVerifiees.map(d => d.id)))
  const [saving, setSaving] = useState(false)
  // Une itération créée ici est une vraie boucle agile (≠ reprise auto de fin
  // de sprint, qui elle n'a jamais d'objectif) : l'exiger évite qu'un simple
  // report de tâche prenne la forme d'une "itération" sans rien de nouveau.
  const canSubmit = objectif.trim().length > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    try {
      await onCreate({
        objectif: objectif.trim(),
        criteres: serializeCriteres(critereItems),
        effort_j: Number(effortJ) || 0,
        assigne_a: assigneA || null,
        sprint,
        devalider: [...devalider],
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand/40 backdrop-blur-sm p-4" onClick={() => { if (!saving) onClose() }}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <RotateCcw size={14} className="text-indigo-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400 font-medium">Nouvelle itération n°{numeroSuivant} de</p>
            <p className="text-sm font-bold text-navy truncate">{taskTitre}</p>
          </div>
          <button onClick={onClose} disabled={saving} className="ml-auto p-1.5 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-navy shrink-0 disabled:opacity-40">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4 flex flex-col gap-4">
          <div>
            <label className="ds-label mb-1 block">Objectif de cette itération <span className="text-red">*</span></label>
            <textarea value={objectif} onChange={e => setObjectif(e.target.value)} autoFocus required
              className="ds-textarea w-full" rows={2} placeholder="Ce qui change par rapport à la tentative précédente…" />
            <p className="text-[11px] text-subtle mt-1">
              Report simple sans rien de nouveau ? Ce n'est pas une itération — laisse le sprint se clôturer, la reprise se fera automatiquement.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="ds-label mb-1 block">Assigné à</label>
              <AssignPicker value={assigneA || null} membres={membres} onAssign={setAssigneA} />
            </div>
            <div>
              <label className="ds-label mb-1 block">Effort (j)</label>
              <input type="number" value={effortJ} onChange={e => setEffortJ(e.target.value)}
                className="ds-input w-full" min={0} step={0.1} placeholder="0" />
            </div>
            <div>
              <label className="ds-label mb-1 block">Sprint</label>
              <select value={sprint} onChange={e => setSprint(e.target.value)} className="ds-select w-full">
                <option value="">--</option>
                {sprintNumeros.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="ds-label mb-1 block">Critères d'acceptation</label>
            <div className="ds-input min-h-[80px] flex flex-col">
              <CriteresEditor items={critereItems} onChange={setCritereItems} />
            </div>
          </div>

          {exigencesVerifiees.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <ShieldAlert size={13} className="text-amber-600 shrink-0" />
                <span className="text-xs font-bold text-amber-800">
                  Cette reprise remet en vérification :
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {exigencesVerifiees.map(d => (
                  <label key={d.id} className="flex items-start gap-2 cursor-pointer text-xs text-amber-900">
                    <input type="checkbox" checked={devalider.has(d.id)}
                      onChange={e => setDevalider(prev => {
                        const next = new Set(prev)
                        e.target.checked ? next.add(d.id) : next.delete(d.id)
                        return next
                      })}
                      className="accent-amber-600 mt-0.5 shrink-0" />
                    <span><span className="font-mono font-bold">{d.code}</span> — {d.titre}</span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-amber-700/80 mt-1.5">
                Les exigences cochées repassent « à vérifier » : l'essai qui les avait validées ne couvre pas la modification. Décoche si la reprise ne les concerne pas.
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button type="submit" disabled={saving || !canSubmit}
              className="ds-btn-primary flex-1 disabled:opacity-40 flex items-center justify-center gap-1.5">
              {saving ? 'Création…' : <><Plus size={13} /> Créer l'itération</>}
            </button>
            <button type="button" onClick={onClose} disabled={saving} className="ds-btn disabled:opacity-40">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  )
}
