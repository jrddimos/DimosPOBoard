import { useMemo, useState } from 'react'
import { ChevronDown, X, Plus, CornerDownRight, Target } from 'lucide-react'
import { CriteresEditor } from '@/components/ui/CriteresEditor'
import { AssignPicker } from '@/components/ui/AssignPicker'
import { cn, serializeCriteres, parseCriteres, existingSprintNumeros } from '@/lib/utils'
import type { CritereItem } from '@/lib/utils'
import { useTacheIterations } from '@/hooks/useTacheIterations'
import { useSprintsByProduit } from '@/hooks/useSprints'
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
  const [critereLieId, setCritereLieId] = useState('')

  // Critères d'acceptation proposables de la tâche parente : la source
  // "vivante" est la dernière itération si elle existe (même logique que
  // partout ailleurs, ex. TacheDetailPanel), sinon les critères du parent
  // directement. En boucle de rework (nouvelle itération volontaire), on
  // propose TOUS les critères — y compris ceux déjà cochés dans une itération
  // précédente, une nouvelle boucle peut vouloir les re-couvrir. Sinon
  // (état initial ou simple reprise de sprint), seuls les critères encore
  // ouverts ont du sens à rattacher à une nouvelle sous-tâche.
  const { data: parentIterations = [] } = useTacheIterations(parent.id_tache, parent.produit_id)
  const { data: sprints = [] } = useSprintsByProduit(parent.produit_id)
  const sprintNumeros = existingSprintNumeros(sprints)
  const latestIter = parentIterations[parentIterations.length - 1]
  const parentCriteres = latestIter?.criteres ?? parent.criteres
  const isRework = latestIter?.origine === 'rework'
  const critereChoices = useMemo(() => {
    const items = parseCriteres(parentCriteres)
    return isRework ? items : items.filter(i => !i.checked)
  }, [parentCriteres, isRework])

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
        critere_lie_id: critereLieId || null,
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

          {critereChoices.length > 0 && (
            <div>
              <label className="ds-label mb-1 flex items-center gap-1.5">
                <Target size={11} className="text-indigo-500" /> Critère d'acceptation couvert (optionnel)
              </label>
              <select value={critereLieId} onChange={e => setCritereLieId(e.target.value)} className="ds-select w-full">
                <option value="">-- Aucun --</option>
                {critereChoices.map(c => (
                  <option key={c.id} value={c.id}>{c.checked ? '✓ ' : ''}{c.text}</option>
                ))}
              </select>
              <p className="text-[11px] text-subtle mt-1">
                {isRework
                  ? 'Nouvelle itération : tous les critères sont proposés, y compris ceux déjà validés.'
                  : "Quand toutes les sous-tâches liées à ce critère seront Fait, il sera automatiquement coché sur la tâche."}
              </p>
            </div>
          )}

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
                    {sprintNumeros.map(s => <option key={s}>{s}</option>)}
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
