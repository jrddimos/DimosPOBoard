import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { useProduit } from '@/contexts/ProduitContext'
import { useProduits } from '@/hooks/useProduits'
import { getQuarterEnd } from '@/utils/produitMetrics'
import { Spinner } from '@/components/ui/Spinner'
import { SprintStatutBadge } from '@/components/ui/Badge'
import { useSprints, useSprintActif, useUpsertSprint, useDeleteSprint } from '@/hooks/useSprints'
import { useTaches, useUpdateTache } from '@/hooks/useTaches'
import { useRestoreTache, useUndoFieldChange } from '@/hooks/useActivityUndo'
import { useActivityLog, useGlobalActivityLog, useClearActivityLog, useClearGlobalActivityLog, type ActivityLog } from '@/hooks/useActivityLog'
import { useToast } from '@/hooks/useToast'
import { confirm } from '@/components/ui/ConfirmModal'
import { supabase } from '@/lib/supabase'
import { downloadCSV, buildCSVString, naturalCompare, buildTacheIndex, buildChildMap, effortEffectif, parseCriteres, serializeCriteres, formatSprintLabel, type CritereItem } from '@/lib/utils'
import { isEligibleForBacklog, isInThisSprint, buildEligibleTree } from '@/lib/sprintEligibility'
import { TacheTree } from '@/components/tache/TacheTree'
import { TacheDetailPanel } from '@/components/tache/TacheDetailPanel'
import { useProduitIterations, useUpdateIteration, useTransferToNextIteration, type TacheIteration } from '@/hooks/useTacheIterations'
// @react-pdf/renderer et exceljs sont lourds (~800 Ko à eux deux) : chargés
// à la demande au clic sur export, pas au chargement de la page.
import { METIERS_DEFAULT, SPRINTS_LIST, BRAND_COLORS } from '@/constants'
import { useEpics, useCreateEpic, useUpdateEpic, useDeleteEpic, useReorderEpics, epicFullName, type Epic } from '@/hooks/useEpics'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useJalons, useCreateJalon, useUpdateJalon, useDeleteJalon, useReorderJalons, type Jalon } from '@/hooks/useJalons'
import { useDod } from '@/hooks/useDod'
import {
  Pencil, Trash2, Plus, ChevronDown, ChevronRight, Check, X,
  Tag, Calendar, BookOpen, Target, Download, FileDown, Settings, Lock, Euro, Users, Clock,
  Play, Pause, RotateCcw, CheckCircle2, Zap, Wrench, GripVertical,
} from 'lucide-react'
import { PageTitle } from '@/components/ui/PageTitle'
import { SelectPicker } from '@/components/ui/SelectPicker'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import type { SprintStats, Tache } from '@/types'
import FinanceTab from '@/pages/admin/FinanceSetupPage'
import EquipesTab from '@/pages/admin/EquipesUtilisateursPage'

type SetupTab = 'sprints'|'epics'|'jalons'|'activite'|'metiers'|'export'|'finance'|'equipes'|'global'

// Thèmes est ouvert à tous (lecture seule pour les non-admins) ; Finance et
// Équipes restent réservés aux admins, comme avant leur fusion dans Setup.
// (La Roadmap multi-produits a été déplacée vers /roadmap, menu Global —
// plus un onglet Setup, voir src/pages/roadmap/RoadmapPage.tsx.)
const GLOBAL_TABS_ALL   = [
  { key: 'metiers' as SetupTab, label: 'Thèmes',                 icon: <Tag size={12} /> },
]
const GLOBAL_TABS_ADMIN = [
  { key: 'equipes' as SetupTab, label: 'Équipes & Utilisateurs',  icon: <Users size={12} /> },
  { key: 'finance' as SetupTab, label: 'Finance',                icon: <Euro size={12} /> },
  // Exporte des données tous produits confondus (avec filtre optionnel par
  // produit) — jamais un réglage d'UN SEUL produit, donc à sa place ici et
  // pas dans les onglets produit (où il vivait par erreur auparavant, avec
  // en plus un accès non réservé aux admins).
  { key: 'export'  as SetupTab, label: 'Export',                 icon: <Download size={12} /> },
  // Historique + restauration des entités transverses (équipes, finance,
  // fermetures, gammes, ROCKS, roadmap, suggestions…) — jamais rattachées à
  // un seul produit, donc pas dans l'onglet Activité produit. Réservé aux
  // admins : la RLS sur `activite` retombe déjà sur is_admin() dès que
  // produit_id IS NULL (has_produit_role(NULL,...) ne matche jamais).
  { key: 'global'  as SetupTab, label: 'Global',                 icon: <Clock size={12} /> },
]
const PRODUCT_TABS = [
  { key: 'sprints'  as SetupTab, label: 'Sprints',  icon: <Calendar size={12} /> },
  { key: 'epics'    as SetupTab, label: 'Epics',    icon: <BookOpen size={12} /> },
  { key: 'jalons'   as SetupTab, label: 'Jalons - Incréments majeurs', icon: <Target size={12} /> },
  // Historique + restauration : ouvert à tous (comme avant sa fusion dans
  // Setup), les actions sensibles (Annuler/Restaurer/Effacer) restent
  // gérées à l'intérieur du composant (canWrite / isAdmin).
  { key: 'activite' as SetupTab, label: 'Activité', icon: <Clock size={12} /> },
]

export default function SetupPage() {
  const [params]         = useSearchParams()
  const { produitActif } = useProduit()
  const { canEdit, isAdmin } = useAuth()
  const [tab, setTab]    = useState<SetupTab>('metiers')
  const canEditProduct   = produitActif ? canEdit(produitActif.id) : false

  // Onglets visibles selon le contexte : jamais mélangés
  const GLOBAL_TABS  = [...(isAdmin ? GLOBAL_TABS_ADMIN : []), ...GLOBAL_TABS_ALL]
  const isProductTab = (t: SetupTab) => PRODUCT_TABS.some(x => x.key === t)
  const isGlobalTab  = (t: SetupTab) => t === 'metiers' || t === 'finance' || t === 'equipes' || t === 'export' || t === 'global'
  const tabs = isProductTab(tab) ? PRODUCT_TABS : GLOBAL_TABS

  useEffect(() => {
    const t = params.get('tab') as SetupTab
    if (t && isGlobalTab(t)) { setTab(t); return }
    if (t && PRODUCT_TABS.some(x => x.key === t)) { setTab(t); return }
    // Pas de tab dans l'URL : contexte produit → sprints ; sinon → Équipes &
    // Utilisateurs pour un admin (premier onglet global), Thèmes sinon (seul
    // onglet global accessible aux non-admins).
    setTab(produitActif ? 'sprints' : isAdmin ? 'equipes' : 'metiers')
  }, [params, produitActif, isAdmin])

  return (
    <Layout>
      <div className="page-topbar -mx-3 -mt-3 mb-3 px-3 md:-mx-5 md:-mt-5 md:mb-5 md:px-5 gap-y-2">
        <PageTitle icon={<Settings size={15}/>} label="Setup" />
        <div className="flex gap-0.5 bg-bg border border-border rounded-lg p-0.5 flex-wrap">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all',
                tab === t.key ? 'bg-card shadow-sm text-navy' : 'text-subtle hover:text-navy'
              )}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>
      {(tab === 'sprints' || tab === 'epics' || tab === 'jalons') && !canEditProduct ? (
        <div className="ds-card flex items-center gap-2 text-sm text-subtle">
          <Lock size={14}/> Accès en lecture seule — la gestion des sprints, epics et jalons est réservée aux PO du produit.
        </div>
      ) : tab === 'metiers' && !isAdmin ? (
        <div className="ds-card flex items-center gap-2 text-sm text-subtle">
          <Lock size={14}/> Accès en lecture seule — la gestion des thèmes globaux est réservée aux administrateurs.
        </div>
      ) : (tab === 'finance' || tab === 'equipes' || tab === 'export' || tab === 'global') && !isAdmin ? (
        <div className="ds-card flex items-center gap-2 text-sm text-subtle">
          <Lock size={14}/> Accès réservé aux administrateurs.
        </div>
      ) : <>
        {tab === 'sprints' && <SprintsTab />}
        {tab === 'epics'   && <EpicsTab />}
        {tab === 'jalons'  && <JalonsTab />}
        {tab === 'activite' && <ActiviteTab />}
        {tab === 'metiers' && <MetiersTab />}
        {tab === 'export'  && <ExportTab />}
        {tab === 'finance' && <FinanceTab />}
        {tab === 'equipes' && <EquipesTab />}
        {tab === 'global'  && <GlobalActiviteTab />}
      </>}
    </Layout>
  )
}

// ─── Inline edit field ────────────────────────────────────────
function InlineEdit({ value, onSave, placeholder = '', inputClassName = 'w-48' }: { value: string; onSave: (v: string) => void; placeholder?: string; inputClassName?: string }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(value)
  const ref                   = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  if (!editing) return (
    <button onClick={() => { setVal(value); setEditing(true) }}
      className="flex items-center gap-1 text-sm font-semibold text-navy hover:text-indigo-600 transition-colors group">
      {value || <span className="text-subtle italic">{placeholder}</span>}
      <Pencil size={11} className="max-md:opacity-100 opacity-0 group-hover:opacity-60" />
    </button>
  )
  return (
    <div className="flex items-center gap-1">
      <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
        className={cn('ds-input py-0.5 text-sm font-semibold', inputClassName)}
        onKeyDown={e => { if (e.key === 'Enter') { onSave(val); setEditing(false) } if (e.key === 'Escape') setEditing(false) }} />
      <button onClick={() => { onSave(val); setEditing(false) }}
        className="p-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100"><Check size={12} /></button>
      <button onClick={() => setEditing(false)}
        className="p-1 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100"><X size={12} /></button>
    </div>
  )
}

// Variante multi-ligne d'InlineEdit, pour les champs longs (description) —
// sauvegarde au blur plutôt qu'à l'Entrée (qui doit rester un retour à la
// ligne dans un textarea), Échap annule.
function InlineEditTextarea({ value, onSave, placeholder = '', missingHint }: {
  value: string; onSave: (v: string) => void; placeholder?: string
  // Affiché à la place du texte quand value est vide — signale un champ
  // obligatoire pas encore rempli (ex: backfill de migration).
  missingHint?: string
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(value)
  const ref                   = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  function commit() { const v = val.trim(); if (v !== value) onSave(v); setEditing(false) }
  if (!editing) return (
    <button onClick={() => { setVal(value); setEditing(true) }}
      className="flex items-start gap-1 text-xs text-left text-subtle hover:text-navy transition-colors group w-full">
      <span className="flex-1">
        {value || (missingHint
          ? <span className="text-amber-600 italic">⚠ {missingHint}</span>
          : <span className="italic">{placeholder}</span>)}
      </span>
      <Pencil size={10} className="max-md:opacity-100 opacity-0 group-hover:opacity-60 shrink-0 mt-0.5" />
    </button>
  )
  return (
    <div className="flex flex-col gap-1">
      <textarea ref={ref} value={val} onChange={e => setVal(e.target.value)} rows={2}
        className="ds-textarea text-xs" placeholder={placeholder}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }} />
    </div>
  )
}

// ─── SPRINTS TAB ──────────────────────────────────────────────
function SprintsTab() {
  const { data: sprints = [], isLoading } = useSprints()
  const { data: sprintActif }             = useSprintActif()
  const { data: taches = [] }             = useTaches()
  const { produitActif }                  = useProduit()
  const { data: produits = [] }           = useProduits()
  const produit = produits.find(p => p.id === produitActif?.id)
  const upsertSprint  = useUpsertSprint()
  const deleteSprint  = useDeleteSprint()
  const updateTache   = useUpdateTache()
  const toast         = useToast()
  const [selected,       setSelected]       = useState('')
  const [showTasks,      setShowTasks]      = useState(true)
  const [freeObj,        setFreeObj]        = useState('')
  const [freeRev,        setFreeRev]        = useState('')
  const [items,          setItems]          = useState<string[]>([])
  const [checks,         setChecks]         = useState<Record<string, boolean>>({})
  const [newItem,        setNewItem]        = useState('')
  // Repli/dépli indépendant pour chaque panneau (avant : une seule variable
  // partagée entre "Objectifs" et "Review", donc déplier l'un repliait l'autre).
  const [openObjChecklist, setOpenObjChecklist] = useState(true)
  const [openRevChecklist, setOpenRevChecklist] = useState(true)
  const [closeModal,     setCloseModal]     = useState(false)
  const [tacheDest,      setTacheDest]      = useState<Record<string, 'next' | 'backlog'>>({})
  const [tempsPasse,     setTempsPasse]     = useState<Record<string, string>>({})
  // Critères d'acceptation cochables dans la modal de clôture (US démarrées) :
  // ce qui est coché ici est figé sur l'itération du sprint qui ferme.
  const [criteresClose,  setCriteresClose]  = useState<Record<string, CritereItem[]>>({})
  const [plannedStart,   setPlannedStart]   = useState('')
  // 'trim' = jusqu'à la fin du trimestre auquel ce sprint est rattaché (via
  // objectifs_trimestriels.sprints_ids) — pour les sprints "amélioration
  // continue" qui courent sur tout le trimestre plutôt que 1-4 semaines.
  const [plannedWeeks,   setPlannedWeeks]   = useState<number | 'trim'>(2)
  const transferIteration = useTransferToNextIteration()
  const { data: iterationsMap = new Map<string, TacheIteration[]>() } = useProduitIterations(produitActif?.id ?? null)

  // Critères courants d'une US : ceux de sa dernière itération si elle en a,
  // sinon ceux portés par la tâche (même logique d'affichage que TachesPage).
  function currentCriteres(t: Tache): CritereItem[] {
    const iters = iterationsMap.get(t.id_tache)
    return parseCriteres(iters?.length ? iters[iters.length - 1].criteres : t.criteres)
  }

  const sprint     = sprints.find(s => s.numero === selected)
  // `t.sprint` (l'ancien champ, avant sprint_debut/sprint_fin) porte une
  // valeur par défaut ('S01' constaté en base) sur la quasi-totalité des
  // tâches, y compris jamais planifiées — seul sprint_debut est fiable ici
  // (même bug que celui corrigé dans src/lib/sprintEligibility.ts).
  const spTaches   = taches.filter(t => !t.parent_id && t.type_tache !== 'Conteneur' && t.sprint_debut === selected)
  const unfinished = spTaches.filter(t => t.statut !== 'Fait')
  // Effort d'une US = effort propre + somme de ses sous-tâches (cf.
  // effortEffectif / migration 0057) — pour les stats et la clôture.
  const spChildMap = useMemo(() => buildChildMap(taches), [taches])
  const statLabel: { [k: string]: string } = { planifie: 'planifié', en_cours: 'en cours', pause: 'en pause', cloture: 'clôturé' }

  // Seuls les sprints réellement créés pour CE produit apparaissent dans le
  // sélecteur (avant : les 16 créneaux S01-S16 étaient tous listés même à
  // vide). "+ Ajouter" crée le prochain numéro disponible directement, sans
  // popup — SPRINTS_LIST ne sert plus que de plafond/ordre chronologique.
  const sortedSprints = [...sprints].sort((a, b) => SPRINTS_LIST.indexOf(a.numero) - SPRINTS_LIST.indexOf(b.numero))
  const existingNums  = new Set(sprints.map(s => s.numero))
  const nextNum       = SPRINTS_LIST.find(s => !existingNums.has(s)) ?? null

  async function addNextSprint() {
    if (!nextNum) { toast('Limite de 16 sprints atteinte', 'error'); return }
    await upsertSprint.mutateAsync({ numero: nextNum, statut: 'planifie', est_actif: false })
    toast(`Sprint ${formatSprintLabel(nextNum)} créé`)
    selectSprint(nextNum)
  }
  const doneCount = items.filter(i => checks[i]).length
  const pct       = items.length ? Math.round(doneCount / items.length * 100) : 0

  const canEditObj    = !sprint || sprint.statut === 'planifie' || sprint.statut === 'pause'
  const canToggleCheck = !sprint || sprint.statut !== 'cloture'

  const nextSprint = (() => {
    const idx = SPRINTS_LIST.indexOf(selected)
    return idx >= 0 && idx < SPRINTS_LIST.length - 1 ? SPRINTS_LIST[idx + 1] : null
  })()

  function parseSprint(s: { objectifs?: string | null; review?: string | null } | undefined) {
    const oLines = (s?.objectifs ?? '').split('\n')
    const parsed = oLines.filter(l => l.trimStart().startsWith('- ')).map(l => l.trimStart().slice(2).trim()).filter(Boolean)
    const fObj   = oLines.filter(l => !l.trimStart().startsWith('- ')).join('\n').trim()
    const rLines = (s?.review ?? '').split('\n')
    const ch: Record<string, boolean> = {}
    parsed.forEach(i => { ch[i] = false })
    rLines.filter(l => l.trim().startsWith('[x] ') || l.trim().startsWith('[ ] ')).forEach(l => {
      const ok = l.trim().startsWith('[x] '); const txt = l.trim().slice(4).trim(); ch[txt] = ok
    })
    const fRev = rLines.filter(l => !l.trim().startsWith('[x] ') && !l.trim().startsWith('[ ] ')).join('\n').trim()
    setItems(parsed); setChecks(ch); setFreeObj(fObj); setFreeRev(fRev)
  }

  // Sélectionne le sprint actif une seule fois (tant que `selected` est vide)
  // — volontairement absent des dépendances pour ne pas écraser un choix
  // manuel de l'utilisateur via selectSprint().
  useEffect(() => {
    if (sprintActif?.numero && !selected) {
      setSelected(sprintActif.numero); parseSprint(sprintActif)
      setPlannedStart(sprintActif.started_at ? sprintActif.started_at.slice(0, 10) : '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprintActif])

  function selectSprint(num: string) {
    const sp = sprints.find(x => x.numero === num)
    setSelected(num); parseSprint(sp); setShowTasks(true)
    setPlannedStart(sp?.started_at ? sp.started_at.slice(0, 10) : '')
  }

  async function savePlannedDates() {
    if (!selected || !plannedStart) { toast('Choisis une date de début', 'error'); return }
    const start = new Date(plannedStart + 'T00:00:00')
    let end: Date
    let label: string
    if (plannedWeeks === 'trim') {
      const trim = (produit?.objectifs_trimestriels ?? []).find(t => (t.sprints_ids ?? []).includes(selected))
      const trimEnd = trim ? getQuarterEnd(trim.trimestre) : null
      if (!trimEnd) {
        toast(`${formatSprintLabel(selected)} n'est rattaché à aucun trimestre — rattache-le d'abord dans Config produit.`, 'error')
        return
      }
      end = trimEnd
      label = `jusqu'à la fin de ${trim!.trimestre}`
    } else {
      end = new Date(start.getTime() + plannedWeeks * 7 * 86400000)
      label = `${plannedWeeks} semaine${plannedWeeks > 1 ? 's' : ''}`
    }
    await upsertSprint.mutateAsync({ numero: selected, started_at: start.toISOString(), closed_at: end.toISOString() } as Parameters<typeof upsertSprint.mutateAsync>[0])
    toast(`Dates de ${formatSprintLabel(selected)} enregistrées (${label})`)
  }

  async function action(type: 'start' | 'pause' | 'close' | 'unlock') {
    if (!selected) { toast('Sélectionnez un sprint', 'error'); return }
    if (type === 'close') {
      if (unfinished.length > 0) {
        const dest: Record<string, 'next' | 'backlog'> = {}
        const crit: Record<string, CritereItem[]> = {}
        unfinished.forEach(t => {
          dest[t.id_tache] = nextSprint ? 'next' : 'backlog'
          if (t.statut !== 'À faire') crit[t.id_tache] = currentCriteres(t)
        })
        setTacheDest(dest); setTempsPasse({}); setCriteresClose(crit); setCloseModal(true); return
      }
      await doClose(computeStats(spTaches)); return
    }
    const now = new Date().toISOString()
    const map: { [k: string]: { statut: string; est_actif: boolean; started_at?: string } } = {
      start:  { statut: 'en_cours', est_actif: true, started_at: now },
      pause:  { statut: 'pause',    est_actif: false },
      unlock: { statut: 'planifie', est_actif: false },
    }
    if (type === 'start') await supabase.from('sprints').update({ est_actif: false }).neq('numero', selected)
    await upsertSprint.mutateAsync({ numero: selected, ...map[type] } as Parameters<typeof upsertSprint.mutateAsync>[0])
    toast(`Sprint ${formatSprintLabel(selected)} mis à jour`)
  }

  function computeStats(tasks: typeof spTaches): SprintStats {
    const total = tasks.length
    const fait  = tasks.filter(t => t.statut === 'Fait').length
    return {
      total,
      fait,
      encours: tasks.filter(t => t.statut === 'En cours').length,
      bloque:  tasks.filter(t => t.statut === 'Bloqué').length,
      effort:  tasks.reduce((s, t) => s + effortEffectif(t, spChildMap), 0),
      pct:     total ? Math.round(fait / total * 100) : 0,
    }
  }

  async function doClose(stats: SprintStats) {
    const now = new Date().toISOString()
    await upsertSprint.mutateAsync({ numero: selected, statut: 'cloture', est_actif: false, closed_at: now, stats } as Parameters<typeof upsertSprint.mutateAsync>[0])
    toast(`Sprint ${formatSprintLabel(selected)} clôturé`)
  }

  async function confirmClose() {
    const stats = computeStats(spTaches)
    for (const [id_tache, dest] of Object.entries(tacheDest)) {
      const t = unfinished.find(u => u.id_tache === id_tache)
      const destSprint = dest === 'next' && nextSprint ? nextSprint : null
      if (t && t.statut !== 'À faire') {
        // US démarrée : on fige le temps passé sur ce sprint et on reporte
        // le reste à faire sur une nouvelle itération (voir
        // useTransferToNextIteration) plutôt que de juste déplacer la tâche.
        await transferIteration.mutateAsync({
          id_tache, tempsPasse: Number(tempsPasse[id_tache]) || 0,
          closingSprint: selected, destSprint,
          criteres: criteresClose[id_tache] ? serializeCriteres(criteresClose[id_tache]) : null,
        })
      } else if (destSprint) {
        await updateTache.mutateAsync({ id_tache, updates: { sprint: destSprint, sprint_debut: destSprint } })
      } else {
        await updateTache.mutateAsync({ id_tache, updates: { sprint: '', sprint_debut: null, sprint_fin: null } })
      }
    }
    await doClose(stats)
    setCloseModal(false)
  }

  async function save() {
    if (!selected) { toast('Sélectionnez un sprint', 'error'); return }
    const objParts = [freeObj.trim(), ...items.map(i => `- ${i}`)].filter(Boolean)
    const revParts = [freeRev.trim(), ...items.map(i => `${checks[i] ? '[x]' : '[ ]'} ${i}`)].filter(Boolean)
    await upsertSprint.mutateAsync({ numero: selected, objectifs: objParts.join('\n'), review: revParts.join('\n') } as Parameters<typeof upsertSprint.mutateAsync>[0])
    toast('Sauvegardé')
  }

  function addItem() {
    const txt = newItem.trim(); if (!txt) return
    setItems(p => [...p, txt]); setChecks(p => ({ ...p, [txt]: false })); setNewItem('')
  }
  function removeItem(item: string) {
    setItems(p => p.filter(i => i !== item)); setChecks(p => { const n = { ...p }; delete n[item]; return n })
  }
  function toggleCheck(item: string) { if (canToggleCheck) setChecks(p => ({ ...p, [item]: !p[item] })) }

  if (isLoading) return <Spinner />
  return (
    <>
      {/* ── Modal clôture avec US non terminées ─────────────── */}
      {closeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-border">
              <h3 className="text-base font-bold text-navy">Clôturer le sprint {formatSprintLabel(selected)}</h3>
              <p className="text-sm text-subtle mt-1">{unfinished.length} US non terminée(s) — que faire avec ces US ?</p>
            </div>
            <div className="flex gap-2 px-5 pt-4">
              {nextSprint && (
                <button onClick={() => setTacheDest(Object.fromEntries(Object.keys(tacheDest).map(k => [k, 'next'])))}
                  className="ds-btn ds-btn-sm flex-1">Tout → {nextSprint}</button>
              )}
              <button onClick={() => setTacheDest(Object.fromEntries(Object.keys(tacheDest).map(k => [k, 'backlog'])))}
                className="ds-btn ds-btn-sm flex-1">Tout → Backlog</button>
            </div>
            <div className="flex flex-col gap-2 px-5 py-4 overflow-y-auto flex-1">
              {unfinished.map(t => {
                const demarree = t.statut !== 'À faire'
                return (
                <div key={t.id_tache} className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-bg text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-indigo-600 w-16 shrink-0">{t.id_tache}</span>
                    <span className="flex-1 truncate text-navy">{t.titre}</span>
                    <div className="flex gap-1 shrink-0">
                      {nextSprint && (
                        <button onClick={() => setTacheDest(p => ({ ...p, [t.id_tache]: 'next' }))}
                          className={cn('px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors',
                            tacheDest[t.id_tache] === 'next' ? 'bg-indigo-500 text-white' : 'bg-border/60 text-subtle hover:bg-indigo-100')}>
                          {nextSprint}
                        </button>
                      )}
                      <button onClick={() => setTacheDest(p => ({ ...p, [t.id_tache]: 'backlog' }))}
                        className={cn('px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors',
                          tacheDest[t.id_tache] === 'backlog' ? 'bg-slate-700 text-white' : 'bg-border/60 text-subtle hover:bg-slate-100')}>
                        Backlog
                      </button>
                    </div>
                  </div>
                  {demarree && (
                    <div className="flex items-center gap-1.5 pl-[72px]">
                      <span className="text-subtle">Jours passés sur ce sprint</span>
                      <input type="number" min={0} step={0.1} placeholder="0"
                        value={tempsPasse[t.id_tache] ?? ''}
                        onChange={e => setTempsPasse(p => ({ ...p, [t.id_tache]: e.target.value }))}
                        className="ds-input text-xs w-16 py-0.5" />
                      <span className="text-subtle/70">/ {effortEffectif(t, spChildMap)}j estimés</span>
                    </div>
                  )}
                  {demarree && (criteresClose[t.id_tache]?.length ?? 0) > 0 && (
                    <div className="flex flex-col gap-1 pl-[72px]">
                      <span className="text-subtle">Critères réalisés sur ce sprint :</span>
                      {criteresClose[t.id_tache].map(c => (
                        <label key={c.id} className="flex items-start gap-1.5 cursor-pointer group">
                          <input type="checkbox" checked={c.checked}
                            onChange={() => setCriteresClose(p => ({
                              ...p,
                              [t.id_tache]: p[t.id_tache].map(i => i.id === c.id
                                ? { ...i, checked: !i.checked, checked_at: !i.checked ? new Date().toISOString() : null }
                                : i),
                            }))}
                            className="mt-0.5 accent-indigo-500 shrink-0" />
                          <span className={cn('leading-snug', c.checked ? 'text-navy line-through decoration-subtle/50' : 'text-subtle group-hover:text-navy')}>
                            {c.text}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                )
              })}
            </div>
            <div className="flex gap-3 justify-end px-5 py-4 border-t border-border">
              <button onClick={() => setCloseModal(false)} className="ds-btn ds-btn-sm">Annuler</button>
              <button onClick={confirmClose} disabled={updateTache.isPending || transferIteration.isPending}
                className="ds-btn-primary ds-btn-sm">Clôturer le sprint</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">

        {/* ── Zone 1 : bandeau sprint + actions ────────────────── */}
        <div className="ds-card">
          <div className="flex items-center gap-3 flex-wrap">
            {sprints.length === 0 ? (
              <button onClick={addNextSprint} disabled={upsertSprint.isPending}
                className="ds-btn-primary ds-btn-sm flex items-center gap-1.5 disabled:opacity-40">
                <Plus size={13} /> Créer le premier sprint ({formatSprintLabel(nextNum)})
              </button>
            ) : (
              <>
                <div className="w-full sm:w-64">
                  <SelectPicker
                    value={selected}
                    onChange={v => selectSprint(v)}
                    placeholder="-- Choisir un sprint --"
                    searchable
                    options={sortedSprints.map(s => ({ value: s.numero, label: `${formatSprintLabel(s.numero)} — ${statLabel[s.statut] || s.statut}` }))}
                  />
                </div>
                <button onClick={addNextSprint} disabled={!nextNum || upsertSprint.isPending}
                  title={nextNum ? `Créer ${formatSprintLabel(nextNum)}` : 'Limite de 16 sprints atteinte'}
                  className="p-1.5 rounded-lg text-subtle hover:text-navy hover:bg-bg transition-colors disabled:opacity-30">
                  <Plus size={15} />
                </button>
              </>
            )}
            {sprint && <SprintStatutBadge value={sprint.statut} />}

            {selected && (
              <div className="flex items-center gap-1.5 sm:ml-auto flex-wrap">
                <button onClick={() => action('start')} disabled={sprint?.statut === 'en_cours' || sprint?.statut === 'cloture'}
                  className="ds-btn ds-btn-sm flex items-center gap-1.5 bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600 disabled:opacity-40">
                  <Play size={12} /> Démarrer
                </button>
                <button onClick={() => action('pause')} disabled={sprint?.statut !== 'en_cours'}
                  className="ds-btn ds-btn-sm flex items-center gap-1.5 bg-amber-500 text-white border-amber-500 hover:bg-amber-600 disabled:opacity-40">
                  <Pause size={12} /> Pause
                </button>
                <button onClick={() => action('close')} disabled={sprint?.statut === 'cloture'}
                  className="ds-btn-primary ds-btn-sm flex items-center gap-1.5 disabled:opacity-40">
                  <CheckCircle2 size={12} /> Clôturer
                </button>
                {sprint?.statut === 'cloture' && (
                  <button onClick={() => action('unlock')} className="ds-btn ds-btn-sm flex items-center gap-1.5">
                    <RotateCcw size={12} /> Rouvrir
                  </button>
                )}
                <div className="w-px h-5 bg-border mx-0.5" />
                {sprint && (
                  <button title="Export Review PDF"
                    onClick={async () => { const { exportSprintReviewPDF } = await import('@/lib/exportPdf'); exportSprintReviewPDF(sprint, spTaches) }}
                    className="p-1.5 rounded-lg text-subtle hover:text-navy hover:bg-bg transition-colors">
                    <FileDown size={14} />
                  </button>
                )}
                <button title="Supprimer ce sprint" onClick={async () => {
                    if (spTaches.length > 0) { toast(`${spTaches.length} US dans ce sprint`, 'error'); return }
                    if (!await confirm({ title: 'Supprimer ce sprint ?', message: `Le sprint ${formatSprintLabel(selected)} sera supprimé.`, confirmLabel: 'Supprimer', variant: 'danger' })) return
                    await deleteSprint.mutateAsync(selected); toast('Supprimé'); setSelected('')
                  }}
                  className="p-1.5 rounded-lg text-subtle hover:text-red hover:bg-red/10 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {!selected ? (
          <div className="ds-card flex items-center justify-center py-14 text-subtle text-sm">
            Choisissez un sprint ci-dessus pour voir sa planification et ses objectifs.
          </div>
        ) : (
          <>
            {/* ── Zone 2 : planification + stats ──────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="ds-card">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Calendar size={12} className="text-navy/60" />
                  <span className="text-[11px] font-bold text-navy/75 uppercase tracking-wide">Planification</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input type="date" value={plannedStart} onChange={e => setPlannedStart(e.target.value)}
                    className="ds-input text-xs flex-1" />
                  <select value={plannedWeeks} onChange={e => setPlannedWeeks(e.target.value === 'trim' ? 'trim' : Number(e.target.value))}
                    className="ds-select text-xs w-32">
                    {[1, 2, 3, 4].map(w => <option key={w} value={w}>{w} sem.</option>)}
                    <option value="trim">Fin de trimestre</option>
                  </select>
                  <button onClick={savePlannedDates} disabled={!plannedStart || upsertSprint.isPending}
                    className="ds-btn ds-btn-sm shrink-0 disabled:opacity-40">Enregistrer</button>
                </div>
                {sprint?.started_at && (
                  <p className="text-[11px] text-subtle mt-2">
                    {new Date(sprint.started_at).toLocaleDateString('fr-FR')} → {sprint.closed_at ? new Date(sprint.closed_at).toLocaleDateString('fr-FR') : '—'}
                  </p>
                )}
              </div>

              {sprint && spTaches.length > 0 ? (() => {
                const liveStats = computeStats(spTaches)
                const stats     = sprint.statut === 'cloture' && sprint.stats && spTaches.length === 0 ? sprint.stats : liveStats
                const isClosed  = sprint.statut === 'cloture'
                return (
                  <div className="ds-card">
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-[11px] font-bold text-navy/75 uppercase tracking-wide">{isClosed ? 'Stats clôture' : 'Stats en cours'}</span>
                      {!isClosed && <span className="text-[11px] text-subtle italic">temps réel</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {([['Total US', stats.total], ['Terminées', `${stats.fait} (${stats.pct}%)`], ['En cours', stats.encours], ['Bloquées', stats.bloque], ['Effort', `${stats.effort}j`]] as [string, string | number][]).map(([k, v]) => (
                        <div key={k} className="bg-bg rounded-lg p-2 text-center">
                          <div className="text-sm font-bold text-navy">{v}</div>
                          <div className="text-[10px] text-subtle">{k}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })() : (
                <div className="ds-card flex items-center justify-center text-xs text-subtle italic">
                  Pas encore de tâches dans ce sprint
                </div>
              )}
            </div>

            {/* ── Zone 3 : objectifs + review ──────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Objectifs */}
              <div className={cn('ds-card flex flex-col gap-3', !canEditObj && 'opacity-70')}>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-navy/75 uppercase tracking-wide flex-1">Objectifs</span>
                  {!canEditObj && <span className="text-[11px] text-orange font-semibold">Sprint en cours</span>}
                </div>
                <textarea value={freeObj} onChange={e => setFreeObj(e.target.value)} rows={7}
                  readOnly={!canEditObj}
                  className={cn('ds-textarea w-full resize-y', !canEditObj && 'cursor-not-allowed bg-bg/50')}
                  placeholder="Notes libres sur les objectifs…" />
                <div className="flex items-center gap-2">
                  <button onClick={() => setOpenObjChecklist(o => !o)}
                    className="flex items-center gap-2 text-xs font-semibold text-navy hover:text-brand transition-colors">
                    {openObjChecklist ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    Objectifs clés ({items.length})
                  </button>
                  {canEditObj && (
                    <div className="flex gap-1 ml-auto">
                      <input value={newItem} onChange={e => setNewItem(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addItem()}
                        className="ds-input text-xs h-6 px-2 w-32" placeholder="Ajouter…" />
                      <button onClick={addItem} className="ds-btn ds-btn-sm h-6 px-1.5"><Plus size={10} /></button>
                    </div>
                  )}
                </div>
                {openObjChecklist && (
                  items.length === 0
                    ? <p className="text-xs text-subtle italic pl-4">Aucun objectif clé</p>
                    : <ul className="flex flex-col gap-1 pl-4">
                      {items.map(item => (
                        <li key={item} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-bg group text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-brand/50 shrink-0" />
                          <span className="flex-1 text-navy">{item}</span>
                          {canEditObj && (
                            <button onClick={() => removeItem(item)}
                              className="max-md:opacity-100 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red/10 text-subtle hover:text-red transition-all"><X size={10} /></button>
                          )}
                        </li>
                      ))}
                    </ul>
                )}
              </div>

              {/* Review */}
              <div className="ds-card flex flex-col gap-3">
                <span className="text-[11px] font-bold text-navy/75 uppercase tracking-wide">Sprint Review</span>
                <textarea value={freeRev} onChange={e => setFreeRev(e.target.value)} rows={7}
                  className="ds-textarea w-full resize-y" placeholder="Bilan du sprint…" />
                <button onClick={() => setOpenRevChecklist(o => !o)}
                  className="flex items-center gap-2 text-xs font-semibold text-navy hover:text-brand transition-colors">
                  {openRevChecklist ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  Checklist objectifs
                  {items.length > 0 && (
                    <span className={cn('ml-auto text-xs font-bold', pct === 100 ? 'text-green' : 'text-subtle')}>
                      {doneCount}/{items.length} · {pct}%
                    </span>
                  )}
                </button>
                {openRevChecklist && (
                  <>
                    {items.length > 0 && (
                      <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                        <div className="h-full bg-green rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                    {items.length === 0
                      ? <p className="text-xs text-subtle italic pl-4">Définissez des objectifs clés côté Objectifs</p>
                      : <ul className="flex flex-col gap-1.5 pl-2">
                        {items.map(item => (
                          <li key={item}
                            onClick={() => toggleCheck(item)}
                            className={cn('flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-colors text-xs',
                              canToggleCheck ? 'cursor-pointer' : 'cursor-default',
                              checks[item] ? 'bg-green/10 text-green' : 'bg-bg hover:bg-border/40 text-navy')}>
                            <span className={cn('w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors',
                              checks[item] ? 'bg-green border-green text-white' : 'border-border bg-card')}>
                              {checks[item] && <Check size={10} />}
                            </span>
                            <span className={cn('flex-1', checks[item] && 'line-through opacity-70')}>{item}</span>
                          </li>
                        ))}
                      </ul>
                    }
                  </>
                )}
              </div>
            </div>

            <button onClick={save} disabled={!selected}
              className="ds-btn-primary ds-btn-sm self-start disabled:opacity-40">Sauvegarder</button>
          </>
        )}

        {/* ── US pleine largeur ──────────────────────────────── */}
        <SprintTaskManager selected={selected} taches={taches} showTasks={showTasks} setShowTasks={setShowTasks} isCloture={sprint?.statut === 'cloture'} />
      </div>
    </>
  )
}

// ─── INLINE LIST (Epics/Jalons/Métiers) ──────────────────────
function InlineList({ items, onRename, onDelete, onColorChange, colorFn, countFn, isSystem }: {
  items: string[]; onRename: (old: string, next: string) => void; onDelete: (nom: string) => void
  onColorChange?: (s: string, couleur: string) => void
  colorFn: (s: string) => string; countFn: (s: string) => number; isSystem: (s: string) => boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map(item => {
        const color = colorFn(item), nb = countFn(item), sys = isSystem(item)
        return (
          <div key={item} className="flex items-center gap-3 p-2.5 bg-card rounded-xl border border-border group">
            {onColorChange ? (
              <label className="w-6 h-6 rounded-md shrink-0 cursor-pointer ring-1 ring-border/60 relative overflow-hidden" style={{ background: color }} title="Changer la couleur">
                <input type="color" value={color} onChange={e => onColorChange(item, e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              </label>
            ) : (
              <div className="w-6 h-6 rounded-md shrink-0" style={{ background: color }} />
            )}
            <div className="flex-1 min-w-0">
              <InlineEdit value={item} onSave={v => onRename(item, v)} placeholder={item} />
              <div className="text-xs text-subtle">{nb} US{sys ? ' · Système' : ''}</div>
            </div>
            {nb === 0 && (
              <button onClick={() => onDelete(item)}
                className="p-1.5 rounded-lg max-md:opacity-100 opacity-0 group-hover:opacity-100 hover:bg-rose-50 text-subtle hover:text-rose-600 transition-all">
                <Trash2 size={12} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function EpicsTab() {
  const qc = useQueryClient()
  const { data: taches = [] } = useTaches()
  const { data: epicsList = [] } = useEpics()
  const createEpic = useCreateEpic()
  const updateEpic = useUpdateEpic()
  const deleteEpic = useDeleteEpic()
  const reorderEpics = useReorderEpics()
  const toast = useToast()
  const [newNom, setNewNom] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const counts: Record<string, number> = {}
  taches.forEach(t => { if (t.epic) counts[t.epic] = (counts[t.epic] ?? 0) + 1 })

  // Le numéro n'est plus saisi : toujours le suivant dans l'ordre, à la
  // suite des Epics existants (cf. useCreateEpic) — seul le glisser-déposer
  // (onDragEnd ci-dessous) peut ensuite le faire changer.
  async function add() {
    const nom = newNom.trim()
    if (!nom) return
    const couleur = BRAND_COLORS[epicsList.length % BRAND_COLORS.length]
    await createEpic.mutateAsync({ nom, couleur, bg_couleur: `${couleur}22` })
    toast(`Epic "${nom}" ajouté`)
    setNewNom('')
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = epicsList.findIndex(ep => ep.id === active.id)
    const newIndex = epicsList.findIndex(ep => ep.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    reorderEpics.mutate(arrayMove(epicsList, oldIndex, newIndex).map(ep => ep.id))
  }

  // Renumérote 1, 2, 3… sans rien déplacer — comble les trous laissés par
  // d'anciens Epics créés/renommés à la main avant l'auto-numérotation
  // (ex: 1, 3, 4 après suppression du 2). Réutilise useReorderEpics avec
  // l'ordre déjà affiché : seuls les codes décalés changent réellement.
  function combleTrous() {
    reorderEpics.mutate(epicsList.map(ep => ep.id))
  }

  async function renameNom(epic: Epic, rawNom: string) {
    const nom = rawNom.trim()
    if (!nom || nom === epic.nom) return
    const ok = await confirm({ title: 'Renommer partout ?', message: `"${epic.nom}" → "${nom}" dans toutes les tâches.`, confirmLabel: 'Renommer' }); if (!ok) return
    const old = epicFullName(epic)
    const canonical = epicFullName({ code: epic.code, nom })
    await updateEpic.mutateAsync({ id: epic.id, updates: { nom } })
    // Scopé au produit de l'Epic — jamais les tâches d'un autre produit
    // ayant par coïncidence le même libellé exact.
    await supabase.from('taches').update({ epic: canonical }).eq('epic', old).eq('produit_id', epic.produit_id)
    qc.invalidateQueries({ queryKey: ['taches'] })
    toast('Epic renommé')
  }

  async function changeColor(epic: Epic, couleur: string) {
    await updateEpic.mutateAsync({ id: epic.id, updates: { couleur, bg_couleur: `${couleur}22` } })
  }

  async function del(epic: Epic) {
    const nb = counts[epicFullName(epic)] ?? 0
    const message = nb > 0
      ? `Attention : ${nb} tâche${nb > 1 ? 's sont rattachées' : ' est rattachée'} à "${epic.code} — ${epic.nom}". Elle${nb > 1 ? 's' : ''} ne ${nb > 1 ? 'seront' : 'sera'} PAS supprimée${nb > 1 ? 's' : ''} : ${nb > 1 ? 'elles perdront' : 'elle perdra'} seulement leur rattachement à cet Epic.`
      : `Aucune tâche n'est rattachée à cet Epic.`
    const ok = await confirm({ title: 'Supprimer cet Epic ?', message, confirmLabel: 'Supprimer', variant: 'danger' }); if (!ok) return
    await deleteEpic.mutateAsync(epic.id)
    // Ne supprime jamais les tâches : seul le champ texte `epic` est vidé.
    await supabase.from('taches').update({ epic: '' }).eq('epic', epicFullName(epic)).eq('produit_id', epic.produit_id)
    // Renumérote aussitôt les Epics restants pour ne jamais laisser de trou
    // (ex: 1, 3, 4 après suppression du 2) — même mutation que le
    // glisser-déposer, avec l'ordre actuel moins l'Epic supprimé.
    await reorderEpics.mutateAsync(epicsList.filter(e => e.id !== epic.id).map(e => e.id))
    qc.invalidateQueries({ queryKey: ['taches'] })
    toast('Epic supprimé')
  }

  // Répare les tâches dont le champ epic correspond au même code d'Epic
  // (ex: "EPIC 1") mais dont le texte complet diverge du référentiel —
  // séquelle d'un ancien bug de cascade (espace en trop, tiret différent,
  // etc.) qui rendait l'US invisible pour le SelectPicker du panneau détail
  // tout en l'affichant dans le regroupement "par epic" (groupe fantôme).
  // On matche sur le préfixe "code" plutôt que sur tout le texte normalisé
  // car la différence peut porter sur le séparateur lui-même (—, –, -…),
  // pas seulement sur les espaces.
  async function repareIncoherences() {
    let tachesReparees = 0
    const detail: string[] = []
    for (const epic of epicsList) {
      const canonical = epicFullName(epic)
      const codeEsc = epic.code.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp('^' + codeEsc + '\\b', 'i')
      const corrompus = [...new Set(taches.map(t => t.epic).filter(Boolean))]
        .filter(raw => raw !== canonical && re.test(raw.trim()))
      for (const raw of corrompus) {
        const nb = taches.filter(t => t.epic === raw).length
        tachesReparees += nb
        detail.push(`"${raw}" (${nb}) → "${canonical}"`)
        await supabase.from('taches').update({ epic: canonical }).eq('epic', raw)
      }
    }
    qc.invalidateQueries({ queryKey: ['taches'] })
    if (tachesReparees > 0) {
      console.log('[Réparation Epics]', detail)
      toast(`✅ ${tachesReparees} tâche(s) réparée(s)`)
    } else {
      const allRaws = [...new Set(taches.map(t => t.epic).filter(Boolean))]
      console.log('[Réparation Epics] aucune incohérence détectée. Valeurs epic en base :', allRaws)
      console.log('[Réparation Epics] référentiel epics :', epicsList.map(e => epicFullName(e)))
      toast('Aucune incohérence trouvée — détail dans la console (F12)', 'error')
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl 3xl:max-w-4xl">
      <div className="ds-card flex items-end gap-2">
        <div className="flex-1"><div className="ds-label mb-1">Nom</div><input value={newNom} onChange={e => setNewNom(e.target.value)} className="ds-input" placeholder="Nom de l'Epic" /></div>
        <button onClick={add} disabled={createEpic.isPending || !newNom.trim()}
          className="ds-btn-primary flex items-center gap-1"><Plus size={13} /> Ajouter</button>
      </div>
      <div className="flex items-center justify-between -mt-2">
        <p className="text-xs text-subtle">Numéro automatique (glisser-déposer pour réordonner). Cliquez sur le nom pour le modifier, sur le carré pour changer la couleur. Supprimer ne supprime pas les US mais vide leur champ Epic.</p>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={combleTrous} disabled={reorderEpics.isPending} title="Renumérote 1, 2, 3… sans rien déplacer — comble les trous laissés par d'anciens Epics"
            className="ds-btn ds-btn-sm flex items-center gap-1"><RotateCcw size={11} /> Combler les trous</button>
          <button onClick={repareIncoherences} title="Recale le texte Epic des tâches dont le libellé a divergé du référentiel (espace en trop, etc.)"
            className="ds-btn ds-btn-sm flex items-center gap-1"><Wrench size={11} /> Réparer les incohérences</button>
        </div>
      </div>
      {epicsList.length === 0 ? (
        <p className="text-xs text-subtle italic">Aucun Epic défini pour ce produit.</p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <SortableContext items={epicsList.map(ep => ep.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-1.5">
              {epicsList.map(epic => (
                <EpicRow key={epic.id} epic={epic} nb={counts[epicFullName(epic)] ?? 0}
                  onChangeColor={changeColor} onRename={renameNom} onDelete={del} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

function EpicRow({ epic, nb, onChangeColor, onRename, onDelete }: {
  epic: Epic
  nb: number
  onChangeColor: (epic: Epic, couleur: string) => void
  onRename: (epic: Epic, rawNom: string) => void
  onDelete: (epic: Epic) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: epic.id })
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }
  const num = epic.code.replace(/^epic\s*/i, '').trim()
  return (
    <div ref={setNodeRef} style={style}
      className={cn('flex items-center gap-3 p-2.5 bg-card rounded-xl border border-border group', isDragging && 'opacity-60')}>
      <button {...attributes} {...listeners}
        className="shrink-0 text-subtle/40 hover:text-subtle cursor-grab active:cursor-grabbing touch-none" tabIndex={-1}>
        <GripVertical size={14} />
      </button>
      <label className="w-6 h-6 rounded-md shrink-0 cursor-pointer ring-1 ring-border/60 relative overflow-hidden" style={{ background: epic.couleur ?? '#6366F1' }} title="Changer la couleur">
        <input type="color" value={epic.couleur ?? '#6366F1'} onChange={e => onChangeColor(epic, e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      </label>
      <span className="shrink-0 font-mono text-xs font-semibold text-subtle bg-bg px-2 py-1 rounded-lg w-16 text-center" title="Numéro automatique — glisser-déposer pour réordonner">
        {num}
      </span>
      <div className="flex-1 min-w-0">
        <InlineEdit value={epic.nom} onSave={v => onRename(epic, v)} placeholder={epic.nom} />
        <div className="text-xs text-subtle">{nb} US</div>
      </div>
      <button onClick={() => onDelete(epic)} title="Supprimer l'Epic (les tâches ne sont pas supprimées)"
        className="p-1.5 rounded-lg max-md:opacity-100 opacity-0 group-hover:opacity-100 hover:bg-rose-50 text-subtle hover:text-rose-600 transition-all">
        <Trash2 size={12} />
      </button>
    </div>
  )
}

function JalonsTab() {
  const qc = useQueryClient()
  const { data: taches = [] } = useTaches()
  const { data: jalonsList = [] } = useJalons()
  const createJalon = useCreateJalon()
  const updateJalon = useUpdateJalon()
  const deleteJalon = useDeleteJalon()
  const reorderJalons = useReorderJalons()
  const toast = useToast()
  const [newNom, setNewNom] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const counts: Record<string, number> = {}
  taches.forEach(t => { if (t.jalon) counts[t.jalon] = (counts[t.jalon] ?? 0) + 1 })

  // Le numéro n'est plus saisi : toujours le suivant dans l'ordre, à la
  // suite des Jalons existants (cf. useCreateJalon) — seul le
  // glisser-déposer (onDragEnd ci-dessous) peut ensuite le faire changer.
  // Nom + description restent obligatoires.
  async function add() {
    const nom = newNom.trim(), description = newDescription.trim()
    if (!nom || !description) return
    const couleur = BRAND_COLORS[jalonsList.length % BRAND_COLORS.length]
    await createJalon.mutateAsync({ nom, description, couleur })
    toast(`Jalon - Incrément majeur "${nom}" ajouté`)
    setNewNom(''); setNewDescription('')
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = jalonsList.findIndex(j => j.id === active.id)
    const newIndex = jalonsList.findIndex(j => j.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    reorderJalons.mutate(arrayMove(jalonsList, oldIndex, newIndex).map(j => j.id))
  }

  // Renumérote 1, 2, 3… sans rien déplacer — comble les trous laissés par
  // d'anciens Jalons créés à la main avant l'auto-numérotation.
  function combleTrous() {
    reorderJalons.mutate(jalonsList.map(j => j.id))
  }

  async function renameNom(jalon: Jalon, rawNom: string) {
    const nom = rawNom.trim()
    if (!nom) { toast('Le nom est obligatoire', 'error'); return }
    if (nom === jalon.nom) return
    await updateJalon.mutateAsync({ id: jalon.id, updates: { nom } })
    toast('Jalon renommé')
  }

  async function saveDescription(jalon: Jalon, description: string) {
    if (!description) { toast('La description est obligatoire', 'error'); return }
    await updateJalon.mutateAsync({ id: jalon.id, updates: { description } })
  }

  async function changeColor(jalon: Jalon, couleur: string) {
    await updateJalon.mutateAsync({ id: jalon.id, updates: { couleur } })
  }

  // Bloqué tant que des US sont rattachées (cf. bouton masqué si nb > 0,
  // ci-dessous) : pas de suppression "avec avertissement" comme les Epics,
  // ici c'est impossible tant que le Jalon n'est pas vidé de ses US.
  async function del(jalon: Jalon) {
    const ok = await confirm({ title: 'Supprimer ce Jalon - Incrément majeur ?', message: `Les tâches perdront leur jalon - incrément majeur.`, confirmLabel: 'Supprimer', variant: 'danger' }); if (!ok) return
    await deleteJalon.mutateAsync(jalon.id)
    await supabase.from('taches').update({ jalon: null }).eq('jalon', jalon.code)
    qc.invalidateQueries({ queryKey: ['taches'] })
    // Renumérote aussitôt les Jalons restants pour ne jamais laisser de trou
    // (ex: I1, I3, I4 après suppression du I2) — même mutation que le
    // glisser-déposer, avec l'ordre actuel moins le Jalon supprimé.
    await reorderJalons.mutateAsync(jalonsList.filter(j => j.id !== jalon.id).map(j => j.id))
    toast('Jalon - Incrément majeur supprimé')
  }

  const canAdd = newNom.trim() && newDescription.trim()

  return (
    <div className="flex flex-col gap-4 max-w-2xl 3xl:max-w-4xl">
      <div className="ds-card flex flex-col gap-2">
        <div>
          <div className="ds-label mb-1">Nom</div>
          <input value={newNom} onChange={e => setNewNom(e.target.value)} className="ds-input" placeholder="Nom du Jalon" />
        </div>
        <div>
          <div className="ds-label mb-1">Description</div>
          <textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} rows={2}
            className="ds-textarea text-sm w-full" placeholder="Ce que ce Jalon - Incrément majeur représente…" />
        </div>
        <button onClick={add} disabled={createJalon.isPending || !canAdd}
          className="ds-btn-primary self-start flex items-center gap-1"><Plus size={13} /> Ajouter</button>
      </div>
      <div className="flex items-center justify-between -mt-2">
        <p className="text-xs text-subtle">Numéro automatique (glisser-déposer pour réordonner). Nom et description obligatoires — cliquez pour les modifier, sur le carré pour changer la couleur. Un Jalon avec des US rattachées ne peut pas être supprimé.</p>
        <button onClick={combleTrous} disabled={reorderJalons.isPending} title="Renumérote 1, 2, 3… sans rien déplacer — comble les trous laissés par d'anciens Jalons"
          className="ds-btn ds-btn-sm flex items-center gap-1 shrink-0"><RotateCcw size={11} /> Combler les trous</button>
      </div>
      {jalonsList.length === 0 ? (
        <p className="text-xs text-subtle italic">Aucun Jalon défini pour ce produit.</p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <SortableContext items={jalonsList.map(j => j.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-1.5">
              {jalonsList.map(jalon => (
                <JalonRow key={jalon.id} jalon={jalon} nb={counts[jalon.code] ?? 0}
                  onChangeColor={changeColor} onRenameNom={renameNom} onSaveDescription={saveDescription} onDelete={del} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

function JalonRow({ jalon, nb, onChangeColor, onRenameNom, onSaveDescription, onDelete }: {
  jalon: Jalon
  nb: number
  onChangeColor: (jalon: Jalon, couleur: string) => void
  onRenameNom: (jalon: Jalon, rawNom: string) => void
  onSaveDescription: (jalon: Jalon, description: string) => void
  onDelete: (jalon: Jalon) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: jalon.id })
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }
  return (
    <div ref={setNodeRef} style={style}
      className={cn('flex items-start gap-3 p-2.5 bg-card rounded-xl border border-border group', isDragging && 'opacity-60')}>
      <button {...attributes} {...listeners}
        className="shrink-0 text-subtle/40 hover:text-subtle cursor-grab active:cursor-grabbing touch-none mt-0.5" tabIndex={-1}>
        <GripVertical size={14} />
      </button>
      <label className="w-6 h-6 rounded-md shrink-0 cursor-pointer ring-1 ring-border/60 relative overflow-hidden mt-0.5" style={{ background: jalon.couleur ?? '#6366F1' }} title="Changer la couleur">
        <input type="color" value={jalon.couleur ?? '#6366F1'} onChange={e => onChangeColor(jalon, e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      </label>
      <span className="shrink-0 font-mono text-xs font-semibold text-subtle bg-bg px-2 py-1 rounded-lg mt-0.5" title="Numéro automatique — glisser-déposer pour réordonner">
        {jalon.code}
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <InlineEdit value={jalon.nom} onSave={v => onRenameNom(jalon, v)} placeholder="Nom manquant" />
          <span className="text-xs text-subtle shrink-0 ml-auto">{nb} US</span>
        </div>
        <InlineEditTextarea value={jalon.description} onSave={v => onSaveDescription(jalon, v)}
          placeholder="Description…" missingHint="Description manquante — cliquez pour la compléter" />
      </div>
      {nb === 0 && (
        <button onClick={() => onDelete(jalon)}
          className="p-1.5 rounded-lg max-md:opacity-100 opacity-0 group-hover:opacity-100 hover:bg-rose-50 text-subtle hover:text-rose-600 transition-all shrink-0">
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}

function MetiersTab() {
  // Les Thèmes (métiers) sont transverses à tous les produits : on ne les
  // scope pas au produit actif comme le fait useTaches(), sinon on ne voit
  // que les métiers utilisés dans le produit courant.
  const qc = useQueryClient()
  const { data: taches = [] } = useQuery({
    queryKey: ['taches-metiers-global'],
    queryFn: async () => {
      const { data, error } = await supabase.from('taches').select('metier')
      if (error) throw error
      return (data ?? []) as { metier: string | null }[]
    },
    staleTime: 30_000,
  })
  const toast = useToast()
  const [nom, setNom] = useState('')
  const counts: Record<string, number> = {}; taches.forEach(t => { if (t.metier) counts[t.metier] = (counts[t.metier] ?? 0) + 1 })
  const metiers = Object.keys(counts).sort()
  function invalidateTaches() {
    qc.invalidateQueries({ queryKey: ['taches'] })
    qc.invalidateQueries({ queryKey: ['taches-metiers-global'] })
  }
  async function rename(old: string, next: string) {
    if (!next || next === old) return
    const ok = await confirm({ title: 'Renommer partout ?', message: `"${old}" → "${next}" dans toutes les tâches.`, confirmLabel: 'Renommer' }); if (!ok) return
    await supabase.from('taches').update({ metier: next }).eq('metier', old); invalidateTaches(); toast('Métier renommé')
  }
  async function del(n: string) {
    const ok = await confirm({ title: 'Supprimer ce Métier ?', message: `Les tâches perdront leur métier.`, confirmLabel: 'Supprimer', variant: 'danger' }); if (!ok) return
    await supabase.from('taches').update({ metier: null }).eq('metier', n); invalidateTaches(); toast('Métier supprimé')
  }
  return (
    <div className="flex flex-col gap-4 max-w-xl 3xl:max-w-3xl">
      <div className="ds-card flex items-end gap-2">
        <div className="flex-1"><div className="ds-label mb-1">Nom</div><input value={nom} onChange={e => setNom(e.target.value)} className="ds-input" placeholder="Ex: Mécatronique" /></div>
        <button onClick={() => { if (!nom) return; toast(`Métier "${nom}" ajouté`); setNom('') }}
          className="ds-btn-primary flex items-center gap-1"><Plus size={13} /> Ajouter</button>
      </div>
      <p className="text-xs text-subtle -mt-2">Cliquez sur le nom pour le renommer. Supprimer vide le champ Métier des tâches concernées.</p>
      <InlineList items={metiers}
        onRename={rename} onDelete={del}
        colorFn={() => '#818cf8'} countFn={s => counts[s] ?? 0}
        isSystem={s => METIERS_DEFAULT.includes(s)} />
    </div>
  )
}

// ── Composant gestion US du sprint ───────────────────────────
function SprintTaskManager({ selected, taches, showTasks, setShowTasks, isCloture }: {
  selected: string; taches: ReturnType<typeof useTaches>['data']; showTasks: boolean; setShowTasks: (v: boolean) => void
  isCloture: boolean
}) {
  const { produitActif } = useProduit()
  const updateTache = useUpdateTache()
  const updateIteration = useUpdateIteration()
  const { data: dodItems = [] } = useDod()
  const { data: epicsList = [] } = useEpics()
  const { data: iterationsMap = new Map<string, TacheIteration[]>() } = useProduitIterations(produitActif?.id ?? null)
  const toast       = useToast()
  const [showAdd,     setShowAdd]     = useState(false)
  const [showEpicAdd, setShowEpicAdd] = useState(false)
  const [quickEpic,   setQuickEpic]   = useState('')
  const [search,    setSearch]    = useState('')
  const [fEpic,     setFEpic]     = useState('')
  const [fStatut,   setFStatut]   = useState('')
  const [fMoscow,   setFMoscow]   = useState('')
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [chosenIteration, setChosenIteration] = useState<Record<string, number>>({})
  // Panneau de détail (partagé avec la page Tâches) ouvert par clic sur une US
  const [detailId, setDetailId] = useState<string | null>(null)
  const T = taches ?? []
  const byId = buildTacheIndex(T)
  const epicColorMap = new Map(epicsList.map(e => [epicFullName(e), e.couleur]))
  const iterationCounts = new Map([...iterationsMap.entries()].map(([k, v]) => [k, v.length]))

  function itersOf(id_tache: string) { return iterationsMap.get(id_tache) ?? [] }

  const statuts = ['À faire', 'En cours', 'Fait', 'Bloqué']
  const moscows = ['Must Have', 'Should Have', 'Could Have', "Won't Have"]

  function matchesBacklogFilters(t: Tache) {
    if (search  && !t.id_tache.toLowerCase().includes(search.toLowerCase()) && !t.titre.toLowerCase().includes(search.toLowerCase())) return false
    if (fEpic   && t.epic   !== fEpic)   return false
    if (fStatut && t.statut !== fStatut) return false
    if (fMoscow && t.moscow !== fMoscow) return false
    return true
  }

  // US (pas Conteneur) éligibles au backlog, à plat — sert au sélecteur
  // d'Epic et à l'ajout rapide en masse, indépendamment de la recherche
  // texte (comme avant : la recherche ne filtre que la liste "Ajouter US").
  const eligibleFlat = T.filter(t => t.type_tache !== 'Conteneur' && isEligibleForBacklog(t, itersOf(t.id_tache)))
  const epics = [...new Set(eligibleFlat.map(t => t.epic).filter(Boolean))].sort(naturalCompare)

  // Arbres pour les deux TacheTree : le prédicat inclut déjà les filtres de
  // recherche pour "Ajouter US", afin qu'un Conteneur ne survive que s'il
  // lui reste un enfant qui matche à la fois l'éligibilité ET les filtres.
  const backlogTree = buildEligibleTree(T, t => isEligibleForBacklog(t, itersOf(t.id_tache)) && matchesBacklogFilters(t))
  const sprintTree  = buildEligibleTree(T, t => isInThisSprint(t, selected, itersOf(t.id_tache)))
  const backlogEpicsList = epicsList.filter(e => backlogTree.filtered.some(t => t.epic === epicFullName(e)))
  const sprintEpicsList  = epicsList.filter(e => sprintTree.filtered.some(t => t.epic === epicFullName(e)))
  const backlogFlatCount = eligibleFlat.filter(matchesBacklogFilters).length
  const spTachesCount = T.filter(t => t.type_tache !== 'Conteneur' && isInThisSprint(t, selected, itersOf(t.id_tache))).length

  // Une US est "à valider" si elle n'a aucune exigence liée, ou si au moins
  // une de ses exigences liées n'est pas encore vérifiée. Une US dont TOUTES
  // les exigences liées sont vérifiées est exclue du lot "à valider".
  const verifiedCodes = new Set(dodItems.filter(d => d.verifiee).map(d => d.code))
  function codesOf(t: { lien_dod?: string | null }) {
    return (t.lien_dod ?? '').split(/[,;]/).map(s => s.trim()).filter(Boolean)
  }
  function needsValidation(t: { lien_dod?: string | null }) {
    const codes = codesOf(t)
    return codes.length === 0 || !codes.every(c => verifiedCodes.has(c))
  }

  // Exclues du lot bulk (Epic entier) : les tâches à ≥2 itérations éligibles
  // — pas de sélecteur possible en masse, on ne veut pas planifier
  // silencieusement "la première" itération venue.
  const epicAll      = quickEpic ? eligibleFlat.filter(t => t.epic === quickEpic &&
    itersOf(t.id_tache).filter(it => it.statut === 'À faire' && !it.sprint).length <= 1) : []
  const epicAValider = epicAll.filter(needsValidation)

  async function assignToSprint(t: Tache) {
    if (isCloture) { toast('Sprint clôturé : lecture seule', 'error'); return }
    if (t.type_tache === 'Conteneur') return
    const iters = itersOf(t.id_tache)
    const eligible = iters.filter(it => it.statut === 'À faire' && !it.sprint)
    if (eligible.length === 0) {
      await updateTache.mutateAsync({ id_tache: t.id_tache, updates: { sprint: selected, sprint_debut: selected } })
      return
    }
    const iter = eligible.find(it => it.id === chosenIteration[t.id_tache]) ?? eligible[0]
    const isLatest = iter.numero === Math.max(...iters.map(i => i.numero))
    await updateIteration.mutateAsync({ id: iter.id, id_tache: t.id_tache, updates: { sprint: selected }, syncToTache: isLatest })
  }

  async function assignMany(ts: Tache[]) {
    if (!ts.length) return
    for (const t of ts) await assignToSprint(t)
    toast(`${ts.length} US ajoutée(s) au sprint ${formatSprintLabel(selected)}`)
  }

  async function doRemove(t: Tache) {
    if (isCloture) { toast('Sprint clôturé : lecture seule', 'error'); return }
    const iters = itersOf(t.id_tache)
    if (iters.length === 0) {
      await updateTache.mutateAsync({ id_tache: t.id_tache, updates: { sprint: '', sprint_debut: null } })
      toast(`${t.id_tache} retiré du sprint`)
      return
    }
    const iter = iters.find(it => it.sprint === selected)
    if (!iter) return
    const isLatest = iter.numero === Math.max(...iters.map(i => i.numero))
    await updateIteration.mutateAsync({ id: iter.id, id_tache: t.id_tache, updates: { sprint: null }, syncToTache: isLatest })
    toast(`${t.id_tache} (itér. ${iter.numero}) retiré du sprint`)
  }

  async function addSelection() {
    if (!selection.size) return
    const ts = [...selection].map(id => byId.get(id)).filter((t): t is Tache => !!t)
    await assignMany(ts)
    setSelection(new Set())
    setShowAdd(false)
  }

  async function addEpicAll() {
    await assignMany(epicAll)
    setShowEpicAdd(false)
    setQuickEpic('')
  }
  async function addEpicAValider() {
    await assignMany(epicAValider)
    setShowEpicAdd(false)
    setQuickEpic('')
  }

  function renderSprintExtra(t: Tache) {
    const active = itersOf(t.id_tache).find(it => it.sprint === selected)
    return (
      <div className="flex items-center gap-1">
        {active && (
          <span title={active.objectif ?? ''} className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full truncate max-w-[160px]">
            Itér. {active.numero}{active.objectif ? ` · ${active.objectif.slice(0, 24)}` : ''}
          </span>
        )}
        {!isCloture && (
          <button onClick={() => doRemove(t)} title="Retirer du sprint"
            className="p-1 rounded hover:bg-rose-50 text-subtle hover:text-rose-600"><X size={11} /></button>
        )}
      </div>
    )
  }

  function renderBacklogExtra(t: Tache) {
    const eligible = itersOf(t.id_tache).filter(it => it.statut === 'À faire' && !it.sprint)
    if (eligible.length < 2) return null
    const chosenId = chosenIteration[t.id_tache] ?? eligible[0].id
    return (
      <div className="flex items-center gap-1">
        {eligible.map(it => (
          <button key={it.id} onClick={() => setChosenIteration(p => ({ ...p, [t.id_tache]: it.id }))}
            title={[
              `Itération ${it.numero}`,
              `Objectif : ${it.objectif || '—'}`,
              `Effort estimé : ${it.effort_j ?? '—'}j`,
              `Assigné : ${it.assigne_a || '—'}`,
            ].join('\n')}
            className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full border',
              chosenId === it.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-card text-subtle border-border hover:border-indigo-300')}>
            Itér. {it.numero}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="ds-card">
      <div className="flex items-center gap-2 mb-2">
        <button className="flex items-center gap-2 flex-1" onClick={() => setShowTasks(!showTasks)}>
          <div className="ds-card-title mb-0 flex-1">US du sprint {formatSprintLabel(selected)} ({spTachesCount})</div>
          {showTasks ? <ChevronDown size={14} className="text-subtle" /> : <ChevronRight size={14} className="text-subtle" />}
        </button>
        {selected && !isCloture && (
          <div className="flex items-center gap-2">
            <button onClick={() => { setShowAdd(s => !s); setSelection(new Set()); setShowEpicAdd(false) }}
              className="ds-btn ds-btn-sm flex items-center gap-1"><Plus size={11} /> Ajouter US</button>
            <button onClick={() => { setShowEpicAdd(s => !s); setQuickEpic(''); setShowAdd(false) }}
              className="ds-btn ds-btn-sm flex items-center gap-1"><Zap size={11} /> Ajouter un Epic</button>
          </div>
        )}
        {selected && isCloture && (
          <span className="text-[11px] font-semibold text-subtle bg-bg px-2 py-1 rounded-lg">Sprint clôturé — lecture seule</span>
        )}
      </div>

      {/* ── Ajout rapide par Epic ───────────────────────────── */}
      {showEpicAdd && (
        <div className="mb-3 border border-border rounded-xl overflow-hidden p-3 bg-bg space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-subtle shrink-0">Epic</span>
            <SelectPicker value={quickEpic} onChange={setQuickEpic} placeholder="Choisir un epic"
              className="flex-1" options={epics.map(e => ({ value: e, label: e }))} />
          </div>
          {quickEpic && (
            epicAll.length === 0 ? (
              <div className="text-xs text-subtle py-2 text-center">Aucune US disponible pour cet epic</div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-xs text-subtle">{epicAll.length} US · {epicAValider.length} à valider</span>
                <div className="flex gap-2">
                  <button onClick={addEpicAll} disabled={updateTache.isPending}
                    className="ds-btn ds-btn-sm">Toutes les US ({epicAll.length})</button>
                  <button onClick={addEpicAValider} disabled={!epicAValider.length || updateTache.isPending}
                    title="US sans exigence liée ou avec au moins une exigence non vérifiée"
                    className="ds-btn-primary ds-btn-sm">US à valider ({epicAValider.length})</button>
                </div>
              </div>
            )
          )}
          <div className="flex justify-end">
            <button onClick={() => { setShowEpicAdd(false); setQuickEpic('') }} className="ds-btn ds-btn-sm">Annuler</button>
          </div>
        </div>
      )}

      {/* ── Panneau backlog ─────────────────────────────────── */}
      {showAdd && (
        <div className="mb-3 border border-border rounded-xl overflow-hidden">
          <div className="flex flex-wrap gap-2 p-3 bg-bg border-b border-border">
            <div className="ds-searchbar flex-1 min-w-[160px]">
              <span className="text-subtle text-xs">🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ID ou titre…" />
            </div>
            <SelectPicker value={fEpic} onChange={setFEpic} placeholder="Tous les epics"
              className="min-w-[130px]"
              options={epics.map(e => ({ value: e, label: e }))} />
            <SelectPicker value={fStatut} onChange={setFStatut} placeholder="Tous statuts"
              className="min-w-[120px]"
              options={statuts.map(s => ({ value: s, label: s }))} />
            <SelectPicker value={fMoscow} onChange={setFMoscow} placeholder="Tous MoSCoW"
              className="min-w-[130px]"
              options={moscows.map(m => ({ value: m, label: m }))} />
          </div>

          <div className="max-h-64 overflow-y-auto">
            {backlogTree.filtered.length === 0
              ? <div className="py-6 text-center text-subtle text-xs">Aucune US disponible</div>
              : (
                <TacheTree
                  filtered={backlogTree.filtered} childMap={backlogTree.childMap}
                  epicsList={backlogEpicsList} epicColorMap={epicColorMap} byId={byId} allTaches={T}
                  selected={[...selection]} onToggleSelect={(id, checked) => setSelection(prev => {
                    const s = new Set(prev); checked ? s.add(id) : s.delete(id); return s
                  })}
                  panelId={null} onOpenPanel={() => {}} dependances={[]} updateTache={updateTache}
                  onDuplicateEpic={() => {}} isAdmin={false} onClearEpic={() => {}} onQuickAdd={() => {}}
                  onAddSousTache={() => {}} iterationCounts={iterationCounts} renderExtra={renderBacklogExtra}
                  showExpandControls={false}
                />
              )
            }
          </div>

          <div className="flex items-center justify-between px-3 py-2 bg-bg border-t border-border">
            <span className="text-xs text-subtle">{backlogFlatCount} US · {selection.size} sélectionnée(s)</span>
            <div className="flex gap-2">
              <button onClick={() => { setShowAdd(false); setSelection(new Set()) }}
                className="ds-btn ds-btn-sm">Annuler</button>
              <button onClick={addSelection} disabled={!selection.size || updateTache.isPending}
                className="ds-btn-primary ds-btn-sm flex items-center gap-1">
                <Plus size={11} /> Ajouter {selection.size > 0 ? `${selection.size} US` : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── US du sprint ───────────────────────────────────── */}
      {showTasks && (
        <div className="max-h-80 overflow-y-auto border border-border rounded-xl">
          {sprintTree.filtered.length === 0
            ? <div className="py-6 text-center text-subtle text-xs">Aucune US dans ce sprint</div>
            : (
              <TacheTree
                filtered={sprintTree.filtered} childMap={sprintTree.childMap}
                epicsList={sprintEpicsList} epicColorMap={epicColorMap} byId={byId} allTaches={T}
                selected={[]} onToggleSelect={() => {}}
                panelId={null}
                onOpenPanel={t => setDetailId(t.id_tache)}
                dependances={[]} updateTache={updateTache}
                onDuplicateEpic={() => {}} isAdmin={false} onClearEpic={() => {}} onQuickAdd={() => {}}
                onAddSousTache={() => {}} iterationCounts={iterationCounts} renderExtra={renderSprintExtra}
                showExpandControls={false}
              />
            )
          }
        </div>
      )}

      {detailId && (
        <TacheDetailPanel tacheId={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  )
}

// ─── Activité : historique + annulation/restauration ───────────
const ACTIVITE_ACTION_STYLE = {
  create:  { bg: 'bg-emerald-50',  text: 'text-emerald-600', label: 'Créé'     },
  update:  { bg: 'bg-indigo-50',   text: 'text-indigo-600',  label: 'Modifié'  },
  delete:  { bg: 'bg-rose-50',     text: 'text-rose-600',    label: 'Supprimé' },
  status:  { bg: 'bg-amber-50',    text: 'text-amber-600',   label: 'Statut'   },
  restore: { bg: 'bg-teal-50',     text: 'text-teal-600',    label: 'Restauré' },
}

// old_value/new_value sont du JSON (cf. useUpdateTache) — repli sur la
// valeur brute pour les entrées enregistrées avant (texte simple).
function activiteParseVal(raw: string | null): unknown {
  if (raw == null) return null
  try { return JSON.parse(raw) } catch { return raw }
}
function activiteRawVal(raw: string | null): string {
  const v = activiteParseVal(raw)
  if (v === null || v === undefined || v === '') return '(vide)'
  return String(v)
}
// Tronqué à l'affichage (une valeur longue — description, critères... —
// gonflait sinon la hauteur de la ligne) ; la valeur complète reste
// consultable via l'attribut title (activiteRawVal) au survol.
function activiteFormatVal(raw: string | null): string {
  const s = activiteRawVal(raw)
  return s.length > 60 ? s.slice(0, 60) + '…' : s
}

// Regroupe les modifications ('update'/'status') consécutives sur une même
// tâche et proches dans le temps (30 min) — typiquement plusieurs champs
// enregistrés l'un après l'autre pendant qu'un panneau de détail reste
// ouvert. Un "Tout annuler" les défait alors en un clic. Créations/
// suppressions/restaurations restent toujours affichées individuellement.
const ACTIVITE_GROUP_WINDOW_MS = 30 * 60 * 1000
type ActiviteLogGroup = ActivityLog[]
function groupActiviteLogs(logs: ActivityLog[]): (ActivityLog | ActiviteLogGroup)[] {
  const out: (ActivityLog | ActiviteLogGroup)[] = []
  let current: ActiviteLogGroup = []
  const flush = () => {
    if (current.length === 1) out.push(current[0])
    else if (current.length > 1) out.push(current)
    current = []
  }
  for (const log of logs) {
    const groupable = log.action === 'update' || log.action === 'status'
    const last = current[current.length - 1]
    const sameSession = last && last.target === log.target &&
      Math.abs(new Date(last.created_at).getTime() - new Date(log.created_at).getTime()) <= ACTIVITE_GROUP_WINDOW_MS
    if (groupable && sameSession) {
      current.push(log)
    } else {
      flush()
      if (groupable) current.push(log)
      else out.push(log)
    }
  }
  flush()
  return out
}

// Liste + logique Annuler/Restaurer partagée entre l'onglet Activité d'un
// produit (scope = ce produit) et l'onglet Global de Setup (scope = entités
// transverses, produit_id IS NULL) — seules la source des logs et les
// permissions d'accès diffèrent entre les deux.
function ActivityLogList({ logs, isLoading, canRestore, canClear, onClear, emptyHint }: {
  logs: ActivityLog[]
  isLoading: boolean
  canRestore: boolean
  canClear: boolean
  onClear: () => void
  emptyHint: string
}) {
  const restoreTache = useRestoreTache()
  const undoField = useUndoFieldChange()
  const toast = useToast()

  async function handleRestore(log: ActivityLog) {
    try {
      await restoreTache.mutateAsync(log)
      toast(`✅ "${log.title || log.target}" restaurée`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erreur lors de la restauration', 'error')
    }
  }

  async function handleUndo(log: ActivityLog) {
    try {
      await undoField.mutateAsync(log)
      toast(`✅ ${log.field} annulé sur ${log.title || log.target}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erreur lors de l'annulation", 'error')
    }
  }

  // Annule chaque entrée du groupe dans l'ordre (le plus récent d'abord, déjà
  // l'ordre du journal) — si un même champ a été modifié plusieurs fois dans
  // la session, ça le fait bien reculer pas à pas jusqu'à sa toute première
  // valeur, pas juste à l'avant-dernière.
  async function handleUndoGroup(group: ActiviteLogGroup) {
    try {
      for (const log of group) await undoField.mutateAsync(log)
      toast(`✅ ${group.length} modification${group.length > 1 ? 's' : ''} annulée${group.length > 1 ? 's' : ''} sur ${group[0].title || group[0].target}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erreur lors de l'annulation", 'error')
    }
  }

  // Grouper par jour, puis par session de modifications au sein du jour
  const byDay: Record<string, ActivityLog[]> = {}
  logs.forEach(log => {
    const day = log.created_at.slice(0, 10)
    if (!byDay[day]) byDay[day] = []
    byDay[day].push(log)
  })

  function renderEntry(log: ActivityLog) {
    const style = ACTIVITE_ACTION_STYLE[log.action]
    return (
      <div key={log.id} className="ds-card flex items-start gap-3 py-2.5">
        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5', style.bg, style.text)}>
          {style.label}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-indigo-600">{log.target}</span>
            <span className="text-xs text-navy truncate">{log.title}</span>
          </div>
          {log.field && (
            <div className="text-xs text-subtle mt-0.5 flex items-center gap-1 min-w-0">
              <span className="shrink-0">{log.field}</span>
              {log.old_value != null && <span className="line-through text-rose-400 truncate" title={activiteRawVal(log.old_value)}>{activiteFormatVal(log.old_value)}</span>}
              {log.new_value != null && <span className="text-emerald-600 font-medium truncate" title={activiteRawVal(log.new_value)}>{activiteFormatVal(log.new_value)}</span>}
            </div>
          )}
        </div>
        {log.action === 'delete' && log.old_value && canRestore && (
          <button onClick={() => handleRestore(log)} disabled={restoreTache.isPending}
            title="Restaurer cette tâche (et son rattachement d'origine)"
            className="ds-btn ds-btn-sm shrink-0 flex items-center gap-1">
            <RotateCcw size={11}/>Restaurer
          </button>
        )}
        {(log.action === 'update' || log.action === 'status') && log.field && log.old_value != null && canRestore && (
          <button onClick={() => handleUndo(log)} disabled={undoField.isPending}
            title="Annuler cette modification" className="ds-btn ds-btn-sm shrink-0 flex items-center gap-1">
            <RotateCcw size={11}/>Annuler
          </button>
        )}
        <span className="text-xs text-subtle shrink-0">
          {new Date(log.created_at).toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}
        </span>
      </div>
    )
  }

  function renderGroup(group: ActiviteLogGroup) {
    const head = group[0]
    return (
      <div key={`grp-${head.id}`} className="ds-card py-2.5">
        <div className="flex items-start gap-3">
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5', ACTIVITE_ACTION_STYLE.update.bg, ACTIVITE_ACTION_STYLE.update.text)}>
            {group.length} modifs
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-indigo-600">{head.target}</span>
              <span className="text-xs text-navy truncate">{head.title}</span>
            </div>
            <div className="flex flex-col gap-0.5 mt-1">
              {group.map(log => (
                <div key={log.id} className="flex items-center gap-2 text-xs text-subtle min-w-0">
                  <span className="w-16 shrink-0 truncate">{log.field}</span>
                  {log.old_value != null && <span className="line-through text-rose-400 truncate max-w-[160px]" title={activiteRawVal(log.old_value)}>{activiteFormatVal(log.old_value)}</span>}
                  {log.new_value != null && <span className="text-emerald-600 font-medium truncate max-w-[160px]" title={activiteRawVal(log.new_value)}>{activiteFormatVal(log.new_value)}</span>}
                  <span className="text-subtle/60 ml-auto shrink-0">{new Date(log.created_at).toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}</span>
                  {canRestore && (
                    <button onClick={() => handleUndo(log)} disabled={undoField.isPending}
                      title="Annuler seulement cette modification" className="text-subtle/50 hover:text-indigo-600 shrink-0">
                      <RotateCcw size={11}/>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          {canRestore && (
            <button onClick={() => handleUndoGroup(group)} disabled={undoField.isPending}
              title="Annuler toutes les modifications de cette session" className="ds-btn ds-btn-sm shrink-0 flex items-center gap-1">
              <RotateCcw size={11}/>Tout annuler
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-xs text-subtle">{logs.length} événement{logs.length > 1 ? 's' : ''}</span>
        {logs.length > 0 && canClear && (
          <button onClick={onClear}
            className="ds-btn ds-btn-sm text-rose-500 hover:bg-rose-50 flex items-center gap-1 ml-auto">
            <Trash2 size={11}/>Effacer
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : !logs.length ? (
        <div className="ds-card flex flex-col items-center py-20 text-subtle gap-3">
          <Clock size={48} className="opacity-20"/>
          <p className="text-sm font-medium">Aucune activité</p>
          <p className="text-xs">{emptyHint}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {Object.entries(byDay).map(([day, dayLogs]) => (
            <div key={day}>
              <div className="ds-section-divider">
                <span>{new Date(day).toLocaleDateString('fr-FR', {weekday:'long',day:'2-digit',month:'long'})}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {groupActiviteLogs(dayLogs).map(item => Array.isArray(item) ? renderGroup(item) : renderEntry(item))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ActiviteTab() {
  const { produitActif } = useProduit()
  const { isAdmin, canWrite } = useAuth()
  const { data: logs = [], isLoading } = useActivityLog(produitActif?.id ?? null)
  const clearLog = useClearActivityLog()
  const canRestore = produitActif ? canWrite(produitActif.id) : false

  return (
    <ActivityLogList
      logs={logs} isLoading={isLoading} canRestore={canRestore}
      canClear={isAdmin && !!produitActif}
      onClear={() => produitActif && confirm({
        title: "Effacer l'historique ?",
        message: "Tous les événements enregistrés pour ce produit seront supprimés, pour toute l'équipe.",
        confirmLabel: 'Effacer', variant: 'danger',
      }).then(ok => { if (ok) clearLog.mutate(produitActif.id) })}
      emptyHint="Les modifications de l'équipe sur ce produit apparaîtront ici"
    />
  )
}

// Entités transverses (équipes, finance, gammes, ROCKS, roadmap,
// suggestions…) — onglet réservé aux admins (cf. GLOBAL_TABS_ADMIN), donc
// canRestore/canClear valent toujours true ici (pas de check supplémentaire
// à dupliquer, la RLS retombe déjà sur is_admin() pour produit_id IS NULL).
function GlobalActiviteTab() {
  const { data: logs = [], isLoading } = useGlobalActivityLog()
  const clearLog = useClearGlobalActivityLog()

  return (
    <ActivityLogList
      logs={logs} isLoading={isLoading} canRestore={true} canClear={true}
      onClear={() => confirm({
        title: "Effacer l'historique global ?",
        message: 'Tous les événements transverses enregistrés (équipes, finance, gammes, ROCKS, roadmap, suggestions…) seront supprimés, pour toute l\'équipe.',
        confirmLabel: 'Effacer', variant: 'danger',
      }).then(ok => { if (ok) clearLog.mutate() })}
      emptyHint="Les modifications transverses (équipes, finance, gammes, ROCKS, roadmap, suggestions…) apparaîtront ici"
    />
  )
}

function ExportTab() {
  const toast   = useToast()
  const { data: produits = [] } = useProduits()
  // '' = tous les produits. N'a d'effet que sur les exports `scoped` (Tâches/
  // Sprints, qui portent un produit_id) — Utilisateurs/Équipes sont des
  // entités globales, jamais rattachées à un seul produit.
  const [produitId, setProduitId] = useState<number | ''>('')
  const produitsTries = useMemo(() => [...produits].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')), [produits])
  const produitLabel = produitId === '' ? 'tous' : (produitsTries.find(p => p.id === produitId)?.nom ?? String(produitId))

  // filterCol : nom de la colonne testée quand un produit précis est
  // sélectionné (le plus souvent `produit_id` ; `id` pour la table `produits`
  // elle-même) ; null = entité transverse, jamais filtrée par produit.
  const exportsProduit = [
    { label: 'Tâches', desc: 'ID, Epic, Titre, Jalon - Incrément majeur, Sprint, Statut, Effort…', table: 'taches', filterCol: 'produit_id',
      cols: ['id_tache','epic','titre','type_fonction','jalon','sprint_debut','sprint_fin','statut','effort_j','moscow','priorite','equipe','metier','assigne_a','lien_dod','iteration'],
      headers: ['ID','Epic','Titre','Type','Jalon - Incrément majeur','Sprint début','Sprint fin','Statut','Effort','MoSCoW','Priorité','Équipe','Métier','Assigné','Exigences','Itér.'] },
    { label: 'Sprints', desc: 'Numéro, Statut, Objectifs, Review, Dates', table: 'sprints', filterCol: 'produit_id',
      cols: ['numero','statut','objectifs','review','started_at','closed_at'], headers: ['Sprint','Statut','Objectifs','Review','Démarré','Clôturé'] },
    { label: 'Epics', desc: 'Code, Nom, Couleurs, Ordre', table: 'epics', filterCol: 'produit_id',
      cols: ['code','nom','couleur','bg_couleur','ordre'], headers: ['Code','Nom','Couleur','Fond','Ordre'] },
    { label: 'Jalons - Incréments majeurs', desc: 'Code, Nom, Description, Couleur, Ordre', table: 'jalons', filterCol: 'produit_id',
      cols: ['code','nom','description','couleur','ordre'], headers: ['Code','Nom','Description','Couleur','Ordre'] },
    { label: 'Plan de charges', desc: 'Epic, Assigné, Semaine, Année, Jours prévus/réalisés', table: 'plan_charges', filterCol: 'produit_id',
      cols: ['epic','assigne_a','semaine','annee','jours','jours_realises'], headers: ['Epic','Assigné','Semaine','Année','Jours prévus','Jours réalisés'] },
    { label: 'DoD — critères', desc: 'Code, Titre, Catégorie, Type, Criticité, Vérifiée', table: 'dod', filterCol: 'produit_id',
      cols: ['code','titre','description','categorie','type','criticite','actif','ordre','verifiee','valeur_cible','valeur_constatee'],
      headers: ['Code','Titre','Description','Catégorie','Type','Criticité','Actif','Ordre','Vérifiée','Cible','Constatée'] },
    { label: 'DoD — catégories', desc: 'Nom, Ordre', table: 'dod_categories', filterCol: 'produit_id',
      cols: ['nom','ordre'], headers: ['Nom','Ordre'] },
    { label: 'Journal d\'activité', desc: 'Action, cible, ancienne/nouvelle valeur, auteur, date', table: 'activite', filterCol: 'produit_id',
      cols: ['action','target','title','field','old_value','new_value','user_id','created_at'],
      headers: ['Action','Cible','Titre','Champ','Ancienne valeur','Nouvelle valeur','Auteur','Date'] },
    { label: 'Commentaires', desc: 'Tâche, auteur, texte, date', table: 'tache_commentaires', filterCol: 'produit_id',
      cols: ['id_tache','user_id','texte','created_at'], headers: ['Tâche','Auteur','Texte','Date'] },
    { label: 'Dépendances (blocages)', desc: 'Tâche bloquée par une autre', table: 'tache_dependances', filterCol: 'produit_id',
      cols: ['bloquee_id','bloque_id','created_at'], headers: ['Tâche bloquée','Bloquée par','Date'] },
    { label: 'Temps passé', desc: 'Tâche, personne, date, minutes, note', table: 'tache_temps', filterCol: 'produit_id',
      cols: ['id_tache','user_id','date','minutes','note'], headers: ['Tâche','Personne','Date','Minutes','Note'] },
    { label: 'Itérations de sprint', desc: 'Historique des transferts de tâche entre sprints', table: 'tache_iterations', filterCol: 'produit_id',
      cols: ['id_tache','numero','origine','sprint','statut','effort_j','effort_realise_j','assigne_a','resultat','commentaire','created_at','closed_at'],
      headers: ['Tâche','Itér.','Origine','Sprint','Statut','Effort','Effort réalisé','Assigné','Résultat','Commentaire','Créée','Clôturée'] },
    { label: 'Réunions', desc: 'Titre, type, date, animateur, terminée (contenu détaillé non inclus)', table: 'reunions', filterCol: 'produit_id',
      cols: ['titre','type_id','date_reunion','semaine','annee','animateur','privee','terminee','created_by','created_at'],
      headers: ['Titre','Type','Date','Semaine','Année','Animateur','Privée','Terminée','Créée par','Créée le'] },
    { label: 'Rôles produit', desc: 'Qui a quel rôle (PO/Dev/Lecteur) sur ce produit', table: 'user_produit_roles', filterCol: 'produit_id',
      cols: ['user_id','role'], headers: ['Utilisateur','Rôle'] },
  ]
  const exportsGlobal = [
    { label: 'Produits', desc: 'Vision, budget, date de lancement, priorité stratégique… (tous produits — pas de filtre)', table: 'produits', filterCol: 'id',
      cols: ['nom','description','couleur','actif','is_template','vision','objectifs_q1','objectifs_q2','objectifs_q3','objectifs_q4','budget_etp','budget_invest','budget_achats','date_lancement_cible','priorite_strategique','niveau_risque','kpis_cibles','outcome_estime','theme'],
      headers: ['Nom','Description','Couleur','Actif','Template','Vision','Objectifs Q1','Objectifs Q2','Objectifs Q3','Objectifs Q4','Budget ETP','Budget Invest','Budget Achats','Date lancement cible','Priorité stratégique','Niveau risque','KPIs cibles','Outcome estimé','Thème'] },
    { label: 'Utilisateurs', desc: 'Trigramme, Prénom, Nom, Rôle, Équipe (tous produits — pas de filtre)', table: 'user_profiles', filterCol: null,
      cols: ['trigramme','prenom','nom','role_metier','actif','equipe_id'], headers: ['Tri','Prénom','Nom','Rôle','Actif','Équipe ID'] },
    { label: 'Équipes', desc: 'Nom, Description, Couleur (tous produits — pas de filtre)', table: 'equipes', filterCol: null,
      cols: ['nom','description','couleur','actif'], headers: ['Nom','Description','Couleur','Actif'] },
    { label: 'Absences', desc: 'Trigramme, Motif, Dates (tous produits — pas de filtre)', table: 'absences', filterCol: null,
      cols: ['trigramme','annee','label','date_debut','date_fin'], headers: ['Trigramme','Année','Motif','Du','Au'] },
    { label: 'ROCKS — initiatives', desc: 'Nom, Semaines départ/deadline, Objectif (transverse — pas de filtre)', table: 'scorecard_initiatives', filterCol: null,
      cols: ['nom','semaine_depart','semaine_deadline','objectif_increments','couleur','ordre'], headers: ['Nom','Semaine départ','Semaine deadline','Objectif','Couleur','Ordre'] },
    { label: 'ROCKS — incréments', desc: 'Initiative, Semaine, Valeur, Statut (transverse — pas de filtre)', table: 'scorecard_increments', filterCol: null,
      cols: ['initiative_id','semaine','valeur','objectif_texte','statut'], headers: ['Initiative ID','Semaine','Valeur','Objectif texte','Statut'] },
    { label: 'Roadmap — jalons', desc: 'Gamme, Nom, Trimestres (transverse — pas de filtre)', table: 'roadmap_items', filterCol: null,
      cols: ['gamme_id','nom','couleur','trimestre_debut','trimestre_fin','icone','ordre'], headers: ['Gamme ID','Nom','Couleur','Trim. début','Trim. fin','Icône','Ordre'] },
    { label: 'Gammes produits', desc: 'Nom, Couleur, Ordre (transverse — pas de filtre)', table: 'gammes_produits', filterCol: null,
      cols: ['nom','couleur','ordre','parent_id'], headers: ['Nom','Couleur','Ordre','Gamme parente ID'] },
    { label: 'Config finance', desc: 'Jours ouvrés par trimestre (TJM par équipe non inclus, donnée imbriquée)', table: 'finance_config', filterCol: null,
      cols: ['jours_par_trim','updated_at'], headers: ['Jours ouvrés/trim','Mis à jour'] },
    { label: 'Fermetures entreprise', desc: 'Périodes de fermeture (congés collectifs, ponts…)', table: 'periodes_fermeture', filterCol: null,
      cols: ['annee','label','date_debut','date_fin'], headers: ['Année','Libellé','Du','Au'] },
    { label: 'Suggestions', desc: 'Retours et idées d\'amélioration des utilisateurs', table: 'suggestions', filterCol: null,
      cols: ['titre','description','statut','importance','auteur_id','created_at'], headers: ['Titre','Description','Statut','Importance','Auteur','Créée le'] },
    { label: 'Invitations en attente', desc: 'Profils créés mais pas encore connectés', table: 'pending_profiles', filterCol: null,
      cols: ['display_name','trigramme','prenom','nom','role_global','created_at'], headers: ['Nom affiché','Trigramme','Prénom','Nom','Rôle global','Créée le'] },
  ]
  const exports = [...exportsProduit, ...exportsGlobal]
  async function fetchRows(item: typeof exports[0]) {
    let q = supabase.from(item.table).select('*')
    if (item.filterCol && produitId !== '') q = q.eq(item.filterCol, produitId)
    const { data, error } = await q
    if (error || !data) { toast('Erreur export', 'error'); return null }
    return data as Record<string, unknown>[]
  }
  function fileName(item: typeof exports[0]) {
    return item.filterCol === 'produit_id' ? `Dimos_D3X_${item.table}_${produitLabel}` : `Dimos_D3X_${item.table}`
  }
  async function doExportCSV(item: typeof exports[0]) {
    const data = await fetchRows(item)
    if (!data) return
    downloadCSV(data, fileName(item), item.headers, item.cols)
    toast(`${data.length} lignes exportées`)
  }
  async function doExportXLSX(item: typeof exports[0]) {
    const data = await fetchRows(item)
    if (!data) return
    const { exportExcel } = await import('@/lib/exportExcel')
    await exportExcel(data, fileName(item), item.headers, item.cols)
    toast(`${data.length} lignes exportées`)
  }
  // Un zip plutôt que 26 fichiers CSV téléchargés un par un (illisible et
  // bloqué par certains navigateurs au-delà de quelques téléchargements
  // simultanés) — jszip chargé à la demande, même logique que exportExcel.
  async function doExportAll() {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    let count = 0
    for (const item of exports) {
      const data = await fetchRows(item)
      if (!data) continue
      zip.file(`${fileName(item)}.csv`, buildCSVString(data, item.headers, item.cols))
      count++
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `Dimos_D3X_export_complet_${new Date().toISOString().slice(0, 10)}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast(`${count} fichiers zippés`)
  }
  function renderRow(item: typeof exports[0]) {
    return (
      <div key={item.table} className="flex items-center justify-between p-4 bg-card rounded-xl border border-border">
        <div>
          <div className="font-semibold text-navy text-sm">{item.label}</div>
          <div className="text-xs text-subtle mt-0.5">{item.desc}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => doExportCSV(item)} className="ds-btn ds-btn-sm flex items-center gap-1.5">
            <Download size={12} /> CSV
          </button>
          <button onClick={() => doExportXLSX(item)} className="ds-btn ds-btn-sm flex items-center gap-1.5">
            <Download size={12} /> Excel
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="max-w-lg flex flex-col gap-2">
      <div className="flex items-center gap-2 p-3 bg-bg border border-border rounded-xl mb-1">
        <span className="text-xs font-semibold text-navy shrink-0">Produit</span>
        <SelectPicker value={produitId === '' ? '' : String(produitId)}
          onChange={v => setProduitId(v === '' ? '' : Number(v))}
          options={[{ value: '', label: 'Tous les produits' }, ...produitsTries.map(p => ({ value: String(p.id), label: p.nom }))]}
          placeholder="Tous les produits" searchable className="flex-1" />
      </div>
      <p className="text-[11px] text-subtle/70 -mt-1 mb-1">
        Le filtre produit ne s'applique qu'aux données rattachées à un produit — les entités transverses (Utilisateurs, Équipes, Absences, ROCKS, Roadmap, Gammes) restent toujours tous produits confondus.
      </p>
      <div className="text-[11px] font-bold text-subtle uppercase tracking-wider mt-1">Par produit</div>
      {exportsProduit.map(renderRow)}
      <div className="text-[11px] font-bold text-subtle uppercase tracking-wider mt-2">Transverses</div>
      {exportsGlobal.map(renderRow)}
      <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-xl border border-indigo-200 mt-1">
        <div>
          <div className="font-semibold text-navy text-sm">Export complet</div>
          <div className="text-xs text-subtle mt-0.5">Un fichier .zip avec tous les CSV ci-dessus</div>
        </div>
        <button onClick={doExportAll} className="ds-btn-primary ds-btn-sm flex items-center gap-1.5">
          <Download size={12} /> Tout télécharger
        </button>
      </div>
    </div>
  )
}
