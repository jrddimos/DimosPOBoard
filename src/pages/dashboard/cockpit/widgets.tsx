import { useEffect, useMemo, useState } from 'react'
import { animate } from 'framer-motion'
import { usePlanCharges } from '@/hooks/usePlanCharges'
import { usePeriodesFermeture } from '@/hooks/usePeriodesFermeture'
import { useAbsences } from '@/hooks/useAbsences'
import { getJoursFeries, joursOuvresSemaine } from '@/utils/joursFeries'
import { getWeeksForYear } from '@/pages/plancharges/utils'
import { getISOWeek } from '@/lib/utils'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip } from 'recharts'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'
import { scopedMetrics, getQuarterStart, getQuarterEnd } from '@/utils/produitMetrics'
import type { MultiScope, ProduitMetrics, Rag } from '@/utils/produitMetrics'
import type { Produit } from '@/hooks/useProduits'
import type { Tache } from '@/types'
import type { UserProfile } from '@/contexts/AuthContext'
import {
  Grid3x3, TrendingUp, CalendarClock, Euro, ShieldAlert, User, PieChart as PieChartIcon, Package,
  BarChart3, Rows3, LineChart, Map as MapIcon, Users,
} from 'lucide-react'
import { SPRINTS_LIST } from '@/constants'
import { PortfolioAvancementChart, PortfolioStatutsChart, PortfolioTendanceChart, BurndownSparkline } from '@/pages/dashboard/DashboardCharts'

// ── Contexte passé à chaque widget ────────────────────────────────
export interface WidgetCtx {
  produits: Produit[]
  metricsMap: Map<number, ProduitMetrics>
  scope: MultiScope
  allTaches: Tache[]
  faitDoneMap: Map<string, string>
  membres: UserProfile[]
  userTrigramme: string | null
  navigate: (to: string) => void
  openProduct: (p: Produit) => void
  fmtDate: (d: Date) => string
}

export interface WidgetDef {
  key: string
  label: string
  description: string
  icon: React.ReactNode
  defaultSize: { w: number; h: number }
  minW: number
  minH: number
  render: (ctx: WidgetCtx) => React.ReactNode
}

const RAG_BG: Record<string, string> = {
  green: 'bg-emerald-400', amber: 'bg-amber-400', red: 'bg-rose-500',
}
const RAG_LABEL: Record<string, string> = { green: 'OK', amber: 'À risque', red: 'Alerte' }

function RagCell({ rag, tip }: { rag: Rag; tip?: string }) {
  return (
    <Tooltip content={tip ?? (rag ? RAG_LABEL[rag] : 'Non évalué')}>
      <span className={cn('inline-block w-7 h-3.5 rounded-md cursor-help transition-transform hover:scale-110',
        rag ? RAG_BG[rag] : 'bg-border')} />
    </Tooltip>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center h-full text-xs text-subtle/50 italic">{children}</div>
}

// ── Compteur animé (framer-motion) ────────────────────────────────
export function AnimNumber({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const controls = animate(display, value, { duration: 0.7, ease: 'easeOut', onUpdate: v => setDisplay(Math.round(v)) })
    return () => controls.stop()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return <span className={cn('tabular-nums', className)}>{display}</span>
}

// ── Helpers portefeuille ──────────────────────────────────────────
function worstRag(m: ProduitMetrics, scope: MultiScope): Rag {
  const s = scopedMetrics(m, scope)
  const order: Rag[] = ['red', 'amber', 'green']
  for (const r of order) if ([s.ragA, s.ragB, s.ragD, s.ragBl].includes(r)) return r
  return null
}

// Curseur temps : non exposé par scopedMetrics, on le lit directement
function scopeCursor(m: ProduitMetrics, scope: MultiScope): number | null {
  return scope === 'global' ? m.globalCursorPct : m.cursorPct
}

export interface PortfolioKpis {
  g: number; a: number; r: number
  avancement: number; cursor: number | null
  blocages: number; prodBloques: number
  nextDelivery: { p: Produit; date: Date; late: boolean } | null
}

export function portfolioKpis(ctx: WidgetCtx): PortfolioKpis {
  const { produits, metricsMap, scope } = ctx
  let g = 0, a = 0, r = 0, totalUS = 0, faitUS = 0, cursorSum = 0, cursorN = 0, blocages = 0, prodBloques = 0
  let nextDelivery: PortfolioKpis['nextDelivery'] = null
  const today = new Date()

  produits.forEach(p => {
    const m = metricsMap.get(p.id); if (!m) return
    const s = scopedMetrics(m, scope)
    const w = worstRag(m, scope)
    if (w === 'green') g++; else if (w === 'amber') a++; else if (w === 'red') r++
    totalUS += s.total; faitUS += s.fait
    const cur = scopeCursor(m, scope)
    if (cur !== null) { cursorSum += cur; cursorN++ }
    if (m.bloqueUS > 0) { blocages += m.bloqueUS; prodBloques++ }
    const target = m.estimatedDeliveryDate ?? (m.dateLancementCible ? new Date(m.dateLancementCible) : null)
    if (target && target >= today && (!nextDelivery || target < nextDelivery.date)) {
      nextDelivery = { p, date: target, late: m.ragD === 'red' || m.ragD === 'amber' }
    }
  })

  const avancement = totalUS > 0 ? Math.round(faitUS / totalUS * 100) : 0
  const cursor = cursorN > 0 ? Math.round(cursorSum / cursorN) : null
  return { g, a, r, avancement, cursor, blocages, prodBloques, nextDelivery }
}

// ══ Widgets ═══════════════════════════════════════════════════════

function HeatmapWidget(ctx: WidgetCtx) {
  const { produits, metricsMap, scope, openProduct } = ctx
  if (!produits.length) return <EmptyHint>Aucun produit dans le périmètre</EmptyHint>
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-subtle">
          <th className="text-left font-medium pb-1.5">Produit</th>
          {['Avanc.', 'Budget', 'Date', 'Blocages'].map(h => <th key={h} className="text-center font-medium pb-1.5">{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {produits.map(p => {
          const m = metricsMap.get(p.id); if (!m) return null
          const s = scopedMetrics(m, scope)
          return (
            <tr key={p.id} onClick={() => openProduct(p)} className="cursor-pointer hover:bg-bg/60 transition-colors">
              <td className="py-1.5 pr-2">
                <span className="flex items-center gap-1.5 font-semibold text-navy">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />
                  <span className="truncate">{p.nom}</span>
                </span>
              </td>
              <td className="text-center py-1.5"><RagCell rag={s.ragA} tip={s.tipA} /></td>
              <td className="text-center py-1.5"><RagCell rag={s.ragB} /></td>
              <td className="text-center py-1.5"><RagCell rag={s.ragD} tip={s.tipD} /></td>
              <td className="text-center py-1.5"><RagCell rag={s.ragBl} tip={m.bloqueUS > 0 ? `${m.bloqueUS} US bloquée(s) · ${m.openRisques} risque(s)` : undefined} /></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function AvancementWidget(ctx: WidgetCtx) {
  const { produits, metricsMap, scope, openProduct, allTaches, faitDoneMap } = ctx
  if (!produits.length) return <EmptyHint>Aucun produit dans le périmètre</EmptyHint>
  return (
    <div className="flex flex-col gap-2.5">
      {produits.map(p => {
        const m = metricsMap.get(p.id); if (!m) return null
        const s = scopedMetrics(m, scope)
        const pct = s.backlogPct
        const cursor = scopeCursor(m, scope)
        const behind = cursor !== null && pct < cursor - 5
        const ahead  = cursor !== null && pct >= cursor

        // Burn-up trimestre (uniquement en scope 'trim', pas de sens en global)
        const quarterStart = scope === 'trim' && m.trimLabel ? getQuarterStart(m.trimLabel) : null
        const quarterEnd   = scope === 'trim' && m.trimLabel ? getQuarterEnd(m.trimLabel) : null
        const trims        = p.objectifs_trimestriels ?? []
        const currentTrim  = [...trims].reverse().find(t => !!t.lance && !t.pause && !t.cloture) ?? null
        const trimSprintSet = new Set<string>(currentTrim?.sprints_ids ?? [])
        const doneDates = scope === 'trim'
          ? allTaches
              .filter(t => t.produit_id === p.id && t.statut === 'Fait' && t.sprint && trimSprintSet.has(t.sprint))
              .map(t => {
                const iso = faitDoneMap.get(`${p.id}:${t.id_tache}`)
                return iso ? new Date(iso) : (quarterStart ?? new Date())
              })
          : []

        return (
          <button key={p.id} onClick={() => openProduct(p)} className="text-left group">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-xs font-semibold text-navy group-hover:text-indigo-600 transition-colors truncate">{p.nom}</span>
              <span className={cn('text-xs font-bold tabular-nums',
                ahead ? 'text-emerald-600' : behind ? 'text-rose-600' : 'text-amber-600')}>
                {pct}%{cursor !== null && <span className="text-subtle font-normal"> / {cursor}%</span>}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative h-2 rounded-full bg-bg overflow-visible flex-1">
                <div className={cn('h-2 rounded-full transition-all',
                  ahead ? 'bg-emerald-400' : behind ? 'bg-rose-400' : 'bg-amber-400')}
                  style={{ width: `${Math.min(100, pct)}%` }} />
                {cursor !== null && (
                  <Tooltip content={`Curseur temps : ${cursor}%`}>
                    <span className="absolute -top-1 w-0.5 h-4 bg-navy rounded-full cursor-help" style={{ left: `${Math.min(100, cursor)}%` }} />
                  </Tooltip>
                )}
              </div>
              {scope === 'trim' && (
                <BurndownSparkline quarterStart={quarterStart} quarterEnd={quarterEnd} objectif={m.totalUSTrim} doneDates={doneDates} />
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function TimelineWidget(ctx: WidgetCtx) {
  const { produits, metricsMap, fmtDate, openProduct } = ctx
  const today = new Date()
  const rows = produits.map(p => {
    const m = metricsMap.get(p.id); if (!m) return null
    const cible = m.dateLancementCible ? new Date(m.dateLancementCible) : null
    const proj  = m.estimatedDeliveryDate
    if (!cible && !proj) return null
    return { p, cible, proj }
  }).filter(Boolean) as { p: Produit; cible: Date | null; proj: Date | null }[]

  if (!rows.length) return <EmptyHint>Aucune date cible ni projection renseignée</EmptyHint>

  const allDates = [today, ...rows.flatMap(r => [r.cible, r.proj].filter(Boolean) as Date[])]
  const min = Math.min(...allDates.map(d => d.getTime()))
  const max = Math.max(...allDates.map(d => d.getTime()))
  const span = Math.max(max - min, 86400000)
  const pos = (d: Date) => Math.round(((d.getTime() - min) / span) * 92) + 2 // marge 2-94%

  return (
    <div className="flex flex-col gap-2.5 pt-1">
      {rows.map(({ p, cible, proj }) => {
        const late = cible && proj && proj.getTime() > cible.getTime() + 3 * 86400000
        return (
          <button key={p.id} onClick={() => openProduct(p)} className="flex items-center gap-2.5 text-left group">
            <span className="w-24 text-xs font-semibold text-navy truncate shrink-0 group-hover:text-indigo-600 transition-colors">{p.nom}</span>
            <div className="relative flex-1 h-5 rounded-md bg-bg">
              {/* Aujourd'hui */}
              <Tooltip content={`Aujourd'hui — ${fmtDate(today)}`}>
                <span className="absolute top-0 w-px h-5 bg-subtle/40 cursor-help" style={{ left: `${pos(today)}%` }} />
              </Tooltip>
              {/* Segment de dérive */}
              {cible && proj && (
                <span className={cn('absolute top-[8px] h-1 rounded-full', late ? 'bg-rose-300' : 'bg-emerald-300')}
                  style={{
                    left: `${Math.min(pos(cible), pos(proj))}%`,
                    width: `${Math.abs(pos(proj) - pos(cible))}%`,
                  }} />
              )}
              {cible && (
                <Tooltip content={`Cible : ${fmtDate(cible)}`}>
                  <span className="absolute top-[3px] w-3.5 h-3.5 rounded-full border-2 border-navy bg-card cursor-help -translate-x-1/2" style={{ left: `${pos(cible)}%` }} />
                </Tooltip>
              )}
              {proj && (
                <Tooltip content={`Projection : ${fmtDate(proj)}`}>
                  <span className={cn('absolute top-[3px] w-3.5 h-3.5 rounded-full cursor-help -translate-x-1/2', late ? 'bg-rose-500' : 'bg-emerald-500')}
                    style={{ left: `${pos(proj)}%` }} />
                </Tooltip>
              )}
            </div>
          </button>
        )
      })}
      <div className="text-[11px] text-subtle/60 flex items-center gap-3 pt-0.5">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-navy bg-card inline-block" /> cible</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> projection</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> projection en retard</span>
      </div>
    </div>
  )
}

function BudgetWidget(ctx: WidgetCtx) {
  const { produits, allTaches, openProduct } = ctx
  if (!produits.length) return <EmptyHint>Aucun produit dans le périmètre</EmptyHint>
  return (
    <div className="flex flex-col gap-2.5">
      {produits.map(p => {
        const ts = allTaches.filter(t => t.produit_id === p.id)
        const total = ts.reduce((s, t) => s + (t.effort_j ?? 0), 0)
        const fait  = ts.filter(t => t.statut === 'Fait').reduce((s, t) => s + (t.effort_j ?? 0), 0)
        const pct   = total > 0 ? Math.round(fait / total * 100) : 0
        return (
          <button key={p.id} onClick={() => openProduct(p)} className="text-left group">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-xs font-semibold text-navy group-hover:text-indigo-600 transition-colors truncate">{p.nom}</span>
              <span className="text-xs text-subtle tabular-nums">{Math.round(fait)}j / {Math.round(total)}j</span>
            </div>
            <div className="h-2 rounded-full bg-bg overflow-hidden">
              <div className="h-2 rounded-full bg-indigo-400" style={{ width: `${pct}%` }} />
            </div>
          </button>
        )
      })}
    </div>
  )
}

function BlocagesWidget(ctx: WidgetCtx) {
  const { produits, allTaches, openProduct } = ctx
  const pById = new Map(produits.map(p => [p.id, p]))
  const bloquees = allTaches
    .filter(t => t.statut === 'Bloqué' && pById.has(t.produit_id as number))
    .slice(0, 12)
  if (!bloquees.length) return <EmptyHint>Aucune tâche bloquée 🎉</EmptyHint>
  return (
    <div className="flex flex-col">
      {bloquees.map(t => {
        const p = pById.get(t.produit_id as number)!
        return (
          <button key={t.id_tache} onClick={() => openProduct(p)}
            className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0 text-left hover:bg-bg/60 transition-colors rounded px-1 -mx-1">
            <span className="text-rose-500 shrink-0">⛔</span>
            <span className="text-xs font-semibold text-indigo-600 shrink-0">{t.id_tache}</span>
            <span className="flex-1 text-xs text-navy truncate">{t.titre}</span>
            <span className="text-[11px] text-subtle shrink-0 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.couleur ?? '#4A4CC8' }} />
              {p.nom}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function MonTravailWidget(ctx: WidgetCtx) {
  const { allTaches, userTrigramme, produits, navigate } = ctx
  if (!userTrigramme) return <EmptyHint>Renseigne ton trigramme dans Équipes &amp; Utilisateurs</EmptyHint>
  const pIds = new Set(produits.map(p => p.id))
  const miennes = allTaches.filter(t =>
    pIds.has(t.produit_id as number) &&
    t.statut !== 'Fait' &&
    t.assigne_a?.split(/[,;\s]+/).map(s => s.trim()).includes(userTrigramme))
  const enCours = miennes.filter(t => t.statut === 'En cours')
  const bloque  = miennes.filter(t => t.statut === 'Bloqué')
  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 mb-2">
        <span className="ds-pill-stat pill-wip rounded-full">{enCours.length} en cours</span>
        <span className="ds-pill-stat pill-todo rounded-full">{miennes.length - enCours.length - bloque.length} à faire</span>
        {bloque.length > 0 && <span className="ds-pill-stat pill-block rounded-full">{bloque.length} bloquée{bloque.length > 1 ? 's' : ''}</span>}
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">
        {[...enCours, ...bloque, ...miennes.filter(t => t.statut === 'À faire')].slice(0, 8).map(t => (
          <div key={t.id_tache} className="flex items-center gap-2 py-1 text-xs border-b border-border/30 last:border-0">
            <span className="font-semibold text-indigo-600 shrink-0">{t.id_tache}</span>
            <span className="flex-1 text-navy truncate">{t.titre}</span>
          </div>
        ))}
        {!miennes.length && <EmptyHint>Rien d'assigné — profite ! ☀️</EmptyHint>}
      </div>
      <button onClick={() => navigate('/montravail')} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 text-left mt-1.5 shrink-0">
        Ouvrir Mon Travail →
      </button>
    </div>
  )
}

const STATUT_COLORS: Record<string, string> = {
  'Fait': '#00C896', 'En cours': '#F0A500', 'À faire': '#94A3B8', 'Bloqué': '#EF4444',
}

function RepartitionWidget(ctx: WidgetCtx) {
  const { produits, allTaches } = ctx
  const pIds = new Set(produits.map(p => p.id))
  const ts = allTaches.filter(t => pIds.has(t.produit_id as number))
  const data = ['Fait', 'En cours', 'À faire', 'Bloqué']
    .map(s => ({ name: s, value: ts.filter(t => t.statut === s).length }))
    .filter(d => d.value > 0)
  if (!data.length) return <EmptyHint>Aucune US dans le périmètre</EmptyHint>
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="flex items-center gap-3 h-full">
      <div className="relative h-full aspect-square min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius="62%" outerRadius="90%" paddingAngle={3} strokeWidth={0}>
              {data.map(d => <Cell key={d.name} fill={STATUT_COLORS[d.name]} />)}
            </Pie>
            <RTooltip formatter={(value) => `${value ?? 0} US`} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-lg font-bold text-navy tabular-nums">{total}</span>
          <span className="text-[11px] text-subtle">US</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {data.map(d => (
          <span key={d.name} className="flex items-center gap-1.5 text-xs text-navy">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: STATUT_COLORS[d.name] }} />
            {d.name} <span className="text-subtle tabular-nums">{d.value}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function CartesProduitsWidget(ctx: WidgetCtx) {
  const { produits, metricsMap, scope, openProduct } = ctx
  if (!produits.length) return <EmptyHint>Aucun produit dans le périmètre</EmptyHint>
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
      {produits.map(p => {
        const m = metricsMap.get(p.id); if (!m) return null
        const s = scopedMetrics(m, scope)
        const w = worstRag(m, scope)
        return (
          <button key={p.id} onClick={() => openProduct(p)}
            className="text-left border border-border rounded-xl p-2.5 hover:border-indigo-300 hover:shadow-sm transition-all bg-card">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={cn('w-2 h-2 rounded-full shrink-0', w ? RAG_BG[w] : 'bg-border')} />
              <span className="text-xs font-bold text-navy truncate">{p.nom}</span>
            </div>
            <div className="h-1.5 rounded-full bg-bg overflow-hidden mb-1.5">
              <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, s.backlogPct)}%`, background: p.couleur ?? '#4A4CC8' }} />
            </div>
            <div className="flex justify-between text-[11px] text-subtle tabular-nums">
              <span>{s.fait}/{s.total} US</span>
              <span className="font-semibold text-navy">{s.backlogPct}%</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── Roadmap : jalons positionnés sur l'axe des sprints ────────────
function RoadmapWidget(ctx: WidgetCtx) {
  const { produits, allTaches, openProduct } = ctx
  const sprintIdx = new Map(SPRINTS_LIST.map((s, i) => [s, i]))

  interface Seg { jalon: string; from: number; to: number; pct: number; nb: number }
  const rows: { p: Produit; segs: Seg[] }[] = produits.map(p => {
    const ts = allTaches.filter(t => t.produit_id === p.id && t.jalon)
    const byJalon = new Map<string, typeof ts>()
    ts.forEach(t => {
      const arr = byJalon.get(t.jalon!) ?? []
      arr.push(t); byJalon.set(t.jalon!, arr)
    })
    const segs: Seg[] = []
    byJalon.forEach((list, jalon) => {
      const idxs = list.flatMap(t => [t.sprint_debut || t.sprint, t.sprint_fin || t.sprint_debut || t.sprint])
        .map(s => (s ? sprintIdx.get(s) : undefined))
        .filter((i): i is number => i !== undefined)
      if (!idxs.length) return
      const fait = list.filter(t => t.statut === 'Fait').length
      segs.push({
        jalon,
        from: Math.min(...idxs),
        to: Math.max(...idxs),
        pct: Math.round(fait / list.length * 100),
        nb: list.length,
      })
    })
    segs.sort((a, b) => a.from - b.from || a.to - b.to)
    return { p, segs }
  }).filter(r => r.segs.length > 0)

  if (!rows.length) return <EmptyHint>Aucun jalon positionné sur des sprints</EmptyHint>

  const minIdx = Math.min(...rows.flatMap(r => r.segs.map(s => s.from)))
  const maxIdx = Math.max(...rows.flatMap(r => r.segs.map(s => s.to)))
  const span = Math.max(maxIdx - minIdx + 1, 1)
  const left  = (i: number) => `${((i - minIdx) / span) * 100}%`
  const width = (s: Seg) => `${((s.to - s.from + 1) / span) * 100}%`

  return (
    <div className="flex flex-col gap-1">
      {/* Axe des sprints */}
      <div className="relative h-4 ml-28 mr-1 text-[10px] text-subtle/70">
        {SPRINTS_LIST.slice(minIdx, maxIdx + 1).map((s, i) => (
          <span key={s} className="absolute top-0" style={{ left: left(minIdx + i) }}>{s}</span>
        ))}
      </div>
      {rows.map(({ p, segs }) => (
        <div key={p.id} className="flex flex-col gap-1 py-1 border-t border-border/40">
          <button onClick={() => openProduct(p)} className="flex items-center gap-1.5 text-left w-28 shrink-0 group">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />
            <span className="text-xs font-bold text-navy truncate group-hover:text-indigo-600 transition-colors">{p.nom}</span>
          </button>
          {segs.map(s => (
            <div key={s.jalon} className="flex items-center">
              <span className="w-28 shrink-0 pr-2 text-[11px] text-subtle truncate" title={s.jalon}>{s.jalon.split(' — ')[0]}</span>
              <div className="relative flex-1 h-5">
                <Tooltip content={`${s.jalon}\n${SPRINTS_LIST[s.from]} → ${SPRINTS_LIST[s.to]} · ${s.nb} US · ${s.pct}% fait`}>
                  <div className="absolute top-0.5 h-4 rounded-md overflow-hidden cursor-help border"
                    style={{ left: left(s.from), width: width(s), borderColor: (p.couleur ?? '#4A4CC8') + '55', background: (p.couleur ?? '#4A4CC8') + '22' }}>
                    <div className="h-full" style={{ width: `${s.pct}%`, background: (p.couleur ?? '#4A4CC8') + '99' }} />
                    <span className="absolute inset-0 flex items-center px-1.5 text-[10px] font-bold truncate"
                      style={{ color: p.couleur ?? '#4A4CC8' }}>
                      {s.pct}%
                    </span>
                  </div>
                </Tooltip>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Charge équipe : allocation vs capacité sur les 4 prochaines semaines ──
// Composant (et non simple fonction) car il charge ses propres données.
function ChargeEquipeWidget({ ctx }: { ctx: WidgetCtx }) {
  const year = new Date().getFullYear()
  const cur  = getISOWeek(new Date()).semaine
  const { data: plan = [] }       = usePlanCharges(year)
  const { data: fermetures = [] } = usePeriodesFermeture(year)
  const { data: absences = [] }   = useAbsences(year)

  const rows = useMemo(() => {
    const membres = ctx.membres.filter(m => m.actif && m.trigramme)
    const tris = membres.map(m => m.trigramme!)
    const feries = new Set(getJoursFeries(year).map(f => f.iso))
    const fermRanges = fermetures.map(f => ({ debut: f.date_debut, fin: f.date_fin }))
    const weeks = getWeeksForYear(year).filter(w => w.semaine >= cur && w.semaine < cur + 4)

    const absWk = new Map<string, number>()
    absences.forEach(a => {
      const d = new Date(a.date_debut + 'T00:00:00')
      const end = new Date(a.date_fin + 'T00:00:00')
      while (d <= end) {
        const dow = d.getDay()
        const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        if (dow !== 0 && dow !== 6 && !feries.has(iso)) {
          const k = `${a.trigramme}|${getISOWeek(d).semaine}`
          absWk.set(k, (absWk.get(k) ?? 0) + 1)
        }
        d.setDate(d.getDate() + 1)
      }
    })

    const allocWk = new Map<string, number>()
    plan.forEach(pc => {
      const k = `${pc.assigne_a}|${pc.semaine}`
      allocWk.set(k, (allocWk.get(k) ?? 0) + (pc.jours ?? 0))
    })

    return weeks.map(w => {
      const jo = joursOuvresSemaine(w.lundi, feries, fermRanges)
      let capa = 0, alloc = 0
      const over: string[] = []
      tris.forEach(tri => {
        const c = Math.max(0, jo - (absWk.get(`${tri}|${w.semaine}`) ?? 0))
        const a = allocWk.get(`${tri}|${w.semaine}`) ?? 0
        capa += c; alloc += a
        if (a > c) over.push(tri)
      })
      return { semaine: w.semaine, capa, alloc, over }
    })
  }, [ctx.membres, plan, fermetures, absences, year, cur])

  if (!rows.length) return <EmptyHint>Plan de charges vide</EmptyHint>

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col gap-2.5 flex-1">
        {rows.map(r => {
          const pct = r.capa > 0 ? Math.round(r.alloc / r.capa * 100) : 0
          return (
            <div key={r.semaine}>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs font-semibold text-navy">S{String(r.semaine).padStart(2, '0')}
                  {r.over.length > 0 && (
                    <span className="ml-1.5 text-[11px] font-bold text-rose-600" title={r.over.join(', ')}>⚠ {r.over.length} surcharge{r.over.length > 1 ? 's' : ''}</span>
                  )}
                </span>
                <span className={cn('text-xs tabular-nums', pct > 100 ? 'text-rose-600 font-bold' : 'text-subtle')}>
                  {Math.round(r.alloc)}j / {Math.round(r.capa)}j · {pct}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-bg overflow-hidden">
                <div className={cn('h-2 rounded-full', pct > 100 ? 'bg-rose-400' : pct > 80 ? 'bg-amber-400' : 'bg-emerald-400')}
                  style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            </div>
          )
        })}
      </div>
      <button onClick={() => ctx.navigate('/plan-charges')}
        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 text-left mt-2 shrink-0">
        Ouvrir le plan de charges →
      </button>
    </div>
  )
}

// ── Registre ──────────────────────────────────────────────────────
export const WIDGETS: WidgetDef[] = [
  { key: 'heatmap',     label: 'Santé RAG',            description: 'Produits × avancement, budget, date, blocages', icon: <Grid3x3 size={13} />,       defaultSize: { w: 6, h: 5 }, minW: 4, minH: 3, render: HeatmapWidget },
  { key: 'avancement',  label: 'Avancement vs temps',  description: 'Barre de progression et curseur temps',         icon: <TrendingUp size={13} />,    defaultSize: { w: 6, h: 5 }, minW: 3, minH: 3, render: AvancementWidget },
  { key: 'timeline',    label: 'Timeline livraisons',  description: 'Dates cibles vs projections, dérive visible',   icon: <CalendarClock size={13} />, defaultSize: { w: 8, h: 4 }, minW: 5, minH: 3, render: TimelineWidget },
  { key: 'blocages',    label: 'Top blocages',         description: 'Tâches bloquées tous produits',                 icon: <ShieldAlert size={13} />,   defaultSize: { w: 4, h: 4 }, minW: 3, minH: 3, render: BlocagesWidget },
  { key: 'montravail',  label: 'Mon travail',          description: 'Mes tâches en cours et à faire',                icon: <User size={13} />,          defaultSize: { w: 4, h: 5 }, minW: 3, minH: 3, render: MonTravailWidget },
  { key: 'repartition', label: 'Répartition US',       description: 'Donut des statuts du périmètre',                icon: <PieChartIcon size={13} />,  defaultSize: { w: 4, h: 5 }, minW: 3, minH: 3, render: RepartitionWidget },
  { key: 'budget',      label: 'Effort consommé',      description: 'Jours réalisés vs total par produit',           icon: <Euro size={13} />,          defaultSize: { w: 4, h: 5 }, minW: 3, minH: 3, render: BudgetWidget },
  { key: 'cartes',      label: 'Cartes produits',      description: 'Mini-cartes cliquables de tous les produits',   icon: <Package size={13} />,       defaultSize: { w: 12, h: 4 }, minW: 4, minH: 3, render: CartesProduitsWidget },
  { key: 'roadmap',     label: 'Roadmap jalons',       description: 'Jalons par produit sur l\'axe des sprints',     icon: <MapIcon size={13} />,       defaultSize: { w: 12, h: 6 }, minW: 6, minH: 4, render: RoadmapWidget },
  { key: 'chart_avancement', label: 'Graphe avancement',  description: 'Barres d\'avancement par produit',            icon: <BarChart3 size={13} />,     defaultSize: { w: 6, h: 6 }, minW: 4, minH: 4, render: ctx => <PortfolioAvancementChart produits={ctx.produits} metricsMap={ctx.metricsMap} scope={ctx.scope} /> },
  { key: 'chart_statuts',    label: 'Graphe statuts',     description: 'Répartition des statuts par produit',          icon: <Rows3 size={13} />,         defaultSize: { w: 6, h: 6 }, minW: 4, minH: 4, render: ctx => <PortfolioStatutsChart produits={ctx.produits} allTaches={ctx.allTaches} /> },
  { key: 'chart_tendance',   label: 'Tendance trimestrielle', description: 'Avancement et budgets par trimestre',      icon: <LineChart size={13} />,     defaultSize: { w: 12, h: 6 }, minW: 6, minH: 4, render: ctx => <PortfolioTendanceChart produits={ctx.produits} /> },
  { key: 'charge',      label: 'Charge équipe',        description: 'Allocation vs capacité sur 4 semaines',         icon: <Users size={13} />,         defaultSize: { w: 4, h: 5 }, minW: 3, minH: 3, render: ctx => <ChargeEquipeWidget ctx={ctx} /> },
]

export const WIDGET_BY_KEY = new Map(WIDGETS.map(w => [w.key, w]))
