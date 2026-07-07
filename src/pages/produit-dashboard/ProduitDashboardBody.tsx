import React, { useState, useMemo, lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { Tooltip } from '@/components/ui/Tooltip'
import { useNavigate } from 'react-router-dom'
import { useUpdateProduit } from '@/hooks/useProduits'
import { useSprintActif, useSprints } from '@/hooks/useSprints'
import { useTachesByProduit } from '@/hooks/useTaches'
import { useUtilisateurs, useEquipes } from '@/hooks/useEquipes'
import { useFinanceConfig } from '@/hooks/useFinanceConfig'
import { useFaitTransitions } from '@/hooks/useActivityLog'
import { trimEtpCostEur } from '@/utils/produitMetrics'
import { cn } from '@/lib/utils'
import { AlertTriangle, Check, CheckCircle, XCircle, CornerDownRight, ListPlus, Lock, Pencil, Plus, X } from 'lucide-react'
import type { Produit, RisqueItem, ActionLop } from '@/hooks/useProduits'
import { useEpicsByProduit, epicFullName } from '@/hooks/useEpics'
import { useJalonsByProduit } from '@/hooks/useJalons'
import { BentoGrid } from '@/pages/dashboard/cockpit/BentoGrid'

// Graphiques en widgets — chargés à la demande pour garder recharts hors du bundle initial
const LazyRoadmapChart   = lazy(() => import('@/pages/dashboard/DashboardCharts').then(m => ({ default: m.RoadmapChart })))
const LazyStatutsChart   = lazy(() => import('@/pages/dashboard/DashboardCharts').then(m => ({ default: m.VerticalStackedStatutChart })))
const LazyEpicsChart     = lazy(() => import('@/pages/dashboard/DashboardCharts').then(m => ({ default: m.ProduitEpicsChart })))
const LazyTendanceChart  = lazy(() => import('@/pages/dashboard/DashboardCharts').then(m => ({ default: m.ProduitTendanceSprintChart })))
const LazyBurndownChart  = lazy(() => import('@/pages/dashboard/DashboardCharts').then(m => ({ default: m.ProduitBurndownChart })))

function ChartWidget({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-white rounded-2xl overflow-hidden flex flex-col shadow-md h-full">
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 shrink-0">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{title}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <Suspense fallback={<div className="flex items-center justify-center h-full text-xs text-subtle/40">Chargement…</div>}>
          {children}
        </Suspense>
      </div>
    </div>
  )
}
import type { ViewLayoutItem } from '@/hooks/useDashboardViews'

// Disposition par défaut : reproduit l'agencement historique
// (colonne étroite / colonne centrale / colonne droite, LOP en pleine largeur)
const PRODUIT_LAYOUT: ViewLayoutItem[] = [
  { i: 'produit',    x: 0, y: 0, w: 2, h: 3 },
  { i: 'equipes',    x: 0, y: 3, w: 2, h: 3 },
  { i: 'jalons',     x: 0, y: 6, w: 2, h: 3 },
  { i: 'avancement', x: 2, y: 0, w: 7, h: 4 },
  { i: 'epics',      x: 2, y: 4, w: 3, h: 5 },
  { i: 'points',     x: 5, y: 4, w: 4, h: 5 },
  { i: 'effort',     x: 9, y: 0, w: 3, h: 3 },
  { i: 'finance',    x: 9, y: 3, w: 3, h: 3 },
  { i: 'risques',    x: 9, y: 6, w: 3, h: 3 },
  { i: 'lop',        x: 0, y: 9, w: 12, h: 4 },
]

// ── Types ────────────────────────────────────────────────────────
type Rag = 'green' | 'amber' | 'red' | null

const RAG_CFG: Record<string, { bg: string; text: string; border: string; icon: (s: number) => React.ReactNode }> = {
  green: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: s => <CheckCircle  size={s} /> },
  amber: { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   icon: s => <AlertTriangle size={s} /> },
  red:   { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    icon: s => <XCircle      size={s} /> },
}
const TRAJ_CFG: Record<string, { bg: string; text: string; label: string }> = {
  green: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'En cours'  },
  amber: { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'À risque'  },
  red:   { bg: 'bg-rose-50',    text: 'text-rose-700',    label: 'En retard' },
}

function RagIcon({ rag, size = 14 }: { rag: Rag; size?: number }) {
  if (rag === 'green') return <CheckCircle  size={size} />
  if (rag === 'amber') return <AlertTriangle size={size} />
  if (rag === 'red')   return <XCircle      size={size} />
  return null
}

// ── Helpers ──────────────────────────────────────────────────────
function getISOWeek(date: Date) {
  const d = new Date(date); d.setHours(0,0,0,0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const w1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d.getTime()-w1.getTime())/86400000 - 3 + ((w1.getDay()+6)%7))/7)
}
function fmt(n: number) { return n.toLocaleString('fr-FR', { style:'currency', currency:'EUR', maximumFractionDigits:0 }) }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('fr-FR') }

function ragDelai(dateLancement: string | null): { rag: Rag; retardJours: number; onTime: boolean } {
  if (!dateLancement) return { rag: null, retardJours: 0, onTime: true }
  const diff = Math.floor((Date.now() - new Date(dateLancement).getTime()) / 86400000)
  if (diff > 0)   return { rag: 'red',   retardJours: diff, onTime: false }
  if (diff > -14) return { rag: 'amber', retardJours: 0,    onTime: true  }
  return              { rag: 'green', retardJours: 0,    onTime: true  }
}
function getQuarterStart(trimId: string): Date | null {
  const m = trimId.match(/Q([1-4])[- ](\d{4})/i)
  if (!m) return null
  return new Date(parseInt(m[2]), [0,3,6,9][parseInt(m[1])-1], 1)
}
function getQuarterEnd(trimId: string): Date | null {
  const m = trimId.match(/Q([1-4])[- ](\d{4})/i)
  if (!m) return null
  const year = parseInt(m[2])
  const ends: [number, number][] = [[2,31],[5,30],[8,30],[11,31]]
  const [month, day] = ends[parseInt(m[1])-1]
  return new Date(year, month, day, 23, 59, 59)
}
function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from); let added = 0
  while (added < days) { d.setDate(d.getDate()+1); if (d.getDay()!==0&&d.getDay()!==6) added++ }
  return d
}
function countWorkingDays(from: Date, to: Date): number {
  let count = 0; const d = new Date(from); d.setHours(0,0,0,0)
  const end = new Date(to); end.setHours(0,0,0,0)
  while (d <= end) { if (d.getDay()!==0&&d.getDay()!==6) count++; d.setDate(d.getDate()+1) }
  return count
}
function ragAvancement(actualPct: number, cursorPct: number | null): Rag {
  const delta = actualPct - (cursorPct ?? 50)
  return delta >= -10 ? 'green' : delta >= -20 ? 'amber' : 'red'
}
function ragBudget(realise: number, budget: number, cursorPct: number | null): Rag {
  if (budget === 0) return null
  const delta = (realise / budget * 100) - (cursorPct ?? 50)
  return delta <= 10 ? 'green' : delta <= 20 ? 'amber' : 'red'
}
function ragBlocages(bloque: number, risques: number): Rag {
  const t = bloque + risques
  return t === 0 ? 'green' : t <= 2 ? 'amber' : 'red'
}
function barColor(pct: number)  { return pct >= 75 ? 'bg-emerald-400' : pct >= 40 ? 'bg-amber-400' : 'bg-rose-400' }
function textColor(pct: number) { return pct >= 75 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-rose-600' }

// ── Composants ───────────────────────────────────────────────────
function RagCell({ label, rag, sub, tooltip }: { label: string; rag: Rag; sub?: string; tooltip?: string }) {
  const cfg = rag ? RAG_CFG[rag] : null
  return (
    <Tooltip content={tooltip}>
      <div className={cn(
        'flex flex-col rounded-xl border overflow-hidden min-w-[80px] cursor-help transition-colors',
        cfg ? cn(cfg.bg, cfg.border) : 'bg-slate-50 border-slate-200'
      )}>
        <div className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-1.5 text-center border-b',
          cfg ? cn(cfg.text, cfg.border) : 'text-slate-400 border-slate-200')}>
          {label}
        </div>
        <div className="flex items-center justify-center py-2.5">
          {cfg
            ? <span className={cfg.text}><RagIcon rag={rag} size={18} /></span>
            : <span className="text-slate-300 text-sm">—</span>}
        </div>
        {sub && (
          <div className={cn('text-[8px] text-center px-1 py-0.5 border-t leading-tight font-medium',
            cfg ? cn(cfg.text, cfg.border, 'opacity-70') : 'text-slate-400 border-slate-200')}>
            {sub}
          </div>
        )}
      </div>
    </Tooltip>
  )
}

function Section({ title, children, className, noPad, action, scrollable }: {
  title: string; children: ReactNode; className?: string; noPad?: boolean; action?: ReactNode; scrollable?: boolean
}) {
  return (
    <div className={cn('bg-card border border-white rounded-2xl overflow-hidden flex flex-col shadow-md', className)}>
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 shrink-0 flex items-center gap-2">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex-1">{title}</span>
        {action}
      </div>
      <div className={cn('flex-1 min-h-0', !noPad && 'p-3', scrollable && 'overflow-y-auto')}>
        {children}
      </div>
    </div>
  )
}

function MiniBar({ pct, color = 'bg-purple' }: { pct: number; color?: string }) {
  return (
    <div className="w-full h-1.5 rounded-full bg-border overflow-hidden">
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

function StatChip({ label, value, sub, color, bg, border }: { label: string; value: string | number; sub?: string; color?: string; bg?: string; border?: string }) {
  return (
    <div className={cn('rounded-xl px-2 py-2 text-center border', bg ?? 'bg-slate-50', border ?? 'border-slate-100')}>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">{label}</div>
      <div className={cn('text-sm font-bold tabular-nums mt-0.5', color ?? 'text-slate-600')}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  )
}

function AvancementStats({ total, fait, enCours, bloque, backlogPct, effortFait, effortTotal, effortPct, mustHaveFait, mustHaveTotal, mustHavePct, note }: {
  total: number; fait: number; enCours: number; bloque: number; backlogPct: number
  effortFait: number; effortTotal: number; effortPct: number
  mustHaveFait: number; mustHaveTotal: number; mustHavePct: number | null
  note?: string
}) {
  return (
    <>
      <div className="grid grid-cols-4 gap-2 mb-3">
        <StatChip label="Total US"  value={total} bg="bg-slate-50"   border="border-slate-100" color="text-slate-600" />
        <StatChip label="Terminées" value={fait}    sub={`${backlogPct} %`} bg="bg-emerald-50" border="border-emerald-100" color="text-emerald-700" />
        <StatChip label="En cours"  value={enCours} bg={enCours > 0 ? 'bg-amber-50'  : 'bg-slate-50'} border={enCours > 0 ? 'border-amber-100'  : 'border-slate-100'} color={enCours > 0 ? 'text-amber-700'  : 'text-slate-400'} />
        <StatChip label="Bloquées"  value={bloque}  bg={bloque > 0  ? 'bg-rose-50'   : 'bg-slate-50'} border={bloque > 0  ? 'border-rose-100'   : 'border-slate-100'} color={bloque > 0  ? 'text-rose-700'   : 'text-slate-400'} />
      </div>
      <div className="space-y-2">
        <div>
          <div className="flex justify-between text-[10px] text-subtle mb-0.5">
            <span>US terminées</span><span>{fait}/{total} · {backlogPct} %</span>
          </div>
          <MiniBar pct={backlogPct} color={barColor(backlogPct)} />
        </div>
        {effortTotal > 0 && (
          <div>
            <div className="flex justify-between text-[10px] text-subtle mb-0.5">
              <span>Effort consommé</span><span>{effortFait}j / {effortTotal}j · {effortPct} %</span>
            </div>
            <MiniBar pct={effortPct} color={barColor(effortPct)} />
          </div>
        )}
        {mustHaveTotal > 0 && mustHavePct !== null && (
          <div>
            <div className="flex justify-between text-[10px] text-subtle mb-0.5">
              <span>Must Have</span><span>{mustHaveFait}/{mustHaveTotal} · {mustHavePct} %</span>
            </div>
            <MiniBar pct={mustHavePct} color={barColor(mustHavePct)} />
          </div>
        )}
        {note && <p className="text-[10px] text-subtle/60 pt-1">{note}</p>}
      </div>
    </>
  )
}

function ToggleBtn({ active, onClick, children, expand }: { active: boolean; onClick: () => void; children: ReactNode; expand?: boolean }) {
  return (
    <button onClick={onClick} className={cn('px-2 py-1 text-[10px] font-semibold transition-colors text-center', expand && 'flex-1',
      active ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'text-slate-500 hover:text-slate-600 hover:bg-slate-50')}>
      {children}
    </button>
  )
}

// ── Composant principal ──────────────────────────────────────────
export function ProduitDashboardBody({ produit, customizable = true }: { produit: Produit; customizable?: boolean }) {
  const navigate = useNavigate()

  const [scopeView, setScopeView]             = useState<'global' | 'trim' | 'sprint'>('trim')
  const [selectedSprintNum, setSelectedSprintNum] = useState<string | null>(null)
  const [addingRisque, setAddingRisque]       = useState(false)
  const [newRisqueTitre, setNewRisqueTitre]   = useState('')
  const [addingAction, setAddingAction]       = useState(false)
  const [newActionTitre, setNewActionTitre]   = useState('')
  const [newActionAssigne, setNewActionAssigne] = useState('')
  const [newActionDate, setNewActionDate]     = useState('')
  const [editingActionId, setEditingActionId] = useState<string | null>(null)
  const [editValues, setEditValues]           = useState<{ titre: string; assigne_id: string; date: string; r1: string; r2: string }>({
    titre: '', assigne_id: '', date: '', r1: '', r2: '',
  })
  const [subtaskRowId, setSubtaskRowId]       = useState<string | null>(null)
  const [subtaskParentId, setSubtaskParentId] = useState('')

  const { data: sprintActif }     = useSprintActif()
  const { data: allSprints = [] } = useSprints()
  const { data: taches = [] }     = useTachesByProduit(produit.id)
  const { data: epicsList = [] }  = useEpicsByProduit(produit.id)
  const { data: jalonsList = [] } = useJalonsByProduit(produit.id)
  const epicColorsMap  = useMemo(() => new Map(epicsList.map(e => [epicFullName(e), e.couleur ?? '#6366F1'])), [epicsList])
  const jalonColorsMap = useMemo(() => new Map(jalonsList.map(j => [j.code, j.couleur ?? '#6366F1'])), [jalonsList])
  const { data: membres = [] }    = useUtilisateurs()
  const { data: equipes = [] }    = useEquipes()
  const { data: finConfig }       = useFinanceConfig()
  const { mutate: updateProduit } = useUpdateProduit()

  // ── Données de base ──────────────────────────────────────────
  const today   = new Date()
  const semaine = getISOWeek(today)
  const dateMAJ = today.toLocaleDateString('fr-FR')

  const trims       = produit.objectifs_trimestriels ?? []
  // Trimestre actif = lancé, pas en pause, pas clôturé
  const currentTrim = [...trims].reverse().find(t => !!t.lance && !t.pause && !t.cloture)
  const closedTrims = trims.filter(t => t.cloture)

  // ── Statistiques backlog (auto) ──────────────────────────────
  const racines = taches.filter(t => !t.parent_id)

  const totalUS    = racines.length
  const faitUS     = racines.filter(t => t.statut === 'Fait').length
  const enCoursUS  = racines.filter(t => t.statut === 'En cours').length
  const bloqueUS   = racines.filter(t => t.statut === 'Bloqué').length
  const backlogPct = totalUS > 0 ? Math.round(faitUS / totalUS * 100) : 0

  const effortTotal = racines.reduce((s, t) => s + (t.effort_j ?? 0), 0)
  const effortFait  = racines.filter(t => t.statut === 'Fait').reduce((s, t) => s + (t.effort_j ?? 0), 0)
  const effortPct   = effortTotal > 0 ? Math.round(effortFait / effortTotal * 100) : 0

  const mustHave     = racines.filter(t => t.moscow === 'Must Have')
  const mustHaveFait = mustHave.filter(t => t.statut === 'Fait').length
  const mustHavePct  = mustHave.length > 0 ? Math.round(mustHaveFait / mustHave.length * 100) : null

  // ── Statistiques trimestre ───────────────────────────────────
  const trimSprintSet   = new Set<string>(currentTrim?.sprints_ids ?? [])
  const trimSprintArr   = [...trimSprintSet].sort()
  const trimSprintLabel = trimSprintArr.length > 0 ? `${trimSprintArr[0]} → ${trimSprintArr[trimSprintArr.length-1]}` : ''

  const racinesTrim     = racines.filter(t => t.sprint && trimSprintSet.has(t.sprint))
  const totalUSTrim     = racinesTrim.length
  const faitUSTrim      = racinesTrim.filter(t => t.statut === 'Fait').length
  const enCoursTrim     = racinesTrim.filter(t => t.statut === 'En cours').length
  const bloqueTrim      = racinesTrim.filter(t => t.statut === 'Bloqué').length
  const backlogPctTrim  = totalUSTrim > 0 ? Math.round(faitUSTrim / totalUSTrim * 100) : 0

  const effortTotalTrim = racinesTrim.reduce((s, t) => s + (t.effort_j ?? 0), 0)
  const effortFaitTrim  = racinesTrim.filter(t => t.statut === 'Fait').reduce((s, t) => s + (t.effort_j ?? 0), 0)
  const effortPctTrim   = effortTotalTrim > 0 ? Math.round(effortFaitTrim / effortTotalTrim * 100) : 0

  const mustHaveTrim     = racinesTrim.filter(t => t.moscow === 'Must Have')
  const mustHaveFaitTrim = mustHaveTrim.filter(t => t.statut === 'Fait').length
  const mustHavePctTrim  = mustHaveTrim.length > 0 ? Math.round(mustHaveFaitTrim / mustHaveTrim.length * 100) : null

  // ── Statistiques sprint sélectionné ─────────────────────────
  const sortedSprints    = [...allSprints].sort((a, b) => String(a.numero).localeCompare(String(b.numero)))
  const effectiveSprint  = selectedSprintNum ?? sprintActif?.numero ?? sortedSprints[sortedSprints.length - 1]?.numero ?? null
  const racinesSprint    = racines.filter(t => t.sprint === effectiveSprint)
  const totalUSSprint    = racinesSprint.length
  const faitUSSprint     = racinesSprint.filter(t => t.statut === 'Fait').length
  const enCoursSprint    = racinesSprint.filter(t => t.statut === 'En cours').length
  const bloqueSprint     = racinesSprint.filter(t => t.statut === 'Bloqué').length
  const backlogPctSprint = totalUSSprint > 0 ? Math.round(faitUSSprint / totalUSSprint * 100) : 0

  const effortTotalSprint = racinesSprint.reduce((s, t) => s + (t.effort_j ?? 0), 0)
  const effortFaitSprint  = racinesSprint.filter(t => t.statut === 'Fait').reduce((s, t) => s + (t.effort_j ?? 0), 0)
  const effortPctSprint   = effortTotalSprint > 0 ? Math.round(effortFaitSprint / effortTotalSprint * 100) : 0

  const mustHaveSprint     = racinesSprint.filter(t => t.moscow === 'Must Have')
  const mustHaveFaitSprint = mustHaveSprint.filter(t => t.statut === 'Fait').length
  const mustHavePctSprint  = mustHaveSprint.length > 0 ? Math.round(mustHaveFaitSprint / mustHaveSprint.length * 100) : null

  // ── Tâches filtrées par scope (pour épics, jalons, équipes, points ouverts) ─
  const racinesScoped = scopeView === 'global' ? racines
    : scopeView === 'trim'   ? racinesTrim
    : racinesSprint

  // ── Épics ────────────────────────────────────────────────────
  const epicMap = new Map<string, { total: number; fait: number; effort: number }>()
  racinesScoped.filter(t => t.epic).forEach(t => {
    const key = t.epic!
    const cur = epicMap.get(key) ?? { total: 0, fait: 0, effort: 0 }
    epicMap.set(key, { total: cur.total+1, fait: cur.fait+(t.statut==='Fait'?1:0), effort: cur.effort+(t.effort_j??0) })
  })
  const epics = [...epicMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  // ── Jalons ───────────────────────────────────────────────────
  const jalonMap = new Map<string, { total: number; fait: number }>()
  racinesScoped.filter(t => t.jalon).forEach(t => {
    const key = t.jalon!
    const cur = jalonMap.get(key) ?? { total: 0, fait: 0 }
    jalonMap.set(key, { total: cur.total+1, fait: cur.fait+(t.statut==='Fait'?1:0) })
  })
  const jalons = [...jalonMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  // ── Équipes & membres ────────────────────────────────────────
  const assigneTrigrammes = [...new Set(racinesScoped.map(t => t.assigne_a).filter(Boolean))] as string[]
  const equipesMembres    = membres.filter(m => m.trigramme && assigneTrigrammes.includes(m.trigramme))
  const equipesNoms       = [...new Set(racinesScoped.map(t => t.equipe).filter(Boolean))] as string[]
  const equipesActives    = equipes.filter(e => e.actif && equipesNoms.includes(e.nom))

  // ── Points bloquants (scope-aware) ───────────────────────────
  const blockedTaches = racinesScoped.filter(t => t.statut === 'Bloqué')

  // ── Finance ──────────────────────────────────────────────────
  const equipeTjms   = finConfig?.equipe_tjms ?? []
  const tjmMoyen     = equipeTjms.length > 0
    ? Math.round(equipeTjms.reduce((s, e) => s + e.tjm, 0) / equipeTjms.length)
    : 500

  const joursParTrim  = finConfig?.jours_par_trim ?? 65
  const totalEtpEur   = trims.reduce((s, t) => s + trimEtpCostEur(t, finConfig, joursParTrim), 0)
  const totalInvest   = trims.reduce((s, t) => s + (t.budget_invest  ?? 0), 0)
  const totalAchats   = trims.reduce((s, t) => s + (t.budget_achats  ?? 0), 0)
  const realiseInvest = trims.reduce((s, t) => s + (t.realise_invest ?? 0), 0)
  const realiseAchats = trims.reduce((s, t) => s + (t.realise_achats ?? 0), 0)
  const realiseEtpJ   = effortFait
  const realiseEtpEur = realiseEtpJ * tjmMoyen

  const totalBudget   = totalEtpEur + totalInvest + totalAchats
  const totalOutcome  = trims.reduce((s, t) => s + (t.outcome_euros ?? 0), 0)
  const roi           = totalBudget > 0 ? Math.round((totalOutcome - totalBudget) / totalBudget * 100) : null

  const trimBudgetEtp    = currentTrim ? trimEtpCostEur(currentTrim, finConfig, joursParTrim) : 0
  const trimBudgetInvest = currentTrim?.budget_invest  ?? 0
  const trimBudgetAchats = currentTrim?.budget_achats  ?? 0
  const trimBudgetTotal  = trimBudgetEtp + trimBudgetInvest + trimBudgetAchats
  const trimRealiseInvest = currentTrim?.realise_invest ?? 0
  const trimRealiseAchats = currentTrim?.realise_achats ?? 0
  const trimRealiseEtpJ   = effortFaitTrim
  const trimRealiseEtpEur = trimRealiseEtpJ * tjmMoyen
  const trimRealiseTotal  = trimRealiseEtpEur + trimRealiseInvest + trimRealiseAchats

  // ── Risques ──────────────────────────────────────────────────
  const risques     = produit.risques ?? []
  const openRisques = risques.filter(r => !r.cloture)

  // ── Curseur temporel ─────────────────────────────────────────
  const joursTotaux  = finConfig?.jours_par_trim ?? 65
  const quarterStart = currentTrim ? getQuarterStart(currentTrim.trimestre) : null
  const quarterEndForBurndown = currentTrim ? getQuarterEnd(currentTrim.trimestre) : null
  const joursEcoules = quarterStart ? Math.min(countWorkingDays(quarterStart, new Date()), joursTotaux) : null
  const cursorPct    = joursEcoules !== null ? Math.round(joursEcoules / joursTotaux * 100) : null

  // ── Curseur global (1er trim lancé → date_lancement_cible) ──
  const firstTrimStartEarly = trims
    .filter(t => !!t.lance)
    .map(t => getQuarterStart(t.trimestre))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null

  const globalTargetDateEarly = produit.date_lancement_cible ? new Date(produit.date_lancement_cible) : null

  // ── Burndown (dates réelles de passage à "Fait" depuis le journal d'activité) ──
  // Adapté au sélecteur Global / Trimestre / Sprint (scopeView) déjà utilisé par le reste du dashboard.
  const effectiveSprintObj = sortedSprints.find(s => s.numero === effectiveSprint) ?? null
  const burndownStart = scopeView === 'global' ? firstTrimStartEarly
    : scopeView === 'sprint' ? (effectiveSprintObj?.started_at ? new Date(effectiveSprintObj.started_at) : null)
    : quarterStart
  const burndownEnd = scopeView === 'global' ? (globalTargetDateEarly ?? new Date())
    : scopeView === 'sprint' ? (effectiveSprintObj?.closed_at ? new Date(effectiveSprintObj.closed_at) : null)
    : quarterEndForBurndown
  const burndownObjectif = scopeView === 'global' ? totalUS : scopeView === 'sprint' ? totalUSSprint : totalUSTrim
  const burndownTasks    = scopeView === 'global' ? racines : scopeView === 'sprint' ? racinesSprint : racinesTrim

  // Fenêtre de requête assez large pour couvrir n'importe quel scope, sans refetch au changement de sélecteur.
  const burndownSinceCandidates = [quarterStart, firstTrimStartEarly, ...sortedSprints.map(s => s.started_at ? new Date(s.started_at) : null)]
    .filter((d): d is Date => d !== null)
  const burndownSince = burndownSinceCandidates.length
    ? new Date(Math.min(...burndownSinceCandidates.map(d => d.getTime())))
    : null

  const { data: faitTransitions = [] } = useFaitTransitions(produit.id, burndownSince ? burndownSince.toISOString() : null)
  const faitDoneMap = new Map<string, string>()
  faitTransitions.forEach(f => { if (!faitDoneMap.has(f.target)) faitDoneMap.set(f.target, f.created_at) })
  const burndownDoneDates = burndownTasks
    .filter(t => t.statut === 'Fait')
    .map(t => { const iso = faitDoneMap.get(t.id_tache); return iso ? new Date(iso) : (burndownStart ?? new Date()) })

  const globalCursorPctEarly = firstTrimStartEarly && globalTargetDateEarly && globalTargetDateEarly > firstTrimStartEarly
    ? Math.min(100, Math.max(0, Math.round(
        (today.getTime() - firstTrimStartEarly.getTime()) /
        (globalTargetDateEarly.getTime() - firstTrimStartEarly.getTime()) * 100
      )))
    : null

  // ── RAG ──────────────────────────────────────────────────────
  const delaiInfo     = ragDelai(produit.date_lancement_cible)
  const isGlobalScope = scopeView === 'global'
  const isSprintScope = scopeView === 'sprint'

  const ragA = isGlobalScope
    ? (totalUS > 0         ? ragAvancement(backlogPct,        globalCursorPctEarly)     : null)
    : isSprintScope
      ? (totalUSSprint > 0 ? ragAvancement(backlogPctSprint,  null)                     : null)
      : (totalUSTrim > 0   ? ragAvancement(backlogPctTrim,    cursorPct)                : null)

  // Sprint budget RAG : consommation effort vs avancement US (delta = %effort - %done)
  const ragB = isGlobalScope
    ? ((totalBudget - totalInvest - totalAchats) > 0
        ? ragBudget(realiseEtpEur, totalBudget - totalInvest - totalAchats, globalCursorPctEarly) : null)
    : isSprintScope
      ? (effortTotalSprint > 0
          ? ragBudget(effortFaitSprint, effortTotalSprint, backlogPctSprint) : null)
      : (trimBudgetEtp > 0
          ? ragBudget(trimRealiseEtpEur, trimBudgetEtp, cursorPct) : null)

  // Blocages selon le scope
  const bloqueScope = isGlobalScope ? bloqueUS
    : scopeView === 'trim'   ? bloqueTrim
    : bloqueSprint

  const ragBl = ragBlocages(bloqueScope, openRisques.length)

  const subAvancement = isGlobalScope
    ? (totalUS > 0 ? `${backlogPct}% fait · curseur ${globalCursorPctEarly ?? '?'}%` : undefined)
    : isSprintScope
      ? (totalUSSprint > 0 ? `${backlogPctSprint}% fait · ${faitUSSprint}/${totalUSSprint} US` : undefined)
      : (cursorPct !== null && totalUSTrim > 0
          ? `${backlogPctTrim}% fait · curseur ${cursorPct}%`
          : totalUSTrim > 0 ? `${backlogPctTrim}% fait` : undefined)

  const subBudget = isGlobalScope
    ? ((totalBudget - totalInvest - totalAchats) > 0
        ? `${Math.round(realiseEtpEur/1000)}k€ / ${Math.round((totalBudget-totalInvest-totalAchats)/1000)}k€` : undefined)
    : isSprintScope
      ? (effortTotalSprint > 0 ? `${effortFaitSprint}j / ${effortTotalSprint}j` : undefined)
      : (trimBudgetEtp > 0
          ? `${Math.round(trimRealiseEtpEur/1000)}k€ / ${Math.round(trimBudgetEtp/1000)}k€${cursorPct !== null ? ` · j${joursEcoules}/${joursTotaux}` : ''}` : undefined)

  // ── Délai — projection ───────────────────────────────────────
  let ragD: Rag = null
  let subDelai: string | undefined = undefined
  let estimatedDeliveryDate: Date | null = null
  let projectedPct: number | null = null

  const trimEnd = currentTrim?.trimestre ? getQuarterEnd(currentTrim.trimestre) : null

  const globalCursorPct  = globalCursorPctEarly
  const globalTargetDate = globalTargetDateEarly

  // Livraison estimée : date à laquelle backlogPctTrim atteint 100% (trim/global seulement)
  if (!isSprintScope && cursorPct !== null && cursorPct > 0 && totalUSTrim > 0 && backlogPctTrim > 0) {
    const pace        = backlogPctTrim / cursorPct
    const daysNeeded  = Math.round(((100 - backlogPctTrim) / pace) * joursTotaux / 100)
    estimatedDeliveryDate = addWorkingDays(today, daysNeeded)
  }

  const sprintObj       = sortedSprints.find(s => s.numero === effectiveSprint)
  const sprintIsCloture = sprintObj?.statut === 'cloture'

  if (isGlobalScope) {
    // Global : cible = date de lancement produit, curseur = globalCursorPct
    if (produit.date_lancement_cible) {
      const targetDate = globalTargetDate!
      if (targetDate < today) {
        ragD     = 'red'
        subDelai = `${delaiInfo.retardJours}j de retard`
      } else if (globalCursorPct !== null && globalCursorPct > 0 && totalUS > 0) {
        const pace = backlogPct / globalCursorPct
        projectedPct = Math.min(100, Math.round(backlogPct + pace * (100 - globalCursorPct)))
        ragD     = projectedPct >= 90 ? 'green' : projectedPct >= 70 ? 'amber' : 'red'
        subDelai = `proj. ${projectedPct}% · cible ${fmtDate(produit.date_lancement_cible)}`
      } else {
        ragD     = delaiInfo.rag
        subDelai = fmtDate(produit.date_lancement_cible)
      }
    }
  } else if (isSprintScope) {
    // Sprint : basé sur le taux de complétion (pas de date cible)
    if (totalUSSprint > 0) {
      if (sprintIsCloture) {
        ragD     = backlogPctSprint >= 100 ? 'green' : backlogPctSprint >= 80 ? 'amber' : 'red'
        subDelai = `Clôturé · ${backlogPctSprint}%`
      } else {
        ragD     = backlogPctSprint >= 75 ? 'green' : backlogPctSprint >= 40 ? 'amber' : 'red'
        subDelai = `${backlogPctSprint}% terminées`
      }
    }
  } else {
    // Trimestre : cible = fin du trimestre courant
    if (trimEnd && cursorPct !== null && cursorPct > 0 && totalUSTrim > 0) {
      const joursRestantsTrim = Math.max(0, joursTotaux - (joursEcoules ?? 0))
      const pace              = backlogPctTrim / cursorPct
      projectedPct = Math.min(100, Math.round(backlogPctTrim + pace * (joursRestantsTrim / joursTotaux * 100)))
      ragD     = projectedPct >= 90 ? 'green' : projectedPct >= 70 ? 'amber' : 'red'
      subDelai = `proj. ${projectedPct}% · fin ${fmtDate(trimEnd.toISOString())}`
    } else if (trimEnd && trimEnd < today) {
      ragD     = 'red'
      subDelai = `Trim. terminé`
    } else if (trimEnd) {
      ragD     = null
      subDelai = `Fin trim : ${fmtDate(trimEnd.toISOString())}`
    }
  }
  const subBlocages = `${bloqueScope} bloquée${bloqueScope !== 1 ? 's' : ''} · ${openRisques.length} risque${openRisques.length !== 1 ? 's' : ''}`

  // ── Tooltips ─────────────────────────────────────────────────
  const tipAvancement = isGlobalScope
    ? `${faitUS}/${totalUS} US réalisées\n${backlogPct}% fait · curseur ${globalCursorPct ?? '?'}%\nÉcart : ${backlogPct - (globalCursorPct ?? 50) >= 0 ? '+' : ''}${backlogPct - (globalCursorPct ?? 50)} pts`
    : isSprintScope
      ? (totalUSSprint > 0 ? `${faitUSSprint}/${totalUSSprint} US · ${enCoursSprint} en cours\n${backlogPctSprint}% terminées\n${bloqueSprint} bloquée${bloqueSprint !== 1 ? 's' : ''}` : undefined)
      : cursorPct !== null && totalUSTrim > 0
        ? `${faitUSTrim}/${totalUSTrim} US (trim)\n${backlogPctTrim}% fait · curseur ${cursorPct}%\nÉcart : ${backlogPctTrim - cursorPct >= 0 ? '+' : ''}${backlogPctTrim - cursorPct} pts`
        : totalUSTrim > 0 ? `${faitUSTrim}/${totalUSTrim} US (trim)\n${backlogPctTrim}% fait` : undefined

  const tipBudget = isGlobalScope
    ? ((totalBudget - totalInvest - totalAchats) > 0
        ? `ETP consommé : ${Math.round(realiseEtpEur / 1000)}k€\nBudget ETP : ${Math.round((totalBudget - totalInvest - totalAchats) / 1000)}k€\nÉcart vs réf. 50%`
        : undefined)
    : isSprintScope
      ? (effortTotalSprint > 0
          ? `Estimé : ${effortTotalSprint} j\nRéalisé : ${effortFaitSprint} j (${effortTotalSprint > 0 ? Math.round(effortFaitSprint / effortTotalSprint * 100) : 0}% effort)\nDelta vs avancement : ${Math.round(effortFaitSprint / effortTotalSprint * 100) - backlogPctSprint >= 0 ? '+' : ''}${Math.round(effortFaitSprint / effortTotalSprint * 100) - backlogPctSprint} pts`
          : undefined)
      : trimBudgetEtp > 0
        ? `ETP consommé : ${Math.round(trimRealiseEtpEur / 1000)}k€\nBudget trim : ${Math.round(trimBudgetEtp / 1000)}k€${cursorPct !== null ? `\nCurseur : ${cursorPct}% (j${joursEcoules}/${joursTotaux})` : ''}`
        : undefined

  // cibleDate/cibleLabel : null pour sprint (pas de livraison estimée)
  const cibleDate    = isGlobalScope ? produit.date_lancement_cible
    : isSprintScope ? null
    : trimEnd?.toISOString() ?? null
  const cibleLabel   = isGlobalScope ? 'Date lancement' : isSprintScope ? 'Sprint' : 'Fin trimestre'
  const joursRestants = cibleDate
    ? Math.floor((new Date(cibleDate).getTime() - Date.now()) / 86400000)
    : null

  const tipDelai = (() => {
    if (isSprintScope) {
      if (totalUSSprint === 0) return undefined
      const lines = [`${faitUSSprint}/${totalUSSprint} US · ${backlogPctSprint}% terminées`]
      if (enCoursSprint > 0) lines.push(`${enCoursSprint} en cours`)
      if (bloqueSprint > 0)  lines.push(`${bloqueSprint} bloquée${bloqueSprint !== 1 ? 's' : ''}`)
      if (sprintIsCloture)   lines.push('Sprint clôturé')
      return lines.join('\n')
    }
    if (projectedPct !== null && estimatedDeliveryDate && cibleDate) {
      return `Projection : ${projectedPct}% à ${cibleLabel.toLowerCase()}\n${cibleLabel} : ${fmtDate(cibleDate)}\nLivraison est. : ${fmtDate(estimatedDeliveryDate.toISOString())}`
    }
    if (!isGlobalScope && trimEnd) {
      const lines = [`${cibleLabel} : ${fmtDate(trimEnd.toISOString())}`]
      if (joursRestants !== null && joursRestants > 0) lines.push(`Échéance dans ${joursRestants} j`)
      if (!totalUSTrim) lines.push('(aucune tâche dans les sprints du trim)')
      else if (!cursorPct) lines.push('(curseur trim non calculable)')
      return lines.join('\n')
    }
    if (isGlobalScope && produit.date_lancement_cible) {
      if (delaiInfo.retardJours > 0) return `Retard de ${delaiInfo.retardJours} jours\nDate lancement : ${fmtDate(produit.date_lancement_cible)}`
      const lines = [`Date lancement : ${fmtDate(produit.date_lancement_cible)}`]
      if (joursRestants !== null && joursRestants > 0) lines.push(`Échéance dans ${joursRestants} j`)
      return lines.join('\n')
    }
    return undefined
  })()

  const tipLivraison = (() => {
    // Sprint : pas de livraison estimée
    if (isSprintScope) return undefined
    if (estimatedDeliveryDate && projectedPct !== null && cibleDate) {
      return `Projection : ${projectedPct}% à ${cibleLabel.toLowerCase()}\nVélocité : ${backlogPctTrim}% réalisé · curseur ${cursorPct}%\n(j${joursEcoules}/${joursTotaux})\n${cibleLabel} : ${fmtDate(cibleDate)}`
    }
    if (estimatedDeliveryDate) {
      return `Basé sur ${backlogPctTrim}% réalisé · curseur ${cursorPct}%\n(j${joursEcoules}/${joursTotaux})`
    }
    if (cibleDate) {
      const lines = [`${cibleLabel} : ${fmtDate(cibleDate)}`]
      if (joursRestants !== null && joursRestants > 0) lines.push(`Échéance dans ${joursRestants} j`)
      if (totalUS > 0) lines.push(`Avancement global : ${backlogPct}% (${faitUS}/${totalUS} US)`)
      if (!totalUSTrim) lines.push('(aucune tâche dans les sprints du trim)')
      else if (!cursorPct) lines.push('(curseur trim non calculable)')
      return lines.join('\n')
    }
    return undefined
  })()

  const tipBlocages = `${bloqueScope} tâche${bloqueScope !== 1 ? 's' : ''} bloquée${bloqueScope !== 1 ? 's' : ''}\n${openRisques.length} risque${openRisques.length !== 1 ? 's' : ''} ouvert${openRisques.length !== 1 ? 's' : ''}`
    + (bloqueUS > bloqueScope ? `\n(${bloqueUS} bloquées au total sur le produit)` : '')

  // ── Handlers ─────────────────────────────────────────────────
  const actionsLop    = produit.actions_lop ?? []
  const openActions   = actionsLop.filter(a => !a.cloture)


  const resolveNom = (userId: string) => {
    const m = membres.find(x => x.user_id === userId)
    return m ? ([m.prenom, m.nom].filter(Boolean).join(' ') || m.trigramme || '') : null
  }

  const addRisque = () => {
    if (!newRisqueTitre.trim()) return
    const r: RisqueItem = { id: crypto.randomUUID(), titre: newRisqueTitre.trim(), created_at: new Date().toISOString(), cloture: false }
    updateProduit({ id: produit.id, updates: { risques: [...risques, r] } })
    setNewRisqueTitre(''); setAddingRisque(false)
  }
  const cloturerRisque = (id: string) => {
    updateProduit({ id: produit.id, updates: { risques: risques.map(r => r.id === id ? { ...r, cloture: true } : r) } })
  }
  const addAction = () => {
    if (!newActionTitre.trim()) return
    const a: ActionLop = {
      id: crypto.randomUUID(), titre: newActionTitre.trim(), created_at: new Date().toISOString(),
      date_cloture_estimee: newActionDate || null, report_1: null, report_2: null,
      assigne_id: newActionAssigne || null, assigne_nom: resolveNom(newActionAssigne),
      cloture: false, cloture_at: null,
    }
    updateProduit({ id: produit.id, updates: { actions_lop: [...actionsLop, a] } })
    setNewActionTitre(''); setNewActionAssigne(''); setNewActionDate(''); setAddingAction(false)
  }
  const cloturerAction = (id: string) => {
    updateProduit({ id: produit.id, updates: { actions_lop: actionsLop.map(a => a.id === id ? { ...a, cloture: true, cloture_at: new Date().toISOString() } : a) } })
  }
  const startEdit = (a: ActionLop) => {
    setEditingActionId(a.id)
    setEditValues({ titre: a.titre, assigne_id: a.assigne_id ?? '', date: a.date_cloture_estimee ?? '', r1: a.report_1 ?? '', r2: a.report_2 ?? '' })
  }
  const saveEdit = () => {
    if (!editingActionId) return
    updateProduit({
      id: produit.id,
      updates: { actions_lop: actionsLop.map(a => a.id === editingActionId ? { ...a,
        titre:                editValues.titre.trim() || a.titre,
        assigne_id:           editValues.assigne_id || null,
        assigne_nom:          resolveNom(editValues.assigne_id),
        date_cloture_estimee: editValues.date || null,
        report_1:             editValues.r1 || null,
        report_2:             editValues.r2 || null,
      } : a) }
    })
    setEditingActionId(null)
  }
  const dateColor = (iso: string | null): string => {
    if (!iso) return 'text-slate-400'
    const diff = (new Date(iso).getTime() - Date.now()) / 86_400_000
    if (diff < 0) return 'text-rose-600 font-semibold'
    if (diff < 7) return 'text-amber-600 font-semibold'
    return 'text-slate-600'
  }

  // ── JSX ──────────────────────────────────────────────────────
  return (
    <>
      {/* Toggle scope — au-dessus du bandeau car contrôle les données */}
      <div className="flex justify-end mb-2">
        <div className="flex rounded-lg border border-border overflow-hidden bg-card shadow-sm w-[260px]">
          <ToggleBtn expand active={scopeView === 'global'} onClick={() => setScopeView('global')}>Global</ToggleBtn>
          <div className="w-px bg-border shrink-0" />
          <ToggleBtn expand active={scopeView === 'trim'} onClick={() => setScopeView('trim')}>
            {currentTrim?.trimestre ?? 'Trimestre'}
          </ToggleBtn>
          <div className="w-px bg-border shrink-0" />
          <ToggleBtn expand active={scopeView === 'sprint'} onClick={() => setScopeView('sprint')}>Sprint</ToggleBtn>
        </div>
      </div>

      {/* Bandeau en-tête */}
      <div className="bg-card border border-white rounded-2xl mb-4 overflow-hidden shadow-md">
        <div className="grid grid-cols-[1fr_auto_auto]">
          <div className="flex items-center gap-6 px-5 py-3 border-r border-border flex-wrap">
            <div>
              <div className="text-[10px] text-subtle uppercase font-bold tracking-wider mb-0.5">Date MAJ</div>
              <div className="text-sm font-bold text-navy">{dateMAJ}</div>
            </div>
            <div>
              <div className="text-[10px] text-subtle uppercase font-bold tracking-wider mb-0.5">Semaine</div>
              <div className="text-sm font-bold text-navy">{semaine}</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: produit.couleur ?? '#4A4CC8' }} />
              <div>
                <div className="text-[10px] text-subtle uppercase font-bold tracking-wider mb-0.5">Produit</div>
                <div className="text-sm font-bold text-navy">{produit.nom}</div>
              </div>
            </div>
            {produit.priorite_strategique && (
              <div>
                <div className="text-[10px] text-subtle uppercase font-bold tracking-wider mb-0.5">Priorité</div>
                <div className="text-sm font-bold text-navy">{'★'.repeat(produit.priorite_strategique)} P{produit.priorite_strategique}</div>
              </div>
            )}
            {totalUS > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <div className="text-[10px] text-subtle uppercase font-bold tracking-wider">Backlog</div>
                <div className="w-24 h-1.5 rounded-full bg-border overflow-hidden">
                  <div className={cn('h-full rounded-full', barColor(backlogPct))} style={{ width: `${backlogPct}%` }} />
                </div>
                <div className="text-xs font-bold text-navy tabular-nums">{backlogPct} %</div>
                <div className="text-[11px] text-subtle">{faitUS}/{totalUS} US</div>
              </div>
            )}
          </div>

          {/* RAG */}
          <div className="flex items-center gap-2 px-5 py-3 border-r border-border">
            <RagCell label="Avancement" rag={ragA}  sub={subAvancement} tooltip={tipAvancement} />
            <RagCell label="Budget"     rag={ragB}  sub={subBudget}     tooltip={tipBudget} />
            <RagCell label="Délai"      rag={ragD}  sub={subDelai}      tooltip={tipDelai} />
            <RagCell label="Blocages"   rag={ragBl} sub={subBlocages}   tooltip={tipBlocages} />
          </div>

          {/* Trajectoire + Livraison */}
          <div className="flex items-center divide-x divide-border">
            <Tooltip content={tipDelai}>
              <div className="flex flex-col items-center gap-1.5 px-5 py-3 min-w-[120px] cursor-help">
                <div className="text-[10px] text-subtle uppercase font-bold tracking-wider">Trajectoire</div>
                {ragD && TRAJ_CFG[ragD] ? (
                  <div className={cn('text-xs font-bold px-3 py-1 rounded-xl border whitespace-nowrap', TRAJ_CFG[ragD].bg, TRAJ_CFG[ragD].text,
                    ragD === 'green' ? 'border-emerald-200' : ragD === 'amber' ? 'border-amber-200' : 'border-rose-200')}>
                    {TRAJ_CFG[ragD].label}
                  </div>
                ) : (
                  <div className="text-xs font-bold px-3 py-1 rounded-xl bg-slate-50 text-slate-400 border border-slate-100">—</div>
                )}
              </div>
            </Tooltip>
            <Tooltip content={tipLivraison}>
              <div className="flex flex-col items-center gap-1.5 px-5 py-3 min-w-[80px] cursor-help">
                <div className="text-[10px] text-subtle uppercase font-bold tracking-wider">Livraison est.</div>
                <div className={cn('text-sm font-black tabular-nums',
                  ragD === 'green' ? 'text-emerald-600' : ragD === 'amber' ? 'text-amber-600' : ragD === 'red' ? 'text-rose-600' : 'text-slate-400')}>
                  {estimatedDeliveryDate
                    ? fmtDate(estimatedDeliveryDate.toISOString())
                    : cibleDate ? fmtDate(cibleDate) : '—'}
                </div>
              </div>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Grille bento : les mêmes blocs qu'avant, désormais personnalisables */}
      <BentoGrid
        contexte="produit"
        editable={customizable}
        defaultLayout={PRODUIT_LAYOUT}
        items={[
          { key: 'produit', label: 'Produit', minW: 2, minH: 2, defaultSize: { w: 2, h: 3 }, content: (
<Section title="Produit" className="h-full">
            {produit.vision
              ? <p className="text-xs text-navy/80 leading-relaxed">{produit.vision}</p>
              : <p className="text-xs text-subtle/40 italic">Vision non définie</p>}
            {produit.niveau_risque && (
              <div className="mt-2 flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-subtle uppercase">Risque</span>
                <span className={cn('text-[11px] px-1.5 py-0.5 rounded-full font-semibold border',
                  produit.niveau_risque === 'Faible'   && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                  produit.niveau_risque === 'Moyen'    && 'bg-amber-50 text-amber-700 border-amber-200',
                  produit.niveau_risque === 'Élevé'    && 'bg-orange-50 text-orange-700 border-orange-200',
                  produit.niveau_risque === 'Critique' && 'bg-rose-50 text-rose-700 border-rose-200',
                )}>
                  {produit.niveau_risque}
                </span>
              </div>
            )}
            {produit.date_lancement_cible && (
              <div className="mt-2 pt-2 border-t border-border flex justify-between items-center">
                <span className="text-[11px] text-subtle">Lancement cible</span>
                <span className={cn('text-[11px] font-bold', delaiInfo.onTime ? 'text-slate-600' : 'text-rose-600')}>
                  {fmtDate(produit.date_lancement_cible)}
                </span>
              </div>
            )}
          </Section>
          ) },
          { key: 'equipes', label: 'Équipes', minW: 2, minH: 2, defaultSize: { w: 2, h: 3 }, content: (
<Section title={`Équipes (${equipesMembres.length})`} className="h-full" scrollable>
            {equipesMembres.length === 0 && equipesNoms.length === 0
              ? <p className="text-xs text-subtle/40 italic">Aucune équipe assignée</p>
              : (
                <div className="space-y-2">
                  {equipesActives.map(eq => (
                    <div key={eq.id} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: eq.couleur ?? '#4A4CC8' }} />
                      <span className="text-xs font-medium text-navy">{eq.nom}</span>
                    </div>
                  ))}
                  {equipesNoms.filter(n => !equipesActives.some(e => e.nom === n)).map(n => (
                    <div key={n} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-subtle/40 shrink-0" />
                      <span className="text-xs text-subtle">{n}</span>
                    </div>
                  ))}
                  {equipesMembres.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {equipesMembres.slice(0, 10).map(m => (
                        <div key={m.user_id} title={[m.prenom, m.nom].filter(Boolean).join(' ') || m.display_name || m.trigramme || ''}
                          className="w-6 h-6 rounded-full overflow-hidden shrink-0 border border-white">
                          {m.avatar_url
                            ? <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-white text-[10px] font-bold"
                                style={{ background: m.couleur ?? '#4A4CC8' }}>{m.trigramme ?? '?'}</div>}
                        </div>
                      ))}
                      {equipesMembres.length > 10 && (
                        <div className="w-6 h-6 rounded-full bg-subtle/20 flex items-center justify-center text-[10px] text-subtle font-bold">
                          +{equipesMembres.length - 10}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
          </Section>
          ) },
          { key: 'jalons', label: 'Jalons', minW: 2, minH: 2, defaultSize: { w: 2, h: 3 }, content: (
<Section title={`Jalons - Incréments majeurs (${jalons.length})`} className="h-full" scrollable>
            {jalons.length === 0
              ? <p className="text-xs text-subtle/40 italic">Aucun jalon - incrément majeur dans les tâches</p>
              : <div className="space-y-2">
                  {jalons.map(([j, stats]) => {
                    const pct = stats.total > 0 ? Math.round(stats.fait / stats.total * 100) : 0
                    return (
                      <div key={j}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[11px] font-medium text-navy truncate flex-1">{j}</span>
                          <span className="text-[10px] text-subtle ml-1 shrink-0">{stats.fait}/{stats.total}</span>
                        </div>
                        <MiniBar pct={pct} color={barColor(pct)} />
                      </div>
                    )
                  })}
                </div>}
          </Section>
          ) },
          { key: 'avancement', label: 'Avancement', minW: 4, minH: 3, defaultSize: { w: 7, h: 4 }, content: (
<Section className="h-full"
            title={scopeView === 'global' ? 'Avancement global' : scopeView === 'trim' ? `Objectifs — ${currentTrim?.trimestre || 'Trimestre en cours'}` : 'Sprint'}>
            {scopeView === 'global' ? (
              totalUS === 0
                ? <p className="text-xs text-subtle/40 italic">Aucune tâche dans le backlog</p>
                : <AvancementStats total={totalUS} fait={faitUS} enCours={enCoursUS} bloque={bloqueUS}
                    backlogPct={backlogPct} effortFait={effortFait} effortTotal={effortTotal}
                    effortPct={effortPct} mustHaveFait={mustHaveFait} mustHaveTotal={mustHave.length} mustHavePct={mustHavePct} />
            ) : scopeView === 'trim' ? (
              totalUSTrim === 0
                ? <p className="text-xs text-subtle/40 italic">Aucune tâche assignée à ces sprints{trimSprintLabel ? ` (${trimSprintLabel})` : ''}</p>
                : <AvancementStats total={totalUSTrim} fait={faitUSTrim} enCours={enCoursTrim} bloque={bloqueTrim}
                    backlogPct={backlogPctTrim} effortFait={effortFaitTrim} effortTotal={effortTotalTrim}
                    effortPct={effortPctTrim} mustHaveFait={mustHaveFaitTrim} mustHaveTotal={mustHaveTrim.length}
                    mustHavePct={mustHavePctTrim} note={trimSprintLabel ? `Sprints : ${trimSprintLabel}` : undefined} />
            ) : (
              <>
                <div className="flex flex-wrap gap-1 mb-3 pb-2 border-b border-border">
                  {sortedSprints.map(s => {
                    const isActive   = s.numero === sprintActif?.numero
                    const isSelected = s.numero === effectiveSprint
                    return (
                      <button key={s.numero} onClick={() => setSelectedSprintNum(s.numero)}
                        className={cn('text-[10px] px-1.5 py-0.5 rounded font-semibold transition-colors',
                          isSelected ? 'bg-brand text-white'
                          : isActive  ? 'bg-purple/20 text-purple border border-purple/30'
                          : 'bg-bg text-subtle hover:text-navy hover:bg-brand/5')}>
                        {s.numero}{isActive ? ' ●' : ''}
                      </button>
                    )
                  })}
                </div>
                {totalUSSprint === 0
                  ? <p className="text-xs text-subtle/40 italic">Aucune tâche dans ce sprint</p>
                  : <AvancementStats total={totalUSSprint} fait={faitUSSprint} enCours={enCoursSprint} bloque={bloqueSprint}
                      backlogPct={backlogPctSprint} effortFait={effortFaitSprint} effortTotal={effortTotalSprint}
                      effortPct={effortPctSprint} mustHaveFait={mustHaveFaitSprint} mustHaveTotal={mustHaveSprint.length}
                      mustHavePct={mustHavePctSprint} />}
              </>
            )}
          </Section>
          ) },
          { key: 'epics', label: 'Épics', minW: 2, minH: 3, defaultSize: { w: 3, h: 5 }, content: (
<Section title={`Épics — ${epics.length}`} noPad scrollable className="h-full">
{epics.length === 0 ? <p className="p-3 text-xs text-subtle/40 italic">Aucun épic dans les tâches</p> : (<>
                  <div className="divide-y divide-border">
                    {epics.map(([epicName, stats]) => {
                      const pct   = stats.total > 0 ? Math.round(stats.fait / stats.total * 100) : 0
                      const color = epicColorsMap.get(epicName) ?? '#4A4CC8'
                      return (
                        <div key={epicName} className="flex items-center gap-2 px-3 py-2 hover:bg-bg/50 transition-colors">
                          <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: color }} />
                          <span className="text-[11px] font-semibold text-navy truncate flex-1">{epicName}</span>
                          <div className="w-16 shrink-0"><MiniBar pct={pct} color="bg-purple/60" /></div>
                          <span className="text-[10px] tabular-nums text-subtle shrink-0 w-10 text-right">{stats.fait}/{stats.total}</span>
                          <span className={cn('text-[11px] font-bold tabular-nums shrink-0 w-7 text-right', textColor(pct))}>{pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                </>)}
</Section>
          ) },
          { key: 'points', label: 'Points ouverts', minW: 3, minH: 3, defaultSize: { w: 4, h: 5 }, content: (
<Section title={`Points ouverts — ${blockedTaches.length} bloquée${blockedTaches.length !== 1 ? 's' : ''}`} noPad scrollable className="h-full">
                {blockedTaches.length === 0
                  ? <div className="p-3"><p className="text-xs text-emerald-600 font-medium flex items-center gap-1.5"><Check size={12} /> Aucun point bloquant</p></div>
                  : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-left">
                          {['ID', 'Titre', 'Épic', 'Sprint', 'Équipe', 'Assigné'].map(h => (
                            <th key={h} className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {blockedTaches.map((t, i) => (
                          <tr key={t.id_tache} className={cn('border-b border-slate-50', i % 2 === 0 ? 'bg-card' : 'bg-rose-50/30')}>
                            <td className="px-3 py-2 font-mono font-bold text-rose-600">{t.id_tache}</td>
                            <td className="px-3 py-2 text-slate-600 font-medium max-w-[180px]">
                              <div className="flex items-center gap-1.5">
                                <AlertTriangle size={10} className="text-rose-500 shrink-0" />
                                <span className="line-clamp-1">{t.titre}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-subtle">{t.epic || '—'}</td>
                            <td className="px-3 py-2 text-subtle">{t.sprint || '—'}</td>
                            <td className="px-3 py-2 text-subtle">{t.equipe || '—'}</td>
                            <td className="px-3 py-2 text-subtle">{t.assigne_a || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
              </Section>
          ) },
          { key: 'effort', label: 'Budget / Effort', minW: 2, minH: 2, defaultSize: { w: 3, h: 3 }, content: (
(() => {
            // Vue sprint : jours estimés vs réalisés
            if (isSprintScope) {
              const effortRestant = Math.max(0, effortTotalSprint - effortFaitSprint)
              const effortPctSp   = effortTotalSprint > 0 ? Math.round(effortFaitSprint / effortTotalSprint * 100) : 0
              const delta         = effortPctSp - backlogPctSprint
              return (
                <Section title={`Effort — ${effectiveSprint ?? '?'}`} noPad className="h-full">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <td className="px-3 py-1.5 text-[10px] font-bold text-subtle uppercase w-20" />
                        <td className="px-3 py-1.5 text-[10px] font-bold text-subtle uppercase text-right">Estimé</td>
                        <td className="px-3 py-1.5 text-[10px] font-bold text-subtle uppercase text-right">Réalisé</td>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border/50">
                        <td className="px-3 py-1.5 font-medium text-navy">Jours</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-navy">{effortTotalSprint > 0 ? `${effortTotalSprint} j` : '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {effortFaitSprint > 0
                            ? <div><div className="text-navy font-semibold">{effortFaitSprint} j</div><div className="text-[10px] text-subtle">{effortPctSp}% effort</div></div>
                            : '—'}
                        </td>
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="px-3 py-1.5 font-medium text-navy">Restant</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-slate-600" colSpan={2}>{effortRestant > 0 ? `${effortRestant} j` : <span className="text-emerald-600 font-semibold">Terminé</span>}</td>
                      </tr>
                      <tr className="bg-slate-50">
                        <td className="px-3 py-2 font-bold text-slate-600">Delta effort</td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums" colSpan={2}>
                          {effortTotalSprint > 0
                            ? <span className={cn(delta <= 10 ? 'text-emerald-600' : delta <= 20 ? 'text-amber-600' : 'text-rose-600')}>
                                {delta >= 0 ? '+' : ''}{delta} pts
                              </span>
                            : '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="px-3 pb-3 pt-1">
                    <div className="flex justify-between text-[10px] text-subtle mb-1">
                      <span>US terminées</span><span>{faitUSSprint}/{totalUSSprint} · {backlogPctSprint}%</span>
                    </div>
                    <MiniBar pct={backlogPctSprint} color={barColor(backlogPctSprint)} />
                  </div>
                </Section>
              )
            }

            const isGlobal  = scopeView === 'global'
            const bEtp      = isGlobal ? totalBudget - totalInvest - totalAchats : trimBudgetEtp
            const bInvest   = isGlobal ? totalInvest    : trimBudgetInvest
            const bAchats   = isGlobal ? totalAchats    : trimBudgetAchats
            const bTotal    = isGlobal ? totalBudget    : trimBudgetTotal
            const rEtpEur   = isGlobal ? realiseEtpEur  : trimRealiseEtpEur
            const rEtpJ     = isGlobal ? realiseEtpJ    : trimRealiseEtpJ
            const rInvest   = isGlobal ? realiseInvest  : trimRealiseInvest
            const rAchats   = isGlobal ? realiseAchats  : trimRealiseAchats
            const rTotal    = isGlobal ? realiseEtpEur + realiseInvest + realiseAchats : trimRealiseTotal
            return (
              <Section title="Budget" noPad className="h-full">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <td className="px-3 py-1.5 text-[10px] font-bold text-subtle uppercase w-14" />
                      <td className="px-3 py-1.5 text-[10px] font-bold text-subtle uppercase text-right">Budget</td>
                      <td className="px-3 py-1.5 text-[10px] font-bold text-subtle uppercase text-right">Réel</td>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/50">
                      <td className="px-3 py-1.5 font-medium text-navy">ETP</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-navy">{bEtp > 0 ? fmt(bEtp) : '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {rEtpJ > 0 ? <div><div className="text-navy font-semibold">{fmt(rEtpEur)}</div><div className="text-[10px] text-subtle">{rEtpJ} j · {tjmMoyen}€/j</div></div> : '—'}
                      </td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="px-3 py-1.5 font-medium text-navy">Achats</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-navy">{bAchats > 0 ? fmt(bAchats) : '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-navy">{rAchats > 0 ? fmt(rAchats) : '—'}</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="px-3 py-1.5 font-medium text-navy">Invest.</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-navy">{bInvest > 0 ? fmt(bInvest) : '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-navy">{rInvest > 0 ? fmt(rInvest) : '—'}</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="px-3 py-2 font-bold text-slate-600">Total</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-600 tabular-nums">{bTotal > 0 ? fmt(bTotal) : '—'}</td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums">
                        {rTotal > 0 ? <span className={cn(rTotal <= bTotal ? 'text-emerald-600' : 'text-rose-600')}>{fmt(rTotal)}</span> : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Section>
            )
          })()
          ) },
          { key: 'finance', label: 'Finance', minW: 2, minH: 2, defaultSize: { w: 3, h: 3 }, content: (
<Section title="Finance" noPad className="h-full">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border"><td className="px-3 py-1.5 text-[10px] font-bold text-subtle uppercase" /><td className="px-3 py-1.5 text-[10px] font-bold text-subtle uppercase text-right">Estimé</td></tr></thead>
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="px-3 py-1.5 font-medium text-navy">Outcome</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600 font-semibold">{totalOutcome > 0 ? fmt(totalOutcome) : '—'}</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="px-3 py-1.5 font-medium text-navy">Budget</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-navy">{totalBudget > 0 ? fmt(totalBudget) : '—'}</td>
                </tr>
                <tr className="bg-slate-50">
                  <td className="px-3 py-2 font-bold text-slate-600">ROI estimé</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">
                    {roi !== null ? <span className={cn(roi >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{roi >= 0 ? '+' : ''}{roi} %</span> : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>
          ) },
          { key: 'risques', label: 'Risques', minW: 2, minH: 2, defaultSize: { w: 3, h: 3 }, content: (
<Section className="h-full" scrollable noPad
            title={`Risques — ${openRisques.length} ouvert${openRisques.length !== 1 ? 's' : ''}`}
            action={
              <button onClick={() => { setAddingRisque(true); setNewRisqueTitre('') }}
                className="flex items-center gap-1 text-[10px] text-subtle hover:text-navy transition-colors">
                <Plus size={10} /> Ajouter
              </button>
            }>
            {addingRisque && (
              <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50">
                <input autoFocus value={newRisqueTitre} onChange={e => setNewRisqueTitre(e.target.value)}
                  onKeyDown={e => { if (e.key==='Enter') addRisque(); if (e.key==='Escape') setAddingRisque(false) }}
                  placeholder="Décrire le risque…"
                  className="flex-1 text-xs bg-transparent outline-none text-slate-600 placeholder:text-slate-400" />
                <button onClick={addRisque} className="text-emerald-600 hover:opacity-70"><Check size={12} /></button>
                <button onClick={() => setAddingRisque(false)} className="text-subtle hover:text-rose-500"><X size={12} /></button>
              </div>
            )}
            {openRisques.length === 0 && !addingRisque
              ? <div className="p-3"><p className="text-xs text-emerald-600 font-medium flex items-center gap-1.5"><Check size={12} /> Aucun risque identifié</p></div>
              : <div className="divide-y divide-slate-100">
                  {openRisques.map(r => (
                    <div key={r.id} className="flex items-start gap-2 px-3 py-2 hover:bg-amber-50/40 transition-colors group">
                      <AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5" />
                      <span className="flex-1 text-xs text-slate-600 leading-snug">{r.titre}</span>
                      <button onClick={() => cloturerRisque(r.id)} title="Clôturer"
                        className="text-[10px] text-slate-400 hover:text-emerald-600 max-md:opacity-100 opacity-0 group-hover:opacity-100 transition-all shrink-0 font-medium">
                        Clôturer
                      </button>
                    </div>
                  ))}
                </div>}
          </Section>
          ) },
          { key: 'histo', label: 'Historique trims', minW: 2, minH: 2, defaultSize: { w: 3, h: 2 }, content: (
<Section title="Historique trims" className="h-full" scrollable>
{closedTrims.length === 0 ? <p className="text-xs text-subtle/40 italic">Aucun trimestre clôturé</p> : <div className="flex flex-wrap gap-1">
{closedTrims.map(t => (
                  <span key={t.id} className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium flex items-center gap-1">
                    <Lock size={8} /> {t.trimestre || 'Trim.'}
                  </span>
                ))}
</div>}
</Section>
          ) },
          { key: 'chart_burndown', label: 'Burndown', minW: 4, minH: 3, defaultSize: { w: 12, h: 5 }, content: (
            <ChartWidget title={`Burndown — ${
              scopeView === 'global' ? 'Global' : scopeView === 'sprint' ? (effectiveSprint ?? 'Sprint') : (currentTrim?.trimestre ?? 'Trimestre en cours')
            }`}>
              <LazyBurndownChart quarterStart={burndownStart} quarterEnd={burndownEnd} objectif={burndownObjectif}
                doneDates={burndownDoneDates}
                trimLabel={scopeView === 'global' ? 'Global' : scopeView === 'sprint' ? effectiveSprint : (currentTrim?.trimestre ?? null)} />
            </ChartWidget>
          ) },
          { key: 'lop', label: 'LOP', minW: 5, minH: 3, defaultSize: { w: 12, h: 4 }, content: (
<Section className="h-full" scrollable
          title={`LOP — ${openActions.length} action${openActions.length !== 1 ? 's' : ''} ouverte${openActions.length !== 1 ? 's' : ''}`}
          noPad
          action={
            <button onClick={() => { setAddingAction(true); setNewActionTitre(''); setNewActionAssigne(''); setNewActionDate('') }}
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition-colors">
              <Plus size={10} /> Ajouter
            </button>
          }>
          {addingAction && (
            <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 space-y-2">
              <textarea autoFocus rows={3} value={newActionTitre} onChange={e => setNewActionTitre(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setAddingAction(false) }}
                placeholder="Décrire l'action… (Entrée pour sauter une ligne)"
                className="w-full text-xs bg-card border border-border rounded px-2 py-1.5 outline-none text-navy placeholder:text-subtle/50 focus:border-purple/50 resize-none leading-relaxed" />
              <div className="flex items-center gap-2 flex-wrap">
                <select value={newActionAssigne} onChange={e => setNewActionAssigne(e.target.value)}
                  className="text-xs bg-card border border-border rounded px-2 py-1 outline-none text-navy focus:border-purple/50">
                  <option value="">— Assigné —</option>
                  {membres.map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {[m.prenom, m.nom].filter(Boolean).join(' ') || m.trigramme || m.display_name || m.user_id}
                    </option>
                  ))}
                </select>
                <input type="date" value={newActionDate} onChange={e => setNewActionDate(e.target.value)}
                  className="text-xs bg-card border border-border rounded px-2 py-1 outline-none text-navy focus:border-purple/50" />
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={addAction} className="flex items-center gap-1 text-[10px] font-semibold text-white bg-emerald-500 px-2 py-1 rounded hover:opacity-80">
                    <Check size={10} /> Ajouter
                  </button>
                  <button onClick={() => setAddingAction(false)} className="text-subtle hover:text-rose-500"><X size={13} /></button>
                </div>
              </div>
            </div>
          )}

          {openActions.length === 0 && !addingAction
            ? <div className="p-3"><p className="text-xs text-emerald-600 font-medium flex items-center gap-1.5"><Check size={12} /> Aucune action en attente</p></div>
            : (
              <table className="w-full text-xs table-fixed">
                <colgroup>
                  <col className="w-auto" /><col className="w-36" /><col className="w-24" />
                  <col className="w-24" /><col className="w-24" /><col className="w-24" /><col className="w-20" />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-100 text-left">
                    {['Action', 'Assigné', 'Créée le', 'Échéance', 'Report 1', 'Report 2', ''].map(h => (
                      <th key={h} className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {openActions.map((a, i) => {
                    const isEditing = editingActionId === a.id
                    const rowCls = cn('border-b border-slate-50 group', i % 2 === 0 ? 'bg-card' : 'bg-slate-50/60')
                    const inputCls = 'w-full text-xs bg-card border border-purple/40 rounded px-1.5 py-0.5 outline-none text-navy focus:border-purple/70'

                    if (isEditing) return (
                      <tr key={a.id} className={cn(rowCls, 'bg-purple/5')}>
                        <td className="px-2 py-1.5">
                          <input className={inputCls} value={editValues.titre}
                            onChange={e => setEditValues(v => ({ ...v, titre: e.target.value }))}
                            onKeyDown={e => { if (e.key==='Enter') saveEdit(); if (e.key==='Escape') setEditingActionId(null) }}
                            autoFocus />
                        </td>
                        <td className="px-2 py-1.5">
                          <select className={inputCls} value={editValues.assigne_id}
                            onChange={e => setEditValues(v => ({ ...v, assigne_id: e.target.value }))}>
                            <option value="">—</option>
                            {membres.map(m => (
                              <option key={m.user_id} value={m.user_id}>
                                {[m.prenom, m.nom].filter(Boolean).join(' ') || m.trigramme || m.display_name || ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5 text-[11px] text-subtle tabular-nums">{fmtDate(a.created_at)}</td>
                        <td className="px-2 py-1.5"><input type="date" className={inputCls} value={editValues.date} onChange={e => setEditValues(v => ({ ...v, date: e.target.value }))} /></td>
                        <td className="px-2 py-1.5"><input type="date" className={inputCls} value={editValues.r1}   onChange={e => setEditValues(v => ({ ...v, r1: e.target.value }))} /></td>
                        <td className="px-2 py-1.5"><input type="date" className={inputCls} value={editValues.r2}   onChange={e => setEditValues(v => ({ ...v, r2: e.target.value }))} /></td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-2 justify-end">
                            <button onClick={saveEdit} className="text-emerald-600 hover:opacity-70"><Check size={12} /></button>
                            <button onClick={() => setEditingActionId(null)} className="text-subtle hover:text-rose-500"><X size={12} /></button>
                          </div>
                        </td>
                      </tr>
                    )

                    return (
                      <React.Fragment key={a.id}>
                        <tr className={rowCls}>
                          <td className="px-3 py-2 text-navy font-medium">{a.titre}</td>
                          <td className="px-3 py-2 text-subtle">
                            {a.assigne_nom ? (
                              <span className="flex items-center gap-1.5">
                                {(() => {
                                  const m = membres.find(x => x.user_id === a.assigne_id)
                                  return m?.avatar_url
                                    ? <img src={m.avatar_url} className="w-5 h-5 rounded-full object-cover shrink-0" alt="" />
                                    : <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0"
                                        style={{ background: m?.couleur ?? '#4A4CC8' }}>{m?.trigramme ?? a.assigne_nom[0]}</div>
                                })()}
                                {a.assigne_nom}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-2 text-[11px] text-subtle tabular-nums">{fmtDate(a.created_at)}</td>
                          <td className={cn('px-3 py-2 tabular-nums text-xs', dateColor(a.date_cloture_estimee))}>{a.date_cloture_estimee ? fmtDate(a.date_cloture_estimee) : '—'}</td>
                          <td className={cn('px-3 py-2 tabular-nums text-xs', dateColor(a.report_1))}>{a.report_1 ? fmtDate(a.report_1) : '—'}</td>
                          <td className={cn('px-3 py-2 tabular-nums text-xs', dateColor(a.report_2))}>{a.report_2 ? fmtDate(a.report_2) : '—'}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2 justify-end max-md:opacity-100 opacity-0 group-hover:opacity-100 transition-all">
                              <button onClick={() => startEdit(a)} className="text-subtle hover:text-navy" title="Modifier"><Pencil size={11} /></button>
                              <button onClick={() => navigate(`/taches?tab=add&titre=${encodeURIComponent(a.titre)}`)}
                                className="text-subtle hover:text-purple" title="Créer une tâche"><ListPlus size={13} /></button>
                              <button
                                onClick={() => { setSubtaskRowId(subtaskRowId === a.id ? null : a.id); setSubtaskParentId('') }}
                                className={cn('transition-colors', subtaskRowId === a.id ? 'text-purple' : 'text-subtle hover:text-purple')}
                                title="Créer une sous-tâche"><CornerDownRight size={13} /></button>
                              <button onClick={() => cloturerAction(a.id)}
                                className="text-[10px] text-subtle hover:text-emerald-600 font-medium">Clôturer</button>
                            </div>
                          </td>
                        </tr>
                        {subtaskRowId === a.id && (
                          <tr className="bg-purple/5">
                            <td colSpan={7} className="px-3 py-2 border-b border-purple/20">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-bold text-purple uppercase tracking-wider">Tâche parente</span>
                                <select value={subtaskParentId} onChange={e => setSubtaskParentId(e.target.value)}
                                  className="text-xs border border-border rounded px-2 py-1 bg-card text-navy outline-none focus:border-purple/50 flex-1 min-w-[200px] max-w-sm">
                                  <option value="">— Choisir une tâche parente —</option>
                                  {racines.map(t => <option key={t.id_tache} value={t.id_tache}>{t.id_tache} — {t.titre}</option>)}
                                </select>
                                <button disabled={!subtaskParentId}
                                  onClick={() => { navigate(`/taches?tab=add&titre=${encodeURIComponent(a.titre)}&parent_id=${subtaskParentId}`); setSubtaskRowId(null) }}
                                  className="flex items-center gap-1 text-[10px] font-semibold text-white bg-purple px-2 py-1 rounded disabled:opacity-40">
                                  <CornerDownRight size={10} /> Créer sous-tâche
                                </button>
                                <button onClick={() => setSubtaskRowId(null)} className="text-subtle hover:text-rose-500"><X size={13} /></button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
        </Section>
          ) },
          { key: 'chart_roadmap', label: 'Roadmap', minW: 6, minH: 4, defaultSize: { w: 12, h: 6 }, content: (
            <ChartWidget title={`Roadmap — ${produit.nom}`}>
              <LazyRoadmapChart produit={produit} taches={taches} sprints={allSprints} epicColors={epicColorsMap} jalonColors={jalonColorsMap} />
            </ChartWidget>
          ) },
          { key: 'chart_statuts', label: 'Graphe statuts', minW: 3, minH: 3, defaultSize: { w: 6, h: 5 }, content: (
            <ChartWidget title="Répartition des statuts">
              <LazyStatutsChart taches={taches} />
            </ChartWidget>
          ) },
          { key: 'chart_epics', label: 'Graphe épics', minW: 3, minH: 3, defaultSize: { w: 6, h: 5 }, content: (
            <ChartWidget title="Tâches par épic">
              <LazyEpicsChart taches={taches} epicColors={epicColorsMap} />
            </ChartWidget>
          ) },
          { key: 'chart_tendance', label: 'Tendance sprints', minW: 4, minH: 3, defaultSize: { w: 12, h: 5 }, content: (
            <ChartWidget title="Tendance sprint par sprint">
              <LazyTendanceChart sprints={allSprints} />
            </ChartWidget>
          ) },
        ]}
      />
    </>
  )
}
