import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Spinner } from '@/components/ui/Spinner'
import { StatutBadge, EpicBadge, JalonBadge, MoscowBadge } from '@/components/ui/Badge'
import { useTaches, useUpdateTache, useCreateSousTache } from '@/hooks/useTaches'
import { useSprints, useSprintActif, useClosedSprints } from '@/hooks/useSprints'
import { useUtilisateurs } from '@/hooks/useEquipes'
import { useToast } from '@/hooks/useToast'
import { SPRINTS_LIST } from '@/constants'
import { useEpics, epicFullName } from '@/hooks/useEpics'
import { useJalons } from '@/hooks/useJalons'
import { sprintInRange, serializeCriteres, parseCriteres, buildTacheIndex, isUS } from '@/lib/utils'
import type { CritereItem } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { confirm } from '@/components/ui/ConfirmModal'
import { CriteresEditor } from '@/components/ui/CriteresEditor'
import { TacheExtras } from '@/components/tache/TacheExtras'
import { SousTacheModal } from '@/components/tache/SousTacheModal'
import { DodDetailModal } from '@/components/ui/DodDetailModal'
import { useDod, useUpdateDodItem } from '@/hooks/useDod'
import {
  ChevronDown, X, Zap, CalendarDays, AlertTriangle,
  GripVertical, CornerDownRight, Kanban, Search, User as UserIcon,
} from 'lucide-react'
import { PageTitle } from '@/components/ui/PageTitle'
import { StatusPicker } from '@/components/ui/StatusPicker'
import { AssignPicker } from '@/components/ui/AssignPicker'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { FilterPopover, FilterField } from '@/components/ui/FilterPopover'
import { useAuth } from '@/contexts/AuthContext'
import { useProduit } from '@/contexts/ProduitContext'
import {
  DndContext, DragOverlay, PointerSensor,
  useSensor, useSensors, useDroppable,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Statut, Tache } from '@/types'
import type { UserProfile } from '@/contexts/AuthContext'

const COLS: { key: Statut; label: string; dot: string; headerBg: string; borderColor: string }[] = [
  { key: 'À faire',  label: 'À faire',  dot: '#94A3B8', headerBg: 'bg-slate-50',   borderColor: 'border-l-slate-300' },
  { key: 'En cours', label: 'En cours', dot: '#F59E0B', headerBg: 'bg-amber-50',   borderColor: 'border-l-amber-400' },
  { key: 'Fait',     label: 'Terminé',  dot: '#34D399', headerBg: 'bg-emerald-50', borderColor: 'border-l-emerald-400' },
  { key: 'Bloqué',   label: 'Bloqué',   dot: '#FB7185', headerBg: 'bg-rose-50',    borderColor: 'border-l-rose-400' },
]

// ── Droppable column ──────────────────────────────────────────
function DroppableColumn({ col, children }: { col: typeof COLS[0]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key })
  return (
    <div ref={setNodeRef}
      className={cn('kanban-col rounded-xl border border-slate-200/80 transition-colors', col.headerBg,
        isOver && 'ring-2 ring-inset ring-indigo-300 bg-indigo-50/50')}
      style={{ borderTop: `4px solid ${col.dot}` }}>
      {children}
    </div>
  )
}

// ── KanbanCard avec drag intégré ──────────────────────────────
type KanbanCardProps = {
  t: Tache
  col: typeof COLS[0]
  subs: Tache[]
  membres: UserProfile[]
  isReadOnly: boolean
  isSelected: boolean
  isExpanded: boolean
  showStatusPicker: boolean
  onSelect: () => void
  onToggleExpand: () => void
  onChangeStatut: (t: Tache, s: Statut) => void
  onAssign: (id: string, tri: string) => void
  onToggleSub: (sub: Tache) => void
  onAddSub: (t: Tache) => void
}

function KanbanCard({
  t, col, subs, membres, isReadOnly, isSelected, isExpanded, showStatusPicker,
  onSelect, onToggleExpand, onChangeStatut, onAssign, onToggleSub, onAddSub,
}: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id_tache })
  const { data: epicsList = [] } = useEpics()
  const epicMatch = epicsList.find(e => epicFullName(e) === t.epic)
  const epicColor = epicMatch?.couleur
  const epicBg    = epicMatch?.bg_couleur

  const effortJ     = subs.length > 0 ? subs.reduce((a, s) => a + (s.effort_j ?? 0), 0) : (t.effort_j ?? 0)
  const effortRealJ = subs.length > 0 ? subs.reduce((a, s) => a + (s.effort_realise_j ?? 0), 0) : (t.effort_realise_j ?? null)
  const done        = subs.filter(s => s.statut === 'Fait').length
  const pct         = subs.length ? Math.round(done / subs.length * 100) : 0
  const pendingSubs = subs.filter(s => s.statut !== 'Fait').length
  const blockedByTask = col.key !== 'Fait' && pendingSubs > 0

  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 100 : undefined }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}
      className={cn('kanban-card border-l-4 group cursor-grab active:cursor-grabbing touch-pan-y', col.borderColor, isDragging && 'opacity-40', isSelected && 'selected')}
      onClick={onSelect}>

      {/* Header */}
      <div className="flex items-start justify-between mb-1.5 gap-1">
        <span className="text-xs font-semibold text-indigo-600 flex-1">{t.id_tache}</span>
        <EpicBadge value={t.epic ?? ''} className="text-xs" color={epicColor ?? undefined} bg={epicBg ?? undefined} />
      </div>

      <p className="text-xs font-medium text-navy leading-snug mb-2">{t.titre}</p>

      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        {t.jalon && <span className="text-xs px-1.5 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-500">{t.jalon}</span>}
        {effortJ > 0 && (
          <span className="flex items-center gap-1 text-xs font-semibold">
            <span className="text-slate-600" title={subs.length > 0 ? 'Somme des sous-tâches' : undefined}>
              {subs.length > 0 && '∑ '}{effortJ}j
            </span>
            {effortRealJ != null && effortRealJ > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span className={cn(effortRealJ <= effortJ ? 'text-emerald-600' : 'text-rose-500')}>
                  {effortRealJ}j ✓
                </span>
              </>
            )}
          </span>
        )}
      </div>

      <div className="mb-1.5">
        <AssignPicker value={t.assigne_a ?? null} membres={membres}
          onAssign={tri => onAssign(t.id_tache, tri)} disabled={isReadOnly} />
      </div>

      <div className={cn('mb-2', blockedByTask && 'opacity-60')}>
        {showStatusPicker ? (
          <StatusPicker
            value={t.statut}
            onChange={s => onChangeStatut(t, s)}
            disabled={isReadOnly}
          />
        ) : (
          <StatutBadge value={t.statut} />
        )}
      </div>
      {blockedByTask && (
        <div className="flex items-center gap-1 mb-2 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 text-[11px] font-medium">
          <AlertTriangle size={10} className="shrink-0" />
          {pendingSubs} sous-tâche(s) restante(s)
        </div>
      )}

      {/* Bouton ajout sous-tâche */}
      {!isReadOnly && (
        <button onClick={e => { e.stopPropagation(); onAddSub(t) }}
          className="w-full flex items-center gap-1.5 mt-1 mb-1 px-2 py-1.5 rounded-lg border border-dashed border-indigo-200 text-indigo-500 hover:bg-indigo-50 hover:border-indigo-300 transition-all text-xs font-medium">
          <CornerDownRight size={11} />
          Ajouter une sous-tâche
        </button>
      )}

      {/* Sous-tâches */}
      {subs.length > 0 && (
        <div className="border-t border-slate-100 pt-2 mt-1" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2 cursor-pointer" onClick={onToggleExpand}>
            <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-slate-400 whitespace-nowrap">{done}/{subs.length}</span>
            <ChevronDown size={12} className={cn('text-slate-400 transition-transform shrink-0', isExpanded && 'rotate-180')} />
          </div>
          {isExpanded && (
            <div className="flex flex-col gap-1 mt-2">
              {subs.map(s => (
                <div key={s.id_tache} className="flex flex-col gap-1">
                  <label className="flex items-start gap-2 cursor-pointer" onClick={e => e.stopPropagation()}>
                    {!isReadOnly && (
                      <input type="checkbox" checked={s.statut === 'Fait'} onChange={() => onToggleSub(s)}
                        className="mt-0.5 accent-emerald-500 w-3 h-3 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className={cn('text-xs leading-snug', s.statut === 'Fait' ? 'line-through text-slate-400' : 'text-navy')}>{s.titre}</span>
                      <span className="text-xs text-slate-400 ml-1">{s.id_tache}</span>
                      {s.assigne_a && <span className="ml-1 text-xs bg-indigo-50 text-indigo-700 px-1.5 rounded-full">{s.assigne_a}</span>}
                      {(s.effort_j > 0 || s.effort_realise_j != null) && (
                        <span className="ml-1 text-xs font-semibold text-slate-500">
                          {s.effort_j > 0 && <>{s.effort_j}j</>}
                          {s.effort_realise_j != null && s.effort_realise_j > 0 && (
                            <span className={cn('ml-1', s.effort_realise_j <= s.effort_j ? 'text-emerald-600' : 'text-rose-500')}>
                              · {s.effort_realise_j}j ✓
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </label>
                  <div className="ml-5">
                    <AssignPicker value={s.assigne_a ?? null} membres={membres}
                      onAssign={tri => onAssign(s.id_tache, tri)} disabled={isReadOnly} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Ghost pour DragOverlay ────────────────────────────────────
function CardGhost({ t, col }: { t: Tache; col: typeof COLS[0] }) {
  return (
    <div className={cn('kanban-card border-l-4 shadow-2xl rotate-1 opacity-95 pointer-events-none', col.borderColor)}>
      <div className="flex items-center gap-1.5 mb-1">
        <GripVertical size={11} className="text-slate-300" />
        <span className="text-xs font-semibold text-indigo-600">{t.id_tache}</span>
      </div>
      <p className="text-xs font-medium text-navy leading-snug line-clamp-2">{t.titre}</p>
    </div>
  )
}

// ── Critères cochables dans le panel ─────────────────────────
function PanelCriteres({ tache, onSave }: { tache: Tache; onSave: (criteres: string) => void }) {
  const [items, setItems] = useState(() => parseCriteres(tache.criteres))

  useEffect(() => {
    setItems(parseCriteres(tache.criteres))
  }, [tache.id_tache, tache.criteres])

  function handleChange(newItems: CritereItem[]) {
    setItems(newItems)
    onSave(serializeCriteres(newItems))
  }

  const done  = items.filter(i => i.checked).length
  const total = items.length

  return (
    <div>
      <div className="ds-label mb-1.5 flex items-center gap-2">
        Critères d'acceptation (DoD)
        {total > 0 && (
          <span className={cn(
            'ml-auto text-[11px] font-semibold px-1.5 py-0.5 rounded-full',
            done === total ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
          )}>
            {done}/{total}
          </span>
        )}
      </div>
      <CriteresEditor items={items} onChange={handleChange} compact />
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────
export default function SprintBoardPage() {
  const [params] = useSearchParams()
  const [activeTab,    setActiveTab]    = useState<'current' | 'all'>(params.get('tab') === 'all' ? 'all' : 'current')
  const [filterEpic,   setFilterEpic]   = useState('')
  const [filterJalon,  setFilterJalon]  = useState('')
  const [onlyMine,     setOnlyMine]     = useState(false)
  const [search,       setSearch]       = useState('')
  const [allSprint,    setAllSprint]    = useState('')
  const [panel,        setPanel]        = useState<Tache | null>(null)
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set())
  const [effortModal,  setEffortModal]  = useState<{ tache: Tache; pendingStatut: Statut } | null>(null)
  const [effortInput,  setEffortInput]  = useState('')
  const [modalCriteres, setModalCriteres] = useState<CritereItem[]>([])
  const [activeId,     setActiveId]     = useState<string | null>(null)
  const [sousTacheFor, setSousTacheFor] = useState<Tache | null>(null)
  const [mobileCol,    setMobileCol]    = useState<Statut>('À faire')
  const [dodDetail,    setDodDetail]    = useState<import('@/hooks/useDod').DodItem | null>(null)

  const { data: dodItems = [] }               = useDod()
  const { data: epicsListMain = [] }          = useEpics()
  const { data: jalonsListMain = [] }         = useJalons()
  const { data: taches = [],      isLoading } = useTaches()
  const { data: sprintActif }                 = useSprintActif()
  const { data: sprints = [] }                = useSprints()
  const { data: closedSprints = [] }          = useClosedSprints()
  const { data: membres = [] }                = useUtilisateurs()
  const updateTache   = useUpdateTache()
  const updateDodItem = useUpdateDodItem()
  const createSub     = useCreateSousTache()
  const toast       = useToast()
  const { canWrite, user, profile } = useAuth()
  const { produitActif } = useProduit()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const childMap = useMemo(() => {
    const map: Record<string, Tache[]> = {}
    taches.filter(t => t.parent_id).forEach(c => {
      if (!map[c.parent_id!]) map[c.parent_id!] = []
      map[c.parent_id!].push(c)
    })
    return map
  }, [taches])

  const sprint4Board = activeTab === 'current' ? (sprintActif?.numero ?? null) : allSprint
  const byId = useMemo(() => buildTacheIndex(taches), [taches])

  const boardTaches = useMemo(() => {
    const q = search.trim().toLowerCase()
    return taches.filter(t => {
      if (!isUS(t, byId)) return false
      if (!sprint4Board) return false
      if (!sprintInRange(t.sprint_debut, t.sprint_fin, sprint4Board)) return false
      if (filterEpic  && t.epic  !== filterEpic)  return false
      if (filterJalon && t.jalon !== filterJalon) return false
      if (onlyMine && t.assigne_a !== profile?.trigramme) return false
      if (q && !t.id_tache.toLowerCase().includes(q) && !t.titre.toLowerCase().includes(q)) return false
      return true
    }).sort((a, b) => (a.ordre_kanban ?? Infinity) - (b.ordre_kanban ?? Infinity))
  }, [taches, byId, sprint4Board, filterEpic, filterJalon, onlyMine, search, profile?.trigramme])

  const isReadOnly = activeTab === 'all' || (sprint4Board ? closedSprints.includes(sprint4Board) : false)
    || !(produitActif ? canWrite(produitActif.id) : false)

  function getSubsForSprint(taskId: string): Tache[] {
    const allSubs = childMap[taskId] ?? []
    if (!sprint4Board) return allSubs
    return allSubs.filter(s =>
      !s.sprint_debut ? true :
      sprintInRange(s.sprint_debut, s.sprint_fin, sprint4Board)
    )
  }

  // Semi-auto : quand la dernière US parente liée à une exigence passe à
  // "Fait", on PROPOSE de la marquer vérifiée — jamais automatiquement,
  // car un essai réalisé n'est pas forcément un essai conforme (c'est ce
  // qui déclenche les boucles P1 → P2 → P3).
  async function proposeVerification(done: Tache) {
    if (!isUS(done, byId)) return
    const codesOf = (t: Tache) => (t.lien_dod ?? '').split(/[,;]/).map(s => s.trim()).filter(Boolean)
    const codes = codesOf(done)
    if (!codes.length) return
    const ready = codes
      .map(code => dodItems.find(d => d.code === code))
      .filter((d): d is typeof dodItems[number] => !!d && d.actif && !d.verifiee)
      .filter(d => taches
        .filter(t => isUS(t, byId) && codesOf(t).includes(d.code))
        .every(t => t.id_tache === done.id_tache || t.statut === 'Fait'))
    if (!ready.length) return
    const ok = await confirm({
      title: ready.length === 1 ? 'Exigence à statuer' : `${ready.length} exigences à statuer`,
      message: `Toutes les US liées sont terminées pour :\n${ready.map(d => `${d.code} — ${d.titre}`).join('\n')}\n\nEssai conforme ? Marquer comme vérifiée${ready.length > 1 ? 's' : ''} ?\n(Sinon : refuse, et crée les US de la boucle suivante.)`,
      confirmLabel: `Marquer vérifiée${ready.length > 1 ? 's' : ''}`,
    })
    if (!ok) return
    for (const d of ready) await updateDodItem.mutateAsync({ id: d.id, updates: { verifiee: true }, item: d })
    toast(`${ready.length} exigence${ready.length > 1 ? 's' : ''} vérifiée${ready.length > 1 ? 's' : ''} ✓`)
  }

  async function changeStatut(t: Tache, statut: Statut) {
    if (isReadOnly) { toast('Sprint clôturé ou en lecture seule', 'error'); return }
    if (statut === 'Fait') {
      const subs = getSubsForSprint(t.id_tache)
      const pending = subs.filter(s => s.statut !== 'Fait')
      if (pending.length > 0) { toast(`${pending.length} sous-tâche(s) non terminée(s) dans ce sprint`, 'error'); return }
      if (subs.length > 0) {
        const totalReal = subs.reduce((acc, s) => acc + (s.effort_realise_j ?? 0), 0)
        await updateTache.mutateAsync({ id_tache: t.id_tache, updates: { statut, effort_realise_j: totalReal } })
        toast(`${t.id_tache} → Fait · ${totalReal}j réalisés`)
        await proposeVerification(t)
        return
      }
      // Un seul popup pour tout : cocher les critères restants ET saisir le
      // temps réalisé, plutôt qu'une confirmation "critères non cochés,
      // continuer quand même ?" séparée puis une 2ᵉ popup pour l'effort.
      setEffortInput(String(t.effort_j ?? ''))
      setModalCriteres(parseCriteres(t.criteres))
      setEffortModal({ tache: t, pendingStatut: statut })
      return
    }
    await updateTache.mutateAsync({ id_tache: t.id_tache, updates: { statut } })
    toast(`${t.id_tache} → ${statut}`)
  }

  async function toggleSub(sub: Tache) {
    if (isReadOnly) return
    if (sub.statut === 'Fait') {
      await updateTache.mutateAsync({ id_tache: sub.id_tache, updates: { statut: 'À faire' } })
    } else {
      setEffortInput(String(sub.effort_j ?? ''))
      setModalCriteres(parseCriteres(sub.criteres))
      setEffortModal({ tache: sub, pendingStatut: 'Fait' })
    }
  }

  async function confirmEffort() {
    if (!effortModal) return
    const val = parseFloat(effortInput)
    const done = effortModal.tache
    await updateTache.mutateAsync({
      id_tache: done.id_tache,
      updates: { statut: effortModal.pendingStatut, effort_realise_j: isNaN(val) ? null : val, criteres: serializeCriteres(modalCriteres) },
    })
    toast(`${done.id_tache} → Fait · ${isNaN(val) ? '—' : val + 'j'} réalisés`)
    setEffortModal(null)
    if (effortModal.pendingStatut === 'Fait') await proposeVerification(done)
  }

  async function skipEffort() {
    if (!effortModal) return
    const done = effortModal.tache
    await updateTache.mutateAsync({ id_tache: done.id_tache, updates: { statut: effortModal.pendingStatut, criteres: serializeCriteres(modalCriteres) } })
    toast(`${done.id_tache} → Fait`)
    setEffortModal(null)
    if (effortModal.pendingStatut === 'Fait') await proposeVerification(done)
  }

  async function assignTo(id_tache: string, assigne: string) {
    await updateTache.mutateAsync({ id_tache, updates: { assigne_a: assigne || null } })
    toast('Assigné')
  }

  function toggleExpand(id: string) {
    setExpandedSubs(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function onDragStart(event: DragStartEvent) { setActiveId(String(event.active.id)) }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const tache = boardTaches.find(t => t.id_tache === active.id)
    if (!tache) return

    const overIsColumn = COLS.some(c => c.key === over.id)
    const overTache = overIsColumn ? null : boardTaches.find(t => t.id_tache === over.id)
    const targetStatut = overIsColumn ? (over.id as Statut) : (overTache?.statut ?? tache.statut)

    if (targetStatut !== tache.statut) {
      changeStatut(tache, targetStatut)
      return
    }

    // Réordonnancement manuel dans la même colonne
    if (overTache && overTache.id_tache !== tache.id_tache) {
      const colTaches = boardTaches.filter(t => t.statut === targetStatut)
      const oldIndex = colTaches.findIndex(t => t.id_tache === tache.id_tache)
      const newIndex = colTaches.findIndex(t => t.id_tache === overTache.id_tache)
      if (oldIndex === -1 || newIndex === -1) return
      arrayMove(colTaches, oldIndex, newIndex).forEach((t, i) => {
        if (t.ordre_kanban !== i) updateTache.mutate({ id_tache: t.id_tache, updates: { ordre_kanban: i } })
      })
    }
  }

  const fait    = boardTaches.filter(t => t.statut === 'Fait').length
  const encours = boardTaches.filter(t => t.statut === 'En cours').length
  const bloque  = boardTaches.filter(t => t.statut === 'Bloqué').length
  const activeTache = activeId ? (taches.find(t => t.id_tache === activeId) ?? null) : null
  const activeCol   = activeTache ? (COLS.find(c => c.key === activeTache.statut) ?? COLS[0]) : COLS[0]

  if (isLoading) return <Layout><Spinner /></Layout>

  return (
    <Layout>
      {/* Topbar */}
      <div className="page-topbar -mx-3 -mt-3 mb-3 px-3 md:-mx-5 md:-mt-5 md:mb-5 md:px-5 gap-y-2">
        <PageTitle icon={<Kanban size={15}/>} label="Sprint Board" />
        <ToggleGroup value={activeTab} onChange={setActiveTab} options={[
          { key: 'current', label: 'Sprint en cours',  icon: <Zap size={11} /> },
          { key: 'all',     label: 'Tous les sprints', icon: <CalendarDays size={11} /> },
        ]} />

        {activeTab === 'current' && sprintActif && (
          <>
            <div className="ds-sep" />
            <span className="text-sm font-semibold text-navy">{sprintActif.numero}</span>
            <span className="ds-pill-stat pill-wip rounded-full px-2.5 py-0.5 text-xs font-medium">en cours</span>
          </>
        )}

        {activeTab === 'all' && (
          <select value={allSprint} onChange={e => setAllSprint(e.target.value)} className="ds-select w-40 text-xs py-1">
            <option value="">-- Sprint --</option>
            {SPRINTS_LIST.map(s => {
              const sp = sprints.find(x => x.numero === s)
              return <option key={s} value={s}>{s}{sp ? ` (${sp.statut})` : ''}</option>
            })}
          </select>
        )}

        <div className="ds-sep" />
        <div className="ds-searchbar w-44">
          <Search size={12} className="text-subtle shrink-0"/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher ID, titre…" />
          {search && <button onClick={() => setSearch('')}><X size={11} className="text-subtle"/></button>}
        </div>

        {profile?.trigramme && (
          <button onClick={() => setOnlyMine(v => !v)}
            className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all',
              onlyMine ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-card text-subtle border-slate-200 hover:border-indigo-300')}>
            <UserIcon size={12} /> Mes tâches
          </button>
        )}

        <FilterPopover
          activeCount={(filterEpic ? 1 : 0) + (filterJalon ? 1 : 0)}
          onReset={() => { setFilterEpic(''); setFilterJalon('') }}>
          <FilterField label="Epic">
            <select value={filterEpic} onChange={e => setFilterEpic(e.target.value)} className="ds-select text-xs py-1.5">
              <option value="">Tous Epics</option>
              {epicsListMain.map(e => <option key={e.id} value={epicFullName(e)}>{e.code}</option>)}
            </select>
          </FilterField>
          <FilterField label="Jalon — incrément majeur">
            <select value={filterJalon} onChange={e => setFilterJalon(e.target.value)} className="ds-select text-xs py-1.5">
              <option value="">Tous Jalons</option>
              {jalonsListMain.map(j => <option key={j.code}>{j.code}</option>)}
            </select>
          </FilterField>
        </FilterPopover>

        <div className="flex gap-1.5 ml-auto">
          <span className="ds-pill-stat pill-todo rounded-full">{boardTaches.filter(t => t.statut === 'À faire').length} à faire</span>
          <span className="ds-pill-stat pill-wip rounded-full">{encours} en cours</span>
          <span className="ds-pill-stat pill-done rounded-full">{fait} terminé</span>
          {bloque > 0 && <span className="ds-pill-stat pill-block rounded-full">{bloque} bloqué</span>}
        </div>
      </div>

      <div className="flex gap-3">
        {/* Kanban */}
        <div className="flex-1 min-w-0">
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>

            {/* ── Vue mobile : un seul statut à la fois, cartes empilées ── */}
            <div className="md:hidden">
              <div className="flex gap-1.5 overflow-x-auto pb-2 mb-1 -mx-1 px-1">
                {COLS.map(col => {
                  const n = boardTaches.filter(t => t.statut === col.key).length
                  const active = mobileCol === col.key
                  return (
                    <button key={col.key} onClick={() => setMobileCol(col.key)}
                      className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all shrink-0',
                        active ? 'text-white border-transparent' : 'bg-card text-subtle border-slate-200')}
                      style={active ? { background: col.dot } : {}}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: active ? '#fff' : col.dot }} />
                      {col.label} <span className="opacity-70">{n}</span>
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-col gap-2.5">
                <SortableContext items={boardTaches.filter(t => t.statut === mobileCol).map(t => t.id_tache)} strategy={verticalListSortingStrategy}>
                  {boardTaches.filter(t => t.statut === mobileCol).map(t => (
                    <KanbanCard key={t.id_tache}
                      t={t} col={COLS.find(c => c.key === mobileCol)!}
                      subs={getSubsForSprint(t.id_tache)}
                      membres={membres}
                      isReadOnly={isReadOnly}
                      isSelected={panel?.id_tache === t.id_tache}
                      isExpanded={expandedSubs.has(t.id_tache)}
                      showStatusPicker
                      onSelect={() => setPanel(p => p?.id_tache === t.id_tache ? null : t)}
                      onToggleExpand={() => toggleExpand(t.id_tache)}
                      onChangeStatut={changeStatut}
                      onAssign={assignTo}
                      onToggleSub={toggleSub}
                      onAddSub={setSousTacheFor}
                    />
                  ))}
                </SortableContext>
                {!boardTaches.filter(t => t.statut === mobileCol).length && (
                  <div className="flex items-center justify-center h-16 border-2 border-dashed border-slate-200 rounded-xl text-slate-300 text-xs">Vide</div>
                )}
              </div>
            </div>

            {/* ── Vue desktop : 4 colonnes ── */}
            <div className="hidden md:block overflow-x-auto">
              <div className="mx-auto" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(220px, 340px))', gap: '14px', minWidth: '760px', maxWidth: '1440px' }}>
                {COLS.map(col => {
                  const colTaches = boardTaches.filter(t => t.statut === col.key)
                  return (
                    <DroppableColumn key={col.key} col={col}>
                      <div className={cn('flex items-center justify-between pb-2 border-b border-slate-200/70 -mx-3 px-3 -mt-3 pt-3 mb-3', col.headerBg)}>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ background: col.dot }} />
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{col.label}</span>
                        </div>
                        <span className="text-xs font-medium text-slate-400 bg-card border border-slate-200 px-2 py-0.5 rounded-full">{colTaches.length}</span>
                      </div>

                      <SortableContext items={colTaches.map(t => t.id_tache)} strategy={verticalListSortingStrategy}>
                        {colTaches.map(t => (
                          <KanbanCard key={t.id_tache}
                            t={t} col={col}
                            subs={getSubsForSprint(t.id_tache)}
                            membres={membres}
                            isReadOnly={isReadOnly}
                            isSelected={panel?.id_tache === t.id_tache}
                            isExpanded={expandedSubs.has(t.id_tache)}
                            showStatusPicker={false}
                            onSelect={() => setPanel(p => p?.id_tache === t.id_tache ? null : t)}
                            onToggleExpand={() => toggleExpand(t.id_tache)}
                            onChangeStatut={changeStatut}
                            onAssign={assignTo}
                            onToggleSub={toggleSub}
                            onAddSub={setSousTacheFor}
                          />
                        ))}
                      </SortableContext>

                      {!colTaches.length && (
                        <div className="flex items-center justify-center h-16 border-2 border-dashed border-slate-200 rounded-xl text-slate-300 text-xs">Vide</div>
                      )}
                    </DroppableColumn>
                  )
                })}
              </div>
            </div>

            <DragOverlay>
              {activeTache ? <CardGhost t={activeTache} col={activeCol} /> : null}
            </DragOverlay>
          </DndContext>
        </div>

        {/* Panel détail — barre du bas sur mobile, colonne latérale sur desktop */}
        {panel && (
          <>
            <div className="fixed inset-0 z-40 bg-brand/40" onClick={() => setPanel(null)} />
            <div className={cn(
              'fixed inset-x-0 bottom-0 z-50 animate-in',
              'md:inset-x-auto md:left-auto md:right-4 md:top-4 md:bottom-4 md:w-3/5 md:min-w-[380px] md:max-w-[860px]',
            )}>
              <div className="ds-card flex flex-col gap-3 max-h-[80vh] md:max-h-full md:h-full overflow-y-auto rounded-b-none md:rounded-xl shadow-2xl">
                <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-600">{panel.id_tache}</span>
                <button onClick={() => setPanel(null)} className="p-1 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-navy"><X size={13} /></button>
              </div>
              <h3 className="text-sm font-semibold text-navy leading-snug">{panel.titre}</h3>
              <div className="flex flex-wrap gap-1.5">
                <StatutBadge value={panel.statut} />
                {panel.moscow && <MoscowBadge value={panel.moscow} />}
                {panel.jalon && <JalonBadge value={panel.jalon} color={jalonsListMain.find(j => j.code === panel.jalon)?.couleur ?? undefined} />}
              </div>
              {panel.description && <div><div className="ds-label mb-1">User Story</div><p className="text-xs text-navy leading-relaxed whitespace-pre-line">{panel.description}</p></div>}
              {parseCriteres(panel.criteres).length > 0 && (
                <PanelCriteres
                  tache={panel}
                  onSave={async criteres => {
                    await updateTache.mutateAsync({ id_tache: panel.id_tache, updates: { criteres } })
                  }}
                />
              )}
              {!isReadOnly && (
                <button onClick={() => setSousTacheFor(panel)}
                  className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                  <CornerDownRight size={12} /> Ajouter une sous-tâche
                </button>
              )}

              {/* Détails secondaires — repliés par défaut pour ne pas noyer le panneau */}
              <details className="pt-3 mt-1 border-t-2 border-slate-300 group/details">
                <summary className="ds-label cursor-pointer select-none list-none flex items-center gap-1.5">
                  <ChevronDown size={11} className="transition-transform -rotate-90 group-open/details:rotate-0" />
                  Détails
                </summary>
                <div className="flex flex-col gap-3 mt-2">
                  {/* Même ordre que le panneau Tâches : Assigné → Epic → Type/Jalon → Sprint → Équipe/Thème */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    {([
                      ['Assigné',        panel.assigne_a],
                      ['Epic',           panel.epic?.split(' — ')[0]],
                      ['Type fonction',  panel.type_fonction],
                      ['Jalon - Incrément majeur', panel.jalon],
                      ['Sprint',         panel.sprint || panel.sprint_debut],
                      ['Effort',         panel.effort_j ? `${panel.effort_j}j` : null],
                      ['Équipe',         panel.equipe],
                      ['Thème',          panel.metier],
                    ] as [string, string | null | undefined][]).map(([k, v]) => v ? (
                      <div key={k}><div className="text-slate-400">{k}</div><div className="font-semibold text-navy">{v}</div></div>
                    ) : null)}
                  </div>
                  {panel.lien_dod && (
                    <div>
                      <div className="ds-label mb-1">Exigences</div>
                      <div className="flex flex-wrap gap-1">
                        {panel.lien_dod.split(/[,;]/).map(s => s.trim()).filter(Boolean).map(code => {
                          const item = dodItems.find(d => d.code === code)
                          return (
                            <button key={code} onClick={() => item && setDodDetail(item)}
                              title={item ? 'Voir le détail' : undefined}
                              className="text-xs px-2 py-0.5 rounded-full bg-brand/10 text-brand font-mono font-medium hover:bg-brand/20 transition-colors disabled:cursor-default"
                              disabled={!item}>
                              {code}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {panel.commentaire && <div><div className="ds-label mb-1">Commentaire PO</div><p className="text-xs text-slate-400 italic">{panel.commentaire}</p></div>}

                  {panel.statut !== 'Fait' && (
                    <div>
                      <div className="ds-label mb-1.5">Déplacer vers sprint</div>
                      <div className="flex gap-2">
                        <select defaultValue={panel.sprint || panel.sprint_debut || ''}
                          className="ds-select text-xs flex-1" id={`sprint-move-${panel.id_tache}`}>
                          <option value="">Backlog</option>
                          {SPRINTS_LIST.map(s => <option key={s}>{s}</option>)}
                        </select>
                        <button onClick={async () => {
                          const sel = document.getElementById(`sprint-move-${panel.id_tache}`) as HTMLSelectElement
                          const val = sel?.value ?? ''
                          await updateTache.mutateAsync({ id_tache: panel.id_tache, updates: { sprint: val, sprint_debut: val || null } })
                          toast(`${panel.id_tache} → ${val || 'Backlog'}`)
                        }} className="ds-btn ds-btn-sm">✓</button>
                      </div>
                    </div>
                  )}

                  {(childMap[panel.id_tache] ?? []).length > 0 && (
                    <div>
                      <div className="ds-label mb-2">Toutes les sous-tâches</div>
                      {(childMap[panel.id_tache] ?? []).map(s => (
                        <div key={s.id_tache} className="flex items-center gap-2 py-1">
                          <div className={cn('w-2 h-2 rounded-full shrink-0',
                            s.statut === 'Fait'     ? 'bg-emerald-400' :
                            s.statut === 'En cours' ? 'bg-amber-400' :
                            s.statut === 'Bloqué'   ? 'bg-rose-400' : 'bg-slate-300')} />
                          <span className={cn('text-xs flex-1', s.statut === 'Fait' && 'line-through text-slate-400')}>{s.titre}</span>
                          {s.assigne_a && <span className="text-xs bg-indigo-50 text-indigo-700 px-1.5 rounded-full">{s.assigne_a}</span>}
                          <StatutBadge value={s.statut} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </details>

              {produitActif && (
                <div className="pt-3 mt-1 border-t-2 border-slate-300">
                  <TacheExtras produitId={produitActif.id} tache={panel} membres={membres} userId={user?.id ?? null} toast={toast} />
                </div>
              )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal Effort réalisé */}
      {effortModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand/40 backdrop-blur-sm"
          onClick={() => setEffortModal(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-96 p-5 space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Clôturer la tâche</p>
              <p className="text-sm font-bold text-navy">{effortModal.tache.id_tache}</p>
              <p className="text-xs text-slate-400 leading-snug line-clamp-2">{effortModal.tache.titre}</p>
            </div>
            {modalCriteres.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-navy">Critères d'acceptation</label>
                <div className="bg-bg rounded-xl p-2.5">
                  <CriteresEditor items={modalCriteres} onChange={setModalCriteres} compact />
                </div>
              </div>
            )}
            {effortModal.tache.effort_j > 0 && (
              <p className="text-xs text-slate-400">Estimé : <span className="font-semibold text-navy">{effortModal.tache.effort_j}j</span></p>
            )}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-navy">Jours réalisés <span className="text-rose-500">*</span></label>
              <div className="flex items-center gap-2">
                <input type="number" min="0" step="0.5" value={effortInput}
                  onChange={e => setEffortInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmEffort()}
                  autoFocus className="ds-input text-sm font-semibold text-center flex-1" placeholder="Ex : 2.5" />
                <span className="text-sm text-slate-400 font-medium">jours</span>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={confirmEffort} disabled={effortInput === ''} className="ds-btn-primary flex-1 disabled:opacity-40">Confirmer</button>
              <button onClick={() => setEffortModal(null)} className="ds-btn">Annuler</button>
            </div>
            <button onClick={skipEffort}
              className="w-full text-center text-[11px] text-slate-400 hover:text-navy underline underline-offset-2 transition-colors">
              Passer sans renseigner l'effort
            </button>
          </div>
        </div>
      )}

      {/* Modal Sous-tâche */}
      {sousTacheFor && (
        <SousTacheModal
          parent={sousTacheFor}
          sprint={sprint4Board}
          membres={membres}
          onClose={() => setSousTacheFor(null)}
          onCreate={async payload => {
            const res = await createSub.mutateAsync({ parentId: sousTacheFor.id_tache, payload })
            toast(`${res.id_tache} créée`)
            setExpandedSubs(prev => new Set([...prev, sousTacheFor.id_tache]))
          }}
        />
      )}

      <DodDetailModal item={dodDetail} onClose={() => setDodDetail(null)} />
    </Layout>
  )
}
