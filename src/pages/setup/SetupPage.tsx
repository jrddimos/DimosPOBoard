import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { useProduit } from '@/contexts/ProduitContext'
import { Spinner } from '@/components/ui/Spinner'
import { SprintStatutBadge, StatutBadge } from '@/components/ui/Badge'
import { useSprints, useSprintActif, useUpsertSprint, useDeleteSprint } from '@/hooks/useSprints'
import { useTaches, useUpdateTache } from '@/hooks/useTaches'
import { useToast } from '@/hooks/useToast'
import { confirm } from '@/components/ui/ConfirmModal'
import { supabase } from '@/lib/supabase'
import { exportSprintReviewHTML } from '@/lib/exportPdf'
import { downloadCSV } from '@/lib/utils'
import { EPIC_COLORS, JALON_LIST, JALON_COLORS, METIERS_DEFAULT, SPRINTS_LIST } from '@/constants'
import {
  Pencil, Trash2, Plus, ChevronDown, ChevronRight, Check, X,
  Tag, Calendar, BookOpen, Target, Download, FileDown, Settings, Lock,
} from 'lucide-react'
import { PageTitle } from '@/components/ui/PageTitle'
import { SelectPicker } from '@/components/ui/SelectPicker'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import type { SprintStats } from '@/types'

type SetupTab = 'sprints'|'epics'|'jalons'|'metiers'|'export'

const GLOBAL_TABS = [
  { key: 'metiers' as SetupTab, label: 'Thèmes',  icon: <Tag size={12} /> },
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
  const isProductTab = (t: SetupTab) => PRODUCT_TABS.some(x => x.key === t)
  const tabs = isProductTab(tab) ? PRODUCT_TABS : GLOBAL_TABS

  useEffect(() => {
    const t = params.get('tab') as SetupTab
    if (t === 'metiers') { setTab('metiers'); return }
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
                tab === t.key ? 'bg-white shadow-sm text-navy' : 'text-subtle hover:text-navy'
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
      ) : <>
        {tab === 'sprints' && <SprintsTab />}
        {tab === 'epics'   && <EpicsTab />}
        {tab === 'jalons'  && <JalonsTab />}
        {tab === 'metiers' && <MetiersTab />}
        {tab === 'export'  && <ExportTab />}
      </>}
    </Layout>
  )
}

// ─── Inline edit field ────────────────────────────────────────
function InlineEdit({ value, onSave, placeholder = '' }: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(value)
  const ref                   = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  if (!editing) return (
    <button onClick={() => { setVal(value); setEditing(true) }}
      className="flex items-center gap-1 text-sm font-semibold text-navy hover:text-indigo-600 transition-colors group">
      {value || <span className="text-subtle italic">{placeholder}</span>}
      <Pencil size={11} className="opacity-0 group-hover:opacity-60" />
    </button>
  )
  return (
    <div className="flex items-center gap-1">
      <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
        className="ds-input py-0.5 text-sm font-semibold w-48"
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
  const [openChecklist,  setOpenChecklist]  = useState(true)
  const [closeModal,     setCloseModal]     = useState(false)
  const [tacheDest,      setTacheDest]      = useState<Record<string, 'next' | 'backlog'>>({})

  const sprint     = sprints.find(s => s.numero === selected)
  const spTaches   = taches.filter(t => !t.parent_id && (t.sprint === selected || t.sprint_debut === selected))
  const unfinished = spTaches.filter(t => t.statut !== 'Fait')
  const statLabel: { [k: string]: string } = { planifie: 'planifié', en_cours: 'en cours', pause: 'en pause', cloture: 'clôturé' }
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
    if (sprintActif?.numero && !selected) { setSelected(sprintActif.numero); parseSprint(sprintActif) }
  }, [sprintActif])

  function selectSprint(num: string) {
    setSelected(num); parseSprint(sprints.find(x => x.numero === num)); setShowTasks(true)
  }

  async function action(type: 'start' | 'pause' | 'close' | 'unlock') {
    if (!selected) { toast('Sélectionnez un sprint', 'error'); return }
    if (type === 'close') {
      if (unfinished.length > 0) {
        const dest: Record<string, 'next' | 'backlog'> = {}
        unfinished.forEach(t => { dest[t.id_tache] = nextSprint ? 'next' : 'backlog' })
        setTacheDest(dest); setCloseModal(true); return
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
      if (dest === 'next' && nextSprint)
        await updateTache.mutateAsync({ id_tache, updates: { sprint: nextSprint, sprint_debut: nextSprint } })
      else
        await updateTache.mutateAsync({ id_tache, updates: { sprint: '', sprint_debut: null, sprint_fin: null } })
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
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
              {unfinished.map(t => (
                <div key={t.id_tache} className="flex items-center gap-2 p-2.5 rounded-xl bg-bg text-xs">
                  <span className="font-semibold text-indigo-600 w-16 shrink-0">{t.id_tache}</span>
                  <span className="flex-1 truncate text-navy">{t.titre}</span>
                  <div className="flex gap-1 shrink-0">
                    {nextSprint && (
                      <button onClick={() => setTacheDest(p => ({ ...p, [t.id_tache]: 'next' }))}
                        className={cn('px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors',
                          tacheDest[t.id_tache] === 'next' ? 'bg-indigo-600 text-white' : 'bg-border/60 text-subtle hover:bg-indigo-100')}>
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
              ))}
            </div>
            <div className="flex gap-3 justify-end px-5 py-4 border-t border-border">
              <button onClick={() => setCloseModal(false)} className="ds-btn ds-btn-sm">Annuler</button>
              <button onClick={confirmClose} disabled={updateTache.isPending}
                className="ds-btn-primary ds-btn-sm">Clôturer le sprint</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Colonne gauche ───────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <div className="ds-card">
              <div className="ds-card-title">Sprint</div>
              <SelectPicker
                value={selected}
                onChange={v => selectSprint(v)}
                placeholder="-- Choisir --"
                searchable
                className="mb-3"
                options={SPRINTS_LIST.map(s => {
                  const sp = sprints.find(x => x.numero === s)
                  return { value: s, label: `${s}${sp ? ` — ${statLabel[sp.statut] || sp.statut}` : ''}` }
                })}
              />
              {sprint && <div className="mb-3"><SprintStatutBadge value={sprint.statut} /></div>}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button onClick={() => action('start')} disabled={!selected || sprint?.statut === 'en_cours'}
                  className="ds-btn text-xs py-1.5 bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600 disabled:opacity-40">
                  ▶ Démarrer
                </button>
                <button onClick={() => action('pause')} disabled={!selected || sprint?.statut !== 'en_cours'}
                  className="ds-btn text-xs py-1.5 bg-amber-500 text-white border-amber-500 hover:bg-amber-600 disabled:opacity-40">
                  ⏸ Pause
                </button>
                <button onClick={() => action('close')} disabled={!selected}
                  className="ds-btn-primary text-xs py-1.5 disabled:opacity-40">✓ Clôturer</button>
                {sprint?.statut === 'cloture' && (
                  <button onClick={() => action('unlock')} className="ds-btn text-xs py-1.5">Rouvrir</button>
                )}
              </div>
              <div className="flex gap-2 pt-3 border-t border-border">
                <button className="ds-btn ds-btn-sm flex items-center gap-1" onClick={async () => {
                  const num = window.prompt('Numéro du nouveau sprint (ex: S17):'); if (!num) return
                  await upsertSprint.mutateAsync({ numero: num.toUpperCase(), statut: 'planifie', est_actif: false }); toast(`Sprint ${num} créé`)
                }}><Plus size={11} /> Nouveau</button>
                <button className="ds-btn ds-btn-sm text-rose-600 hover:bg-rose-50 flex items-center gap-1" onClick={async () => {
                  if (!selected) { toast('Sélectionnez', 'error'); return }
                  if (spTaches.length > 0) { toast(`${spTaches.length} US dans ce sprint`, 'error'); return }
                  if (!await confirm({ title: 'Supprimer ce sprint ?', message: `Le sprint ${selected} sera supprimé.`, confirmLabel: 'Supprimer', variant: 'danger' })) return
                  await deleteSprint.mutateAsync(selected); toast('Supprimé'); setSelected('')
                }}><Trash2 size={11} /> Supprimer</button>
                {sprint && (
                  <button className="ds-btn ds-btn-sm flex items-center gap-1"
                    onClick={() => exportSprintReviewHTML(sprint, spTaches)}>
                    <FileDown size={11} /> Export Review
                  </button>
                )}
              </div>
            </div>

            {sprint && spTaches.length > 0 && (() => {
              const liveStats = computeStats(spTaches)
              const stats     = sprint.statut === 'cloture' && sprint.stats && spTaches.length === 0 ? sprint.stats : liveStats
              const isClosed  = sprint.statut === 'cloture'
              return (
                <div className="ds-card">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="ds-card-title mb-0">{isClosed ? 'Stats clôture' : 'Stats en cours'}</div>
                    {!isClosed && <span className="text-xs text-subtle italic">mise à jour en temps réel</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {([['Total US', stats.total], ['Terminées', `${stats.fait} (${stats.pct}%)`], ['En cours', stats.encours], ['Bloquées', stats.bloque], ['Effort total', `${stats.effort}j`]] as [string, string | number][]).map(([k, v]) => (
                      <div key={k} className="bg-bg rounded-lg p-2 text-center">
                        <div className="text-lg font-bold text-navy">{v}</div>
                        <div className="text-xs text-subtle">{k}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* ── Colonne droite ──────────────────────────────────── */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Objectifs */}
              <div className={cn('ds-card flex flex-col gap-3', !canEditObj && 'opacity-70')}>
                <div className="flex items-center gap-2">
                  <div className="ds-label mb-0 flex-1">Objectifs — {selected || '—'}</div>
                  {!canEditObj && <span className="text-xs text-amber-600 font-semibold">Sprint en cours</span>}
                </div>
                <textarea value={freeObj} onChange={e => setFreeObj(e.target.value)} rows={9}
                  readOnly={!canEditObj}
                  className={cn('ds-textarea w-full resize-y', !canEditObj && 'cursor-not-allowed bg-bg/50')}
                  placeholder="Notes libres sur les objectifs…" />
                <button onClick={() => setOpenChecklist(o => !o)}
                  className="flex items-center gap-2 text-xs font-semibold text-navy hover:text-indigo-600 transition-colors">
                  {openChecklist ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  Objectifs clés ({items.length})
                  {canEditObj && (
                    <div className="flex gap-1 ml-auto" onClick={e => e.stopPropagation()}>
                      <input value={newItem} onChange={e => setNewItem(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addItem()}
                        className="ds-input text-xs h-6 px-2 w-32" placeholder="Ajouter…" />
                      <button onClick={addItem} className="ds-btn ds-btn-sm h-6 px-1.5"><Plus size={10} /></button>
                    </div>
                  )}
                </button>
                {openChecklist && (
                  items.length === 0
                    ? <p className="text-xs text-subtle italic pl-4">Aucun objectif clé</p>
                    : <ul className="flex flex-col gap-1 pl-4">
                      {items.map(item => (
                        <li key={item} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-bg group text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 shrink-0" />
                          <span className="flex-1 text-navy">{item}</span>
                          {canEditObj && (
                            <button onClick={() => removeItem(item)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-rose-50 text-subtle hover:text-rose-600 transition-all"><X size={10} /></button>
                          )}
                        </li>
                      ))}
                    </ul>
                )}
              </div>

              {/* Review */}
              <div className="ds-card flex flex-col gap-3">
                <div className="ds-label mb-0">Sprint Review — {selected || '—'}</div>
                <textarea value={freeRev} onChange={e => setFreeRev(e.target.value)} rows={9}
                  className="ds-textarea w-full resize-y" placeholder="Bilan du sprint…" />
                <button onClick={() => setOpenChecklist(o => !o)}
                  className="flex items-center gap-2 text-xs font-semibold text-navy hover:text-indigo-600 transition-colors">
                  {openChecklist ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  Checklist objectifs
                  {items.length > 0 && (
                    <span className={cn('ml-auto text-xs font-bold', pct === 100 ? 'text-emerald-600' : 'text-subtle')}>
                      {doneCount}/{items.length} · {pct}%
                    </span>
                  )}
                </button>
                {openChecklist && (
                  <>
                    {items.length > 0 && (
                      <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
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
                              checks[item] ? 'bg-emerald-50 text-emerald-700' : 'bg-bg hover:bg-border/40 text-navy')}>
                            <span className={cn('w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors',
                              checks[item] ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-border bg-white')}>
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

              <button onClick={save} disabled={!selected}
                className="ds-btn-primary ds-btn-sm self-start disabled:opacity-40 col-span-2">Sauvegarder</button>
            </div>
          </div>
        </div>

        {/* ── US pleine largeur ──────────────────────────────── */}
        <SprintTaskManager selected={selected} taches={taches} showTasks={showTasks} setShowTasks={setShowTasks} />
      </div>
    </>
  )
}

// ─── INLINE LIST (Epics/Jalons/Métiers) ──────────────────────
function InlineList({ items, onRename, onDelete, colorFn, countFn, isSystem }: {
  items: string[]; onRename: (old: string, next: string) => void; onDelete: (nom: string) => void
  colorFn: (s: string) => string; countFn: (s: string) => number; isSystem: (s: string) => boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map(item => {
        const color = colorFn(item), nb = countFn(item), sys = isSystem(item)
        return (
          <div key={item} className="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-border group">
            <div className="w-6 h-6 rounded-md shrink-0" style={{ background: color }} />
            <div className="flex-1 min-w-0">
              <InlineEdit value={item} onSave={v => onRename(item, v)} placeholder={item} />
              <div className="text-xs text-subtle">{nb} US{sys ? ' · Système' : ''}</div>
            </div>
            {nb === 0 && (
              <button onClick={() => onDelete(item)}
                className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-rose-50 text-subtle hover:text-rose-600 transition-all">
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
  const { data: taches = [] } = useTaches(); const toast = useToast()
  const [newNum, setNewNum] = useState(''), [newNom, setNewNom] = useState('')
  const counts: Record<string, number> = {}; taches.forEach(t => { if (t.epic) counts[t.epic] = (counts[t.epic] ?? 0) + 1 })
  const epics = Object.keys(counts).sort()
  async function rename(old: string, next: string) {
    if (!next || next === old) return
    const ok = await confirm({ title: 'Renommer partout ?', message: `"${old}" → "${next}" dans toutes les tâches.`, confirmLabel: 'Renommer' }); if (!ok) return
    await supabase.from('taches').update({ epic: next }).eq('epic', old); toast('Epic renommé')
  }
  async function del(nom: string) {
    const ok = await confirm({ title: 'Supprimer cet Epic ?', message: `Les tâches perdront leur Epic.`, confirmLabel: 'Supprimer', variant: 'danger' }); if (!ok) return
    await supabase.from('taches').update({ epic: '' }).eq('epic', nom); toast('Epic supprimé')
  }
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="ds-card flex items-end gap-2">
        <div className="flex-none"><div className="ds-label mb-1">Numéro</div><input value={newNum} onChange={e => setNewNum(e.target.value)} className="ds-input w-28" placeholder="EPIC 14" /></div>
        <div className="flex-1"><div className="ds-label mb-1">Nom</div><input value={newNom} onChange={e => setNewNom(e.target.value)} className="ds-input" placeholder="Nom de l'Epic" /></div>
        <button onClick={() => { if (!newNum || !newNom) return; toast(`Epic "${newNum} — ${newNom}" prêt`); setNewNum(''); setNewNom('') }}
          className="ds-btn-primary flex items-center gap-1"><Plus size={13} /> Ajouter</button>
      </div>
      <p className="text-xs text-subtle -mt-2">Cliquez sur le nom pour le renommer directement. Supprimer ne supprime pas les US mais vide leur champ Epic.</p>
      <InlineList items={epics}
        onRename={rename} onDelete={del}
        colorFn={s => EPIC_COLORS[s] ?? '#6366F1'} countFn={s => counts[s] ?? 0} isSystem={() => false} />
    </div>
  )
}

function JalonsTab() {
  const { data: taches = [] } = useTaches(); const toast = useToast()
  const [code, setCode] = useState('')
  const counts: Record<string, number> = {}; taches.forEach(t => { if (t.jalon) counts[t.jalon] = (counts[t.jalon] ?? 0) + 1 })
  JALON_LIST.forEach(j => { if (!counts[j]) counts[j] = 0 })
  const jalons = Object.keys(counts).sort()
  async function rename(old: string, next: string) {
    if (!next || next === old) return
    const ok = await confirm({ title: 'Renommer partout ?', message: `"${old}" → "${next}" dans toutes les tâches.`, confirmLabel: 'Renommer' }); if (!ok) return
    await supabase.from('taches').update({ jalon: next }).eq('jalon', old); toast('Jalon - Incrément majeur renommé')
  }
  async function del(nom: string) {
    const ok = await confirm({ title: 'Supprimer ce Jalon - Incrément majeur ?', message: `Les tâches perdront leur jalon - incrément majeur.`, confirmLabel: 'Supprimer', variant: 'danger' }); if (!ok) return
    await supabase.from('taches').update({ jalon: null }).eq('jalon', nom); toast('Jalon - Incrément majeur supprimé')
  }
  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <div className="ds-card flex items-end gap-2">
        <div><div className="ds-label mb-1">Code</div><input value={code} onChange={e => setCode(e.target.value.toUpperCase())} className="ds-input w-20" maxLength={5} placeholder="I7" /></div>
        <button onClick={() => { if (!code) return; toast(`Jalon - Incrément majeur "${code}" ajouté`); setCode('') }}
          className="ds-btn-primary flex items-center gap-1"><Plus size={13} /> Ajouter</button>
      </div>
      <p className="text-xs text-subtle -mt-2">Cliquez sur le code pour le renommer. Supprimer vide le champ Jalon - Incrément majeur des tâches concernées.</p>
      <InlineList items={jalons}
        onRename={rename} onDelete={del}
        colorFn={s => JALON_COLORS[s] ?? '#6366F1'} countFn={s => counts[s] ?? 0}
        isSystem={s => JALON_LIST.includes(s as typeof JALON_LIST[number])} />
    </div>
  )
}

function MetiersTab() {
  const { data: taches = [] } = useTaches(); const toast = useToast()
  const [nom, setNom] = useState('')
  const counts: Record<string, number> = {}; taches.forEach(t => { if (t.metier) counts[t.metier] = (counts[t.metier] ?? 0) + 1 })
  const metiers = Object.keys(counts).sort()
  async function rename(old: string, next: string) {
    if (!next || next === old) return
    const ok = await confirm({ title: 'Renommer partout ?', message: `"${old}" → "${next}" dans toutes les tâches.`, confirmLabel: 'Renommer' }); if (!ok) return
    await supabase.from('taches').update({ metier: next }).eq('metier', old); toast('Métier renommé')
  }
  async function del(n: string) {
    const ok = await confirm({ title: 'Supprimer ce Métier ?', message: `Les tâches perdront leur métier.`, confirmLabel: 'Supprimer', variant: 'danger' }); if (!ok) return
    await supabase.from('taches').update({ metier: null }).eq('metier', n); toast('Métier supprimé')
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
function SprintTaskManager({ selected, taches, showTasks, setShowTasks }: {
  selected: string; taches: ReturnType<typeof useTaches>['data']; showTasks: boolean; setShowTasks: (v: boolean) => void
}) {
  const updateTache = useUpdateTache()
  const toast       = useToast()
  const [showAdd,   setShowAdd]   = useState(false)
  const [search,    setSearch]    = useState('')
  const [fEpic,     setFEpic]     = useState('')
  const [fStatut,   setFStatut]   = useState('')
  const [fMoscow,   setFMoscow]   = useState('')
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const T = taches ?? []

  const spTaches  = T.filter(t => !t.parent_id && (t.sprint === selected || t.sprint_debut === selected))
  const available = T.filter(t => !t.parent_id && t.sprint !== selected && t.sprint_debut !== selected)

  const epics   = [...new Set(available.map(t => t.epic).filter(Boolean))].sort()
  const statuts = ['À faire', 'En cours', 'Fait', 'Bloqué']
  const moscows = ['Must Have', 'Should Have', 'Could Have', "Won't Have"]

  const filtered = available.filter(t => {
    if (search  && !t.id_tache.toLowerCase().includes(search.toLowerCase()) && !t.titre.toLowerCase().includes(search.toLowerCase())) return false
    if (fEpic   && t.epic   !== fEpic)   return false
    if (fStatut && t.statut !== fStatut) return false
    if (fMoscow && t.moscow !== fMoscow) return false
    return true
  })

  const allFilteredSelected = filtered.length > 0 && filtered.every(t => selection.has(t.id_tache))

  function toggleOne(id: string) {
    setSelection(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleAll() {
    setSelection(prev => {
      const s = new Set(prev)
      if (allFilteredSelected) filtered.forEach(t => s.delete(t.id_tache))
      else filtered.forEach(t => s.add(t.id_tache))
      return s
    })
  }

  async function removeFromSprint(id_tache: string) {
    await updateTache.mutateAsync({ id_tache, updates: { sprint: '', sprint_debut: null } })
    toast(`${id_tache} retiré du sprint`)
  }

  async function addSelection() {
    if (!selection.size) return
    for (const id_tache of selection)
      await updateTache.mutateAsync({ id_tache, updates: { sprint: selected, sprint_debut: selected } })
    toast(`${selection.size} US ajoutée(s) au sprint ${selected}`)
    setSelection(new Set())
    setShowAdd(false)
  }

  return (
    <div className="ds-card">
      <div className="flex items-center gap-2 mb-2">
        <button className="flex items-center gap-2 flex-1" onClick={() => setShowTasks(!showTasks)}>
          <div className="ds-card-title mb-0 flex-1">US du sprint {selected} ({spTaches.length})</div>
          {showTasks ? <ChevronDown size={14} className="text-subtle" /> : <ChevronRight size={14} className="text-subtle" />}
        </button>
        {selected && (
          <button onClick={() => { setShowAdd(s => !s); setSelection(new Set()) }}
            className="ds-btn ds-btn-sm flex items-center gap-1"><Plus size={11} /> Ajouter US</button>
        )}
      </div>

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

          <div className="flex items-center gap-2 px-3 py-1.5 bg-bg/60 border-b border-border text-xs text-subtle font-semibold">
            <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll}
              className="w-3.5 h-3.5 accent-indigo-600 shrink-0" />
            <span className="w-16 shrink-0">ID</span>
            <span className="flex-1">Titre</span>
            <span className="w-20 text-center shrink-0">Epic</span>
            <span className="w-20 text-center shrink-0">Statut</span>
            <span className="w-20 text-center shrink-0">MoSCoW</span>
            <span className="w-10 text-right shrink-0">Effort</span>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-border">
            {filtered.length === 0
              ? <div className="py-6 text-center text-subtle text-xs">Aucune US disponible</div>
              : filtered.map(t => (
                <label key={t.id_tache}
                  className={cn('flex items-center gap-2 px-3 py-2 text-xs cursor-pointer transition-colors',
                    selection.has(t.id_tache) ? 'bg-indigo-50/60' : 'hover:bg-bg/60')}>
                  <input type="checkbox" checked={selection.has(t.id_tache)} onChange={() => toggleOne(t.id_tache)}
                    className="w-3.5 h-3.5 accent-indigo-600 shrink-0" />
                  <span className="font-semibold text-indigo-600 w-16 shrink-0">{t.id_tache}</span>
                  <span className="flex-1 truncate text-navy">{t.titre}</span>
                  <span className="w-20 text-center truncate text-subtle">{t.epic || '—'}</span>
                  <span className="w-20 text-center shrink-0"><StatutBadge value={t.statut} /></span>
                  <span className="w-20 text-center truncate text-subtle text-[10px]">{t.moscow || '—'}</span>
                  <span className="w-10 text-right text-subtle shrink-0">{t.effort_j ?? 0}j</span>
                </label>
              ))
            }
          </div>

          <div className="flex items-center justify-between px-3 py-2 bg-bg border-t border-border">
            <span className="text-xs text-subtle">{filtered.length} US · {selection.size} sélectionnée(s)</span>
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
        <div className="max-h-80 overflow-y-auto border border-border rounded-xl divide-y divide-border">
          {spTaches.length ? spTaches.map(t => (
            <div key={t.id_tache} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-bg/50">
              <span className="font-semibold text-indigo-600 w-16 shrink-0">{t.id_tache}</span>
              <span className="flex-1 truncate text-navy">{t.titre}</span>
              <StatutBadge value={t.statut} />
              <span className="text-subtle">{t.effort_j ?? 0}j</span>
              <button onClick={() => removeFromSprint(t.id_tache)} title="Retirer du sprint"
                className="p-1 rounded hover:bg-rose-50 text-subtle hover:text-rose-600 shrink-0"><X size={11} /></button>
            </div>
          )) : <div className="py-6 text-center text-subtle text-xs">Aucune US dans ce sprint</div>}
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
      headers: ['ID','Epic','Titre','Type','Jalon - Incrément majeur','Sprint début','Sprint fin','Statut','Effort','MoSCoW','Priorité','Équipe','Métier','Assigné','Lien DoD','Itér.'] },
    { label: 'Sprints', desc: 'Numéro, Statut, Objectifs, Review, Dates', table: 'sprints',
      cols: ['numero','statut','objectifs','review','started_at','closed_at'], headers: ['Sprint','Statut','Objectifs','Review','Démarré','Clôturé'] },
    { label: 'Utilisateurs', desc: 'Trigramme, Prénom, Nom, Rôle, Équipe', table: 'user_profiles',
      cols: ['trigramme','prenom','nom','role_metier','actif','equipe_id'], headers: ['Tri','Prénom','Nom','Rôle','Actif','Équipe ID'] },
    { label: 'Équipes', desc: 'Nom, Description, Couleur', table: 'equipes',
      cols: ['nom','description','couleur','actif'], headers: ['Nom','Description','Couleur','Actif'] },
  ]
  async function doExport(item: typeof exports[0]) {
    const { data, error } = await supabase.from(item.table).select('*')
    if (error || !data) { toast('Erreur export', 'error'); return }
    downloadCSV(data as Record<string, unknown>[], `Dimos_D3X_${item.table}`, item.headers, item.cols)
    toast(`${data.length} lignes exportées`)
  }
  async function doExportAll() {
    for (const item of exports) { await doExport(item); await new Promise(r => setTimeout(r, 600)) }
    toast('4 fichiers téléchargés')
  }
  return (
    <div className="max-w-lg flex flex-col gap-2">
      {exports.map(item => (
        <div key={item.table} className="flex items-center justify-between p-4 bg-white rounded-xl border border-border">
          <div>
            <div className="font-semibold text-navy text-sm">{item.label}</div>
            <div className="text-xs text-subtle mt-0.5">{item.desc}</div>
          </div>
          <button onClick={() => doExport(item)} className="ds-btn ds-btn-sm flex items-center gap-1.5">
            <Download size={12} /> CSV
          </button>
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
