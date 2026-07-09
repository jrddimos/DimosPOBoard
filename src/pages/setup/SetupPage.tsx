import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { useProduit } from '@/contexts/ProduitContext'
import { Spinner } from '@/components/ui/Spinner'
import { SprintStatutBadge } from '@/components/ui/Badge'
import { useSprints, useSprintActif, useUpsertSprint, useDeleteSprint } from '@/hooks/useSprints'
import { useTaches, useUpdateTache } from '@/hooks/useTaches'
import { useToast } from '@/hooks/useToast'
import { confirm } from '@/components/ui/ConfirmModal'
import { supabase } from '@/lib/supabase'
import { downloadCSV, naturalCompare, buildTacheIndex } from '@/lib/utils'
import { isEligibleForBacklog, isInThisSprint, buildEligibleTree } from '@/lib/sprintEligibility'
import { TacheTree } from '@/components/tache/TacheTree'
import { useProduitIterations, useUpdateIteration, useTransferToNextIteration, type TacheIteration } from '@/hooks/useTacheIterations'
// @react-pdf/renderer et exceljs sont lourds (~800 Ko à eux deux) : chargés
// à la demande au clic sur export, pas au chargement de la page.
import { METIERS_DEFAULT, SPRINTS_LIST, BRAND_COLORS } from '@/constants'
import { useEpics, useCreateEpic, useUpdateEpic, useDeleteEpic, epicFullName, type Epic } from '@/hooks/useEpics'
import { useJalons, useCreateJalon, useUpdateJalon, useDeleteJalon } from '@/hooks/useJalons'
import { useDod } from '@/hooks/useDod'
import {
  Pencil, Trash2, Plus, ChevronDown, ChevronRight, Check, X,
  Tag, Calendar, BookOpen, Target, Download, FileDown, Settings, Lock, Euro, Users,
  Play, Pause, RotateCcw, CheckCircle2, Zap, Wrench,
} from 'lucide-react'
import { PageTitle } from '@/components/ui/PageTitle'
import { SelectPicker } from '@/components/ui/SelectPicker'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import type { SprintStats, Tache } from '@/types'
import FinanceTab from '@/pages/admin/FinanceSetupPage'
import EquipesTab from '@/pages/admin/EquipesUtilisateursPage'

type SetupTab = 'sprints'|'epics'|'jalons'|'metiers'|'export'|'finance'|'equipes'

// Thèmes est ouvert à tous (lecture seule pour les non-admins) ; Finance et
// Équipes restent réservés aux admins, comme avant leur fusion dans Setup.
const GLOBAL_TABS_ALL   = [{ key: 'metiers' as SetupTab, label: 'Thèmes',                 icon: <Tag size={12} /> }]
const GLOBAL_TABS_ADMIN = [
  { key: 'finance' as SetupTab, label: 'Finance',                icon: <Euro size={12} /> },
  { key: 'equipes' as SetupTab, label: 'Équipes & Utilisateurs',  icon: <Users size={12} /> },
]
const PRODUCT_TABS = [
  { key: 'sprints' as SetupTab, label: 'Sprints',  icon: <Calendar size={12} /> },
  { key: 'epics'   as SetupTab, label: 'Epics',    icon: <BookOpen size={12} /> },
  { key: 'jalons'  as SetupTab, label: 'Jalons - Incréments majeurs', icon: <Target size={12} /> },
  { key: 'export'  as SetupTab, label: 'Export',   icon: <Download size={12} /> },
]

export default function SetupPage() {
  const [params]         = useSearchParams()
  const { produitActif } = useProduit()
  const { canEdit, isAdmin } = useAuth()
  const [tab, setTab]    = useState<SetupTab>('metiers')
  const canEditProduct   = produitActif ? canEdit(produitActif.id) : false

  // Onglets visibles selon le contexte : jamais mélangés
  const GLOBAL_TABS  = [...GLOBAL_TABS_ALL, ...(isAdmin ? GLOBAL_TABS_ADMIN : [])]
  const isProductTab = (t: SetupTab) => PRODUCT_TABS.some(x => x.key === t)
  const isGlobalTab  = (t: SetupTab) => t === 'metiers' || t === 'finance' || t === 'equipes'
  const tabs = isProductTab(tab) ? PRODUCT_TABS : GLOBAL_TABS

  useEffect(() => {
    const t = params.get('tab') as SetupTab
    if (t && isGlobalTab(t)) { setTab(t); return }
    if (t && PRODUCT_TABS.some(x => x.key === t)) { setTab(t); return }
    // Pas de tab dans l'URL : contexte produit → sprints, sinon → thèmes
    setTab(produitActif ? 'sprints' : 'metiers')
  }, [params, produitActif])

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
      ) : (tab === 'finance' || tab === 'equipes') && !isAdmin ? (
        <div className="ds-card flex items-center gap-2 text-sm text-subtle">
          <Lock size={14}/> Accès réservé aux administrateurs.
        </div>
      ) : <>
        {tab === 'sprints' && <SprintsTab />}
        {tab === 'epics'   && <EpicsTab />}
        {tab === 'jalons'  && <JalonsTab />}
        {tab === 'metiers' && <MetiersTab />}
        {tab === 'export'  && <ExportTab />}
        {tab === 'finance' && <FinanceTab />}
        {tab === 'equipes' && <EquipesTab />}
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

// ─── SPRINTS TAB ──────────────────────────────────────────────
function SprintsTab() {
  const { data: sprints = [], isLoading } = useSprints()
  const { data: sprintActif }             = useSprintActif()
  const { data: taches = [] }             = useTaches()
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
  const [plannedStart,   setPlannedStart]   = useState('')
  const [plannedWeeks,   setPlannedWeeks]   = useState(2)
  const transferIteration = useTransferToNextIteration()

  const sprint     = sprints.find(s => s.numero === selected)
  // `t.sprint` (l'ancien champ, avant sprint_debut/sprint_fin) porte une
  // valeur par défaut ('S01' constaté en base) sur la quasi-totalité des
  // tâches, y compris jamais planifiées — seul sprint_debut est fiable ici
  // (même bug que celui corrigé dans src/lib/sprintEligibility.ts).
  const spTaches   = taches.filter(t => !t.parent_id && t.type_tache !== 'Conteneur' && t.sprint_debut === selected)
  const unfinished = spTaches.filter(t => t.statut !== 'Fait')
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
    toast(`Sprint ${nextNum} créé`)
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

  useEffect(() => {
    if (sprintActif?.numero && !selected) {
      setSelected(sprintActif.numero); parseSprint(sprintActif)
      setPlannedStart(sprintActif.started_at ? sprintActif.started_at.slice(0, 10) : '')
    }
  }, [sprintActif])

  function selectSprint(num: string) {
    const sp = sprints.find(x => x.numero === num)
    setSelected(num); parseSprint(sp); setShowTasks(true)
    setPlannedStart(sp?.started_at ? sp.started_at.slice(0, 10) : '')
  }

  async function savePlannedDates() {
    if (!selected || !plannedStart) { toast('Choisis une date de début', 'error'); return }
    const start = new Date(plannedStart + 'T00:00:00')
    const end   = new Date(start.getTime() + plannedWeeks * 7 * 86400000)
    await upsertSprint.mutateAsync({ numero: selected, started_at: start.toISOString(), closed_at: end.toISOString() } as Parameters<typeof upsertSprint.mutateAsync>[0])
    toast(`Dates de ${selected} enregistrées (${plannedWeeks} semaine${plannedWeeks > 1 ? 's' : ''})`)
  }

  async function action(type: 'start' | 'pause' | 'close' | 'unlock') {
    if (!selected) { toast('Sélectionnez un sprint', 'error'); return }
    if (type === 'close') {
      if (unfinished.length > 0) {
        const dest: Record<string, 'next' | 'backlog'> = {}
        unfinished.forEach(t => { dest[t.id_tache] = nextSprint ? 'next' : 'backlog' })
        setTacheDest(dest); setTempsPasse({}); setCloseModal(true); return
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
    toast(`Sprint ${selected} mis à jour`)
  }

  function computeStats(tasks: typeof spTaches): SprintStats {
    const total = tasks.length
    const fait  = tasks.filter(t => t.statut === 'Fait').length
    return {
      total,
      fait,
      encours: tasks.filter(t => t.statut === 'En cours').length,
      bloque:  tasks.filter(t => t.statut === 'Bloqué').length,
      effort:  tasks.reduce((s, t) => s + (t.effort_j ?? 0), 0),
      pct:     total ? Math.round(fait / total * 100) : 0,
    }
  }

  async function doClose(stats: SprintStats) {
    const now = new Date().toISOString()
    await upsertSprint.mutateAsync({ numero: selected, statut: 'cloture', est_actif: false, closed_at: now, stats } as Parameters<typeof upsertSprint.mutateAsync>[0])
    toast(`Sprint ${selected} clôturé`)
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
              <h3 className="text-base font-bold text-navy">Clôturer le sprint {selected}</h3>
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
                      <input type="number" min={0} step={0.5} placeholder="0"
                        value={tempsPasse[t.id_tache] ?? ''}
                        onChange={e => setTempsPasse(p => ({ ...p, [t.id_tache]: e.target.value }))}
                        className="ds-input text-xs w-16 py-0.5" />
                      <span className="text-subtle/70">/ {t.effort_j ?? 0}j estimés</span>
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
                <Plus size={13} /> Créer le premier sprint ({nextNum})
              </button>
            ) : (
              <>
                <div className="w-full sm:w-64">
                  <SelectPicker
                    value={selected}
                    onChange={v => selectSprint(v)}
                    placeholder="-- Choisir un sprint --"
                    searchable
                    options={sortedSprints.map(s => ({ value: s.numero, label: `${s.numero} — ${statLabel[s.statut] || s.statut}` }))}
                  />
                </div>
                <button onClick={addNextSprint} disabled={!nextNum || upsertSprint.isPending}
                  title={nextNum ? `Créer ${nextNum}` : 'Limite de 16 sprints atteinte'}
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
                    if (!await confirm({ title: 'Supprimer ce sprint ?', message: `Le sprint ${selected} sera supprimé.`, confirmLabel: 'Supprimer', variant: 'danger' })) return
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
                  <select value={plannedWeeks} onChange={e => setPlannedWeeks(Number(e.target.value))}
                    className="ds-select text-xs w-24">
                    {[1, 2, 3, 4].map(w => <option key={w} value={w}>{w} sem.</option>)}
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
  const toast = useToast()
  const [newNum, setNewNum] = useState(''), [newNom, setNewNom] = useState('')

  const counts: Record<string, number> = {}
  taches.forEach(t => { if (t.epic) counts[t.epic] = (counts[t.epic] ?? 0) + 1 })

  async function add() {
    // Juste un chiffre côté saisie ("14") — le préfixe "EPIC " est ajouté
    // automatiquement pour former le vrai code ("EPIC 14"), tel qu'affiché
    // ensuite dans l'arbre. Tolère aussi un "EPIC" déjà tapé par habitude.
    const digits = newNum.trim().replace(/^epic\s*/i, '').trim()
    const nom = newNom.trim()
    if (!digits || !nom) return
    const code = `EPIC ${digits}`
    if (epicsList.some(e => e.code.toLowerCase() === code.toLowerCase())) { toast('Ce numéro d\'Epic existe déjà', 'error'); return }
    const couleur = BRAND_COLORS[epicsList.length % BRAND_COLORS.length]
    await createEpic.mutateAsync({ code, nom, couleur, bg_couleur: `${couleur}22` })
    toast(`Epic "${code} — ${nom}" ajouté`)
    setNewNum(''); setNewNom('')
  }

  // Change juste le numéro (le "N°" édité isolément, comme à la création) —
  // recalcule le libellé cascadé sur toutes les tâches qui référencent l'Epic.
  async function changeNum(epic: Epic, rawNum: string) {
    const digits = rawNum.trim().replace(/^epic\s*/i, '').trim()
    if (!digits) return
    const newCode = `EPIC ${digits}`
    if (newCode === epic.code) return
    if (epicsList.some(e => e.id !== epic.id && e.code.toLowerCase() === newCode.toLowerCase())) { toast('Ce numéro d\'Epic existe déjà', 'error'); return }
    const ok = await confirm({ title: 'Changer le numéro d\'Epic ?', message: `"${epic.code}" → "${newCode}" dans toutes les tâches.`, confirmLabel: 'Changer' }); if (!ok) return
    const old = epicFullName(epic)
    const canonical = epicFullName({ code: newCode, nom: epic.nom })
    await updateEpic.mutateAsync({ id: epic.id, updates: { code: newCode } })
    await supabase.from('taches').update({ epic: canonical }).eq('epic', old)
    qc.invalidateQueries({ queryKey: ['taches'] })
    toast('Numéro d\'Epic changé')
  }

  async function renameNom(epic: Epic, rawNom: string) {
    const nom = rawNom.trim()
    if (!nom || nom === epic.nom) return
    const ok = await confirm({ title: 'Renommer partout ?', message: `"${epic.nom}" → "${nom}" dans toutes les tâches.`, confirmLabel: 'Renommer' }); if (!ok) return
    const old = epicFullName(epic)
    const canonical = epicFullName({ code: epic.code, nom })
    await updateEpic.mutateAsync({ id: epic.id, updates: { nom } })
    await supabase.from('taches').update({ epic: canonical }).eq('epic', old)
    qc.invalidateQueries({ queryKey: ['taches'] })
    toast('Epic renommé')
  }

  async function changeColor(epic: Epic, couleur: string) {
    await updateEpic.mutateAsync({ id: epic.id, updates: { couleur, bg_couleur: `${couleur}22` } })
  }

  async function del(epic: Epic) {
    const ok = await confirm({ title: 'Supprimer cet Epic ?', message: `Les tâches perdront leur Epic.`, confirmLabel: 'Supprimer', variant: 'danger' }); if (!ok) return
    await deleteEpic.mutateAsync(epic.id)
    await supabase.from('taches').update({ epic: '' }).eq('epic', epicFullName(epic))
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
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="ds-card flex items-end gap-2">
        <div className="flex-none"><div className="ds-label mb-1">N° Epic</div>
          <input value={newNum} onChange={e => setNewNum(e.target.value)} className="ds-input w-20" placeholder="14" inputMode="numeric" /></div>
        <div className="flex-1"><div className="ds-label mb-1">Nom</div><input value={newNom} onChange={e => setNewNom(e.target.value)} className="ds-input" placeholder="Nom de l'Epic" /></div>
        <button onClick={add} disabled={createEpic.isPending || !newNum.trim().replace(/^epic\s*/i, '').trim() || !newNom.trim()}
          className="ds-btn-primary flex items-center gap-1"><Plus size={13} /> Ajouter</button>
      </div>
      <div className="flex items-center justify-between -mt-2">
        <p className="text-xs text-subtle">Cliquez sur le numéro ou le nom pour les modifier, sur le carré pour changer la couleur. Supprimer ne supprime pas les US mais vide leur champ Epic.</p>
        <button onClick={repareIncoherences} title="Recale le texte Epic des tâches dont le libellé a divergé du référentiel (espace en trop, etc.)"
          className="ds-btn ds-btn-sm flex items-center gap-1 shrink-0"><Wrench size={11} /> Réparer les incohérences</button>
      </div>
      {epicsList.length === 0 ? (
        <p className="text-xs text-subtle italic">Aucun Epic défini pour ce produit.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {epicsList.map(epic => {
            const label = epicFullName(epic)
            const nb = counts[label] ?? 0
            const num = epic.code.replace(/^epic\s*/i, '').trim()
            return (
              <div key={epic.id} className="flex items-center gap-3 p-2.5 bg-card rounded-xl border border-border group">
                <label className="w-6 h-6 rounded-md shrink-0 cursor-pointer ring-1 ring-border/60 relative overflow-hidden" style={{ background: epic.couleur ?? '#6366F1' }} title="Changer la couleur">
                  <input type="color" value={epic.couleur ?? '#6366F1'} onChange={e => changeColor(epic, e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </label>
                <InlineEdit value={num} onSave={v => changeNum(epic, v)} placeholder={num} inputClassName="w-16 font-mono" />
                <div className="flex-1 min-w-0">
                  <InlineEdit value={epic.nom} onSave={v => renameNom(epic, v)} placeholder={epic.nom} />
                  <div className="text-xs text-subtle">{nb} US</div>
                </div>
                {nb === 0 && (
                  <button onClick={() => del(epic)}
                    className="p-1.5 rounded-lg max-md:opacity-100 opacity-0 group-hover:opacity-100 hover:bg-rose-50 text-subtle hover:text-rose-600 transition-all">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
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
  const toast = useToast()
  const [code, setCode] = useState('')

  const counts: Record<string, number> = {}
  taches.forEach(t => { if (t.jalon) counts[t.jalon] = (counts[t.jalon] ?? 0) + 1 })
  const colorMap = new Map(jalonsList.map(j => [j.code, j.couleur]))
  const items = jalonsList.map(j => j.code)

  async function add() {
    const c = code.trim().toUpperCase()
    if (!c) return
    if (jalonsList.some(j => j.code.toLowerCase() === c.toLowerCase())) { toast('Ce Jalon existe déjà', 'error'); return }
    await createJalon.mutateAsync({ code: c, couleur: BRAND_COLORS[jalonsList.length % BRAND_COLORS.length] })
    toast(`Jalon - Incrément majeur "${c}" ajouté`)
    setCode('')
  }

  async function rename(old: string, next: string) {
    if (!next || next === old) return
    const jalon = jalonsList.find(j => j.code === old); if (!jalon) return
    if (jalonsList.some(j => j.id !== jalon.id && j.code.toLowerCase() === next.toLowerCase())) { toast('Ce Jalon existe déjà', 'error'); return }
    const ok = await confirm({ title: 'Renommer partout ?', message: `"${old}" → "${next}" dans toutes les tâches.`, confirmLabel: 'Renommer' }); if (!ok) return
    await updateJalon.mutateAsync({ id: jalon.id, updates: { code: next } })
    await supabase.from('taches').update({ jalon: next }).eq('jalon', old)
    qc.invalidateQueries({ queryKey: ['taches'] })
    toast('Jalon - Incrément majeur renommé')
  }

  async function changeColor(code: string, couleur: string) {
    const jalon = jalonsList.find(j => j.code === code); if (!jalon) return
    await updateJalon.mutateAsync({ id: jalon.id, updates: { couleur } })
  }

  async function del(code: string) {
    const jalon = jalonsList.find(j => j.code === code); if (!jalon) return
    const ok = await confirm({ title: 'Supprimer ce Jalon - Incrément majeur ?', message: `Les tâches perdront leur jalon - incrément majeur.`, confirmLabel: 'Supprimer', variant: 'danger' }); if (!ok) return
    await deleteJalon.mutateAsync(jalon.id)
    await supabase.from('taches').update({ jalon: null }).eq('jalon', code)
    qc.invalidateQueries({ queryKey: ['taches'] })
    toast('Jalon - Incrément majeur supprimé')
  }

  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <div className="ds-card flex items-end gap-2">
        <div><div className="ds-label mb-1">Code</div><input value={code} onChange={e => setCode(e.target.value.toUpperCase())} className="ds-input w-20" maxLength={5} placeholder="I7" /></div>
        <button onClick={add} disabled={createJalon.isPending || !code.trim()}
          className="ds-btn-primary flex items-center gap-1"><Plus size={13} /> Ajouter</button>
      </div>
      <p className="text-xs text-subtle -mt-2">Cliquez sur le code pour le renommer, sur le carré pour changer sa couleur. Supprimer vide le champ Jalon - Incrément majeur des tâches concernées.</p>
      {items.length === 0 ? (
        <p className="text-xs text-subtle italic">Aucun Jalon défini pour ce produit.</p>
      ) : (
        <InlineList items={items}
          onRename={rename} onDelete={del} onColorChange={changeColor}
          colorFn={s => colorMap.get(s) ?? '#6366F1'} countFn={s => counts[s] ?? 0} isSystem={() => false} />
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
    <div className="flex flex-col gap-4 max-w-xl">
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
    toast(`${ts.length} US ajoutée(s) au sprint ${selected}`)
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
          <div className="ds-card-title mb-0 flex-1">US du sprint {selected} ({spTachesCount})</div>
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
                panelId={null} onOpenPanel={() => {}} dependances={[]} updateTache={updateTache}
                onDuplicateEpic={() => {}} isAdmin={false} onClearEpic={() => {}} onQuickAdd={() => {}}
                onAddSousTache={() => {}} iterationCounts={iterationCounts} renderExtra={renderSprintExtra}
                showExpandControls={false}
              />
            )
          }
        </div>
      )}
    </div>
  )
}

function ExportTab() {
  const toast   = useToast()
  const exports = [
    { label: 'Toutes les tâches', desc: 'ID, Epic, Titre, Jalon - Incrément majeur, Sprint, Statut, Effort…', table: 'taches',
      cols: ['id_tache','epic','titre','type_fonction','jalon','sprint_debut','sprint_fin','statut','effort_j','moscow','priorite','equipe','metier','assigne_a','lien_dod','iteration'],
      headers: ['ID','Epic','Titre','Type','Jalon - Incrément majeur','Sprint début','Sprint fin','Statut','Effort','MoSCoW','Priorité','Équipe','Métier','Assigné','Exigences','Itér.'] },
    { label: 'Sprints', desc: 'Numéro, Statut, Objectifs, Review, Dates', table: 'sprints',
      cols: ['numero','statut','objectifs','review','started_at','closed_at'], headers: ['Sprint','Statut','Objectifs','Review','Démarré','Clôturé'] },
    { label: 'Utilisateurs', desc: 'Trigramme, Prénom, Nom, Rôle, Équipe', table: 'user_profiles',
      cols: ['trigramme','prenom','nom','role_metier','actif','equipe_id'], headers: ['Tri','Prénom','Nom','Rôle','Actif','Équipe ID'] },
    { label: 'Équipes', desc: 'Nom, Description, Couleur', table: 'equipes',
      cols: ['nom','description','couleur','actif'], headers: ['Nom','Description','Couleur','Actif'] },
  ]
  async function fetchRows(item: typeof exports[0]) {
    const { data, error } = await supabase.from(item.table).select('*')
    if (error || !data) { toast('Erreur export', 'error'); return null }
    return data as Record<string, unknown>[]
  }
  async function doExportCSV(item: typeof exports[0]) {
    const data = await fetchRows(item)
    if (!data) return
    downloadCSV(data, `Dimos_D3X_${item.table}`, item.headers, item.cols)
    toast(`${data.length} lignes exportées`)
  }
  async function doExportXLSX(item: typeof exports[0]) {
    const data = await fetchRows(item)
    if (!data) return
    const { exportExcel } = await import('@/lib/exportExcel')
    await exportExcel(data, `Dimos_D3X_${item.table}`, item.headers, item.cols)
    toast(`${data.length} lignes exportées`)
  }
  async function doExportAll() {
    for (const item of exports) { await doExportCSV(item); await new Promise(r => setTimeout(r, 600)) }
    toast('4 fichiers téléchargés')
  }
  return (
    <div className="max-w-lg flex flex-col gap-2">
      {exports.map(item => (
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
      ))}
      <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-xl border border-indigo-200">
        <div>
          <div className="font-semibold text-navy text-sm">Export complet</div>
          <div className="text-xs text-subtle mt-0.5">Tous les fichiers CSV</div>
        </div>
        <button onClick={doExportAll} className="ds-btn-primary ds-btn-sm flex items-center gap-1.5">
          <Download size={12} /> Tout télécharger
        </button>
      </div>
    </div>
  )
}
