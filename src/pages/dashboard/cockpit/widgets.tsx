import { useEffect, useMemo, useState } from 'react'
import { animate } from 'framer-motion'
import { usePlanCharges } from '@/hooks/usePlanCharges'
import { usePeriodesFermeture } from '@/hooks/usePeriodesFermeture'
import { useAbsencesCapacite } from '@/hooks/useAbsences'
import {
  useScorecardInitiatives, useScorecardIncrements,
  useCreateScorecardInitiative, useUpdateScorecardInitiative, useDeleteScorecardInitiative,
  useUpsertScorecardIncrement, useDeleteScorecardIncrement,
  type ScorecardInitiative, type ScorecardIncrement, type ScorecardStatut,
} from '@/hooks/useScorecard'
import { confirm } from '@/components/ui/ConfirmModal'
import { Modal } from '@/components/ui/Modal'
import { getJoursFeries, joursOuvresSemaine } from '@/utils/joursFeries'
import { getISOWeek } from '@/lib/utils'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip, LineChart as RLineChart, Line, XAxis, YAxis, CartesianGrid, Legend, ReferenceDot } from 'recharts'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn, effortEffectif, effortFaitEffectif, formatSprintLabel } from '@/lib/utils'
import { scopedMetrics, getQuarterStart, getQuarterEnd } from '@/utils/produitMetrics'
import type { MultiScope, ProduitMetrics, Rag } from '@/utils/produitMetrics'
import type { Produit } from '@/hooks/useProduits'
import type { Tache } from '@/types'
import type { UserProfile } from '@/contexts/AuthContext'
import {
  Grid3x3, TrendingUp, CalendarClock, Euro, ShieldAlert, User, PieChart as PieChartIcon, Package,
  BarChart3, Rows3, LineChart, Map as MapIcon, Users, Check, AlertTriangle, AlertOctagon, Info,
  Plus, Trash2, Rocket, ChevronDown, ChevronRight, Pencil, Maximize2, Target, Gauge,
  type LucideIcon,
} from 'lucide-react'
import { SPRINTS_LIST } from '@/constants'
import { PortfolioAvancementChart, PortfolioStatutsChart, PortfolioTendanceChart, BurndownSparkline } from '@/pages/dashboard/DashboardCharts'

// ── Contexte passé à chaque widget ────────────────────────────────
export interface WidgetCtx {
  produits: Produit[]
  // Tous les produits actifs (non-template) auxquels l'utilisateur a accès,
  // INDÉPENDAMMENT du filtre "périmètre" (produits cochés) — nécessaire pour
  // les widgets qui ne doivent pas suivre ce filtre (ex: Charge équipe, cf.
  // ChargeEquipeWidget) mais doivent quand même exclure les produits
  // archivés/templates (mêmes critères que activeProduits, PlanChargesPage).
  accessibles: Produit[]
  metricsMap: Map<number, ProduitMetrics>
  scope: MultiScope
  allTaches: Tache[]
  // parent_id → sous-tâches, PAR PRODUIT (id_tache n'est unique qu'au sein
  // d'un produit — un childMap partagé sur tous les produits confondus
  // expose à des collisions) : l'effort d'une US = effort propre + somme de
  // ses sous-tâches (effortEffectif, cf. 0057).
  childMapByProduit: Map<number, Record<string, Tache[]>>
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

export const RAG_BG: Record<string, string> = {
  green: 'bg-emerald-400', amber: 'bg-amber-400', red: 'bg-rose-500',
}
export const RAG_LABEL: Record<string, string> = { green: 'On track', amber: 'À risque', red: 'Off track' }
// Icône par sévérité en plus de la couleur : lisible aussi pour un daltonien,
// et rend la légende auto-explicative sans avoir à survoler chaque case.
export const RAG_ICON: Record<string, LucideIcon> = { green: Check, amber: AlertTriangle, red: AlertOctagon }
// Explique le repère vertical (curseur temps) affiché sur les barres
// d'avancement — même logique que les seuils RAG mais pas un indicateur en soi.
export const CURSOR_TIP = "Le repère vertical indique le curseur temps : la part de la période déjà écoulée (trimestre, ou jusqu'à la date cible en scope Global). Un produit on track a un avancement égal ou supérieur à ce repère."

// Pastille compacte icône + couleur, réutilisée partout où un statut RAG doit
// rester lisible sans survol (légendes, mini-cartes, KPI) — cf. RagCell
// ci-dessous pour la variante pilule des cellules de tableau.
export function RagIconDot({ rag, size = 14, iconSize = 8, className }: { rag: Rag; size?: number; iconSize?: number; className?: string }) {
  const Icon = rag ? RAG_ICON[rag] : null
  return (
    <span
      title={rag ? RAG_LABEL[rag] : 'Non évalué'}
      className={cn('rounded flex items-center justify-center text-white/90 shrink-0', rag ? RAG_BG[rag] : 'bg-border', className)}
      style={{ width: size, height: size }}
    >
      {Icon && <Icon size={iconSize} strokeWidth={3} />}
    </span>
  )
}

function RagCell({ rag, tip }: { rag: Rag; tip?: string }) {
  const Icon = rag ? RAG_ICON[rag] : null
  return (
    <Tooltip content={tip ?? (rag ? RAG_LABEL[rag] : 'Non évalué')}>
      <span className={cn('inline-flex items-center justify-center w-7 h-4 rounded-md cursor-help transition-transform hover:scale-110 text-white/90',
        rag ? RAG_BG[rag] : 'bg-border')}>
        {Icon && <Icon size={9} strokeWidth={3} />}
      </span>
    </Tooltip>
  )
}

// Légende compacte, toujours visible — évite de devoir survoler une case pour
// comprendre le code couleur (ni les cases non-hoverables sur tactile).
// `extra` ajoute des items après le trio RAG (ex : repère curseur temps).
export function RagLegend({ extra }: { extra?: React.ReactNode } = {}) {
  return (
    <div className="flex items-center gap-3 text-[10px] text-subtle mb-2 flex-wrap">
      {(['green', 'amber', 'red'] as const).map(r => (
        <span key={r} className="flex items-center gap-1">
          <RagIconDot rag={r} />
          {RAG_LABEL[r]}
        </span>
      ))}
      {extra}
    </div>
  )
}

// Info-bulle d'en-tête de colonne : explique ce qui est comparé (au survol,
// via un petit ⓘ plutôt que de compter sur la mémoire de l'utilisateur).
function ColHeader({ label, tip }: { label: string; tip: string }) {
  return (
    <Tooltip content={tip}>
      <span className="inline-flex items-center gap-0.5 cursor-help">
        {label}<Info size={9} className="text-subtle/50" />
      </span>
    </Tooltip>
  )
}

// Nom de produit uniformisé pour tous les widgets du cockpit : toujours la
// pastille à la couleur du produit devant le nom, même graisse, même hover
// (indigo quand la ligne est cliquable, via le group parent).
export function ProduitName({ p, className }: { p: Produit; className?: string }) {
  return (
    <span className={cn('flex items-center gap-1.5 min-w-0', className)}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />
      <span className="text-xs font-semibold text-navy truncate group-hover:text-indigo-600 transition-colors">{p.nom}</span>
    </span>
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
  // Non-null uniquement quand un seul produit porte tous les blocages du
  // périmètre — sert à rendre la tuile KPI cliquable vers ce produit précis
  // (ambigu s'il y en a plusieurs, la tuile reste alors non cliquable).
  soleBlockedProduct: Produit | null
  nextDelivery: { p: Produit; date: Date; late: boolean } | null
}

export function portfolioKpis(ctx: WidgetCtx): PortfolioKpis {
  const { produits, metricsMap, scope } = ctx
  let g = 0, a = 0, r = 0, totalUS = 0, faitUS = 0, cursorSum = 0, cursorN = 0, blocages = 0, prodBloques = 0
  let nextDelivery: PortfolioKpis['nextDelivery'] = null
  let soleBlockedProduct: Produit | null = null
  const today = new Date()

  produits.forEach(p => {
    const m = metricsMap.get(p.id); if (!m) return
    const s = scopedMetrics(m, scope)
    const w = worstRag(m, scope)
    if (w === 'green') g++; else if (w === 'amber') a++; else if (w === 'red') r++
    totalUS += s.total; faitUS += s.fait
    const cur = scopeCursor(m, scope)
    if (cur !== null) { cursorSum += cur; cursorN++ }
    // bloqueTrim en scope Trimestre (pas toujours bloqueUS global) — sinon ce
    // KPI contredit totalUS/faitUS juste au-dessus, qui eux respectent bien
    // le scope via scopedMetrics.
    const bloqueScope = scope === 'global' ? m.bloqueUS : m.bloqueTrim
    if (bloqueScope > 0) {
      blocages += bloqueScope; prodBloques++
      soleBlockedProduct = prodBloques === 1 ? p : null
    }
    const target = m.estimatedDeliveryDate ?? (m.dateLancementCible ? new Date(m.dateLancementCible) : null)
    if (target && target >= today && (!nextDelivery || target < nextDelivery.date)) {
      nextDelivery = { p, date: target, late: m.ragD === 'red' || m.ragD === 'amber' }
    }
  })

  const avancement = totalUS > 0 ? Math.round(faitUS / totalUS * 100) : 0
  const cursor = cursorN > 0 ? Math.round(cursorSum / cursorN) : null
  return { g, a, r, avancement, cursor, blocages, prodBloques, soleBlockedProduct, nextDelivery }
}

// ══ Widgets ═══════════════════════════════════════════════════════

export const COL_TIPS: Record<string, string> = {
  Avancement: "Compare le rythme réel (% fait) au rythme attendu (curseur temps). On track = au moins 80% de ce rythme, à risque = au moins 50%, off track = en dessous.",
  Budget: 'Compare le budget consommé au même curseur temps. On track = consommation alignée ou en retrait, off track = ça brûle plus vite que le calendrier.',
  Date: 'Compare la date de livraison projetée à la date cible (ou trimestre en cours). Off track = retard prévu.',
  Blocages: 'US bloquées + risques ouverts. On track = aucun, à risque = 1-2, off track = 3 ou plus.',
}

function HeatmapWidget(ctx: WidgetCtx) {
  const { produits, metricsMap, scope, openProduct } = ctx
  if (!produits.length) return <EmptyHint>Aucun produit dans le périmètre</EmptyHint>
  return (
    <div>
      <RagLegend />
      <table className="w-full text-xs">
        <thead>
          <tr className="text-subtle">
            <th className="text-left font-medium pb-1.5">Produit</th>
            {['Avancement', 'Budget', 'Date', 'Blocages'].map(h => (
              <th key={h} className="text-center font-medium pb-1.5"><ColHeader label={h} tip={COL_TIPS[h]} /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {produits.map(p => {
            const m = metricsMap.get(p.id); if (!m) return null
            const s = scopedMetrics(m, scope)
            return (
              <tr key={p.id} onClick={() => openProduct(p)} className="group cursor-pointer hover:bg-bg/60 transition-colors">
                <td className="py-1.5 pr-2"><ProduitName p={p} /></td>
                <td className="text-center py-1.5"><RagCell rag={s.ragA} tip={s.tipA} /></td>
                <td className="text-center py-1.5"><RagCell rag={s.ragB} tip={s.tipB} /></td>
                <td className="text-center py-1.5"><RagCell rag={s.ragD} tip={s.tipD} /></td>
                <td className="text-center py-1.5"><RagCell rag={s.ragBl} tip={s.tipBl} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AvancementWidget(ctx: WidgetCtx) {
  const { produits, metricsMap, scope, openProduct, allTaches, faitDoneMap } = ctx
  if (!produits.length) return <EmptyHint>Aucun produit dans le périmètre</EmptyHint>
  return (
    <div className="flex flex-col gap-2.5">
      <RagLegend extra={
        <span className="flex items-center gap-1">
          <span className="w-0.5 h-3 bg-navy rounded-full inline-block" /> curseur temps
        </span>
      } />
      {produits.map(p => {
        const m = metricsMap.get(p.id); if (!m) return null
        const s = scopedMetrics(m, scope)
        const pct = s.backlogPct
        const cursor = scopeCursor(m, scope)
        // Couleur dérivée de ragA (scopedMetrics, même formule proportionnelle
        // que la heatmap "Santé RAG") — pas d'un seuil à plat recalculé ici,
        // pour ne jamais afficher une couleur différente pour la même donnée
        // selon le widget consulté.
        const ahead  = s.ragA === 'green'
        const behind = s.ragA === 'red'

        // Burn-up trimestre (uniquement en scope 'trim', pas de sens en global)
        const quarterStart = scope === 'trim' && m.trimLabel ? getQuarterStart(m.trimLabel) : null
        const quarterEnd   = scope === 'trim' && m.trimLabel ? getQuarterEnd(m.trimLabel) : null
        const trims        = p.objectifs_trimestriels ?? []
        const currentTrim  = [...trims].reverse().find(t => !!t.lance && !t.pause && !t.cloture) ?? null
        const trimSprintSet = new Set<string>(currentTrim?.sprints_ids ?? [])
        const doneDates = scope === 'trim'
          ? allTaches
              // `t.sprint` (l'ancien champ) porte une valeur par défaut ('S01'
              // constaté en base) sur la quasi-totalité des tâches — seul
              // sprint_debut est fiable (même bug corrigé dans sprintEligibility.ts).
              .filter(t => t.produit_id === p.id && t.type_tache !== 'Conteneur' && t.statut === 'Fait' && t.sprint_debut && trimSprintSet.has(t.sprint_debut))
              .map(t => {
                const iso = faitDoneMap.get(`${p.id}:${t.id_tache}`)
                return { date: iso ? new Date(iso) : (quarterStart ?? new Date()), value: 1 }
              })
          : []

        return (
          <button key={p.id} onClick={() => openProduct(p)} className="text-left group">
            <div className="flex justify-between items-baseline mb-1 gap-2">
              <ProduitName p={p} />
              <span className={cn('text-xs font-bold tabular-nums shrink-0',
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
            <ProduitName p={p} className="w-24 shrink-0" />
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
  const { produits, allTaches, childMapByProduit, openProduct, scope } = ctx
  if (!produits.length) return <EmptyHint>Aucun produit dans le périmètre</EmptyHint>
  return (
    <div className="flex flex-col gap-2.5">
      {produits.map(p => {
        const childMap = childMapByProduit.get(p.id) ?? {}
        // En scope Trimestre, ne garder que les US du trimestre actif — sinon
        // ce widget affichait toujours l'effort total tous sprints confondus,
        // en contradiction avec les autres widgets scopés au trimestre.
        const currentTrim = scope === 'trim'
          ? [...(p.objectifs_trimestriels ?? [])].reverse().find(o => !!o.lance && !o.pause && !o.cloture) : null
        const trimSprintSet = new Set<string>(currentTrim?.sprints_ids ?? [])
        const ts = allTaches.filter(t => t.produit_id === p.id && t.type_tache !== 'Conteneur'
          && (scope !== 'trim' || (!!t.sprint_debut && trimSprintSet.has(t.sprint_debut))))
        const total = ts.reduce((s, t) => s + effortEffectif(t, childMap), 0)
        // effortFaitEffectif (pas un simple filter+effortEffectif) : compte
        // l'effort d'une sous-tâche déjà "Fait" même si son US parente ne
        // l'est pas encore (cf. le même correctif appliqué au dashboard
        // produit et à produitMetrics.ts).
        const fait  = ts.reduce((s, t) => s + effortFaitEffectif(t, childMap), 0)
        const pct   = total > 0 ? Math.round(fait / total * 100) : 0
        return (
          <button key={p.id} onClick={() => openProduct(p)} className="text-left group">
            <div className="flex justify-between items-baseline mb-1 gap-2">
              <ProduitName p={p} />
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
  const { produits, allTaches, openProduct, scope } = ctx
  const pById = new Map(produits.map(p => [p.id, p]))
  // En scope Trimestre, ne liste que les blocages du trimestre actif de
  // chaque produit — sinon ce widget contredit le KPI "blocages" du bandeau
  // (lui-même corrigé pour respecter le scope).
  const bloquees = allTaches
    .filter(t => {
      if (t.statut !== 'Bloqué' || t.type_tache === 'Conteneur' || !pById.has(t.produit_id as number)) return false
      if (scope !== 'trim') return true
      const p = pById.get(t.produit_id as number)!
      const currentTrim = [...(p.objectifs_trimestriels ?? [])].reverse().find(o => !!o.lance && !o.pause && !o.cloture)
      const trimSprintSet = new Set<string>(currentTrim?.sprints_ids ?? [])
      return !!t.sprint_debut && trimSprintSet.has(t.sprint_debut)
    })
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
            <ProduitName p={p} className="shrink-0 max-w-28" />
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
    t.type_tache !== 'Conteneur' &&
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
  const { produits, allTaches, scope } = ctx
  const pIds = new Set(produits.map(p => p.id))
  // En scope Trimestre, ne garder que les US du trimestre ACTIF de chacun de
  // ses produits (même logique que computeProduitMetrics/racinesTrim) —
  // sinon ce widget affichait toujours le total global (tous sprints
  // confondus), en contradiction avec les autres widgets scopés au trimestre.
  const ts = allTaches.filter(t => {
    if (!pIds.has(t.produit_id as number) || t.type_tache === 'Conteneur') return false
    if (scope !== 'trim') return true
    const p = produits.find(pp => pp.id === t.produit_id)
    const currentTrim = p ? [...(p.objectifs_trimestriels ?? [])].reverse().find(o => !!o.lance && !o.pause && !o.cloture) : null
    const trimSprintSet = new Set<string>(currentTrim?.sprints_ids ?? [])
    return !!t.sprint_debut && trimSprintSet.has(t.sprint_debut)
  })
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
            className="group text-left border border-border rounded-xl p-2.5 hover:border-indigo-300 hover:shadow-sm transition-all bg-card">
            <div className="flex items-center justify-between gap-1.5 mb-1.5">
              <ProduitName p={p} />
              <RagIconDot rag={w} size={13} iconSize={7} />
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
    const ts = allTaches.filter(t => t.produit_id === p.id && t.type_tache !== 'Conteneur' && t.jalon)
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
          <span key={s} className="absolute top-0" style={{ left: left(minIdx + i) }}>{formatSprintLabel(s)}</span>
        ))}
      </div>
      {rows.map(({ p, segs }) => (
        <div key={p.id} className="flex flex-col gap-1 py-1 border-t border-border/40">
          <button onClick={() => openProduct(p)} className="text-left w-28 shrink-0 group">
            <ProduitName p={p} />
          </button>
          {segs.map(s => (
            <div key={s.jalon} className="flex items-center">
              <span className="w-28 shrink-0 pr-2 text-[11px] text-subtle truncate" title={s.jalon}>{s.jalon.split(' — ')[0]}</span>
              <div className="relative flex-1 h-5">
                <Tooltip content={`${s.jalon}\n${formatSprintLabel(SPRINTS_LIST[s.from])} → ${formatSprintLabel(SPRINTS_LIST[s.to])} · ${s.nb} US · ${s.pct}% fait`}>
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
  // Fenêtre de 4 semaines calendaires à partir de VRAIES dates (lundi de
  // chaque semaine), pas un filtre sur le numéro de semaine ISO dans l'année
  // civile courante — sinon la fenêtre se tronquait silencieusement fin
  // décembre (semaine 53 inexistante certaines années, semaines de janvier
  // N+1 jamais incluses) au lieu d'afficher toujours 4 semaines pleines.
  const today = new Date()
  const mondayThis = new Date(today)
  mondayThis.setHours(0, 0, 0, 0)
  mondayThis.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const weekStarts = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(mondayThis); d.setDate(d.getDate() + i * 7); return d
  })
  const yearA = getISOWeek(weekStarts[0]).annee
  const yearB = getISOWeek(weekStarts[weekStarts.length - 1]).annee

  const { data: planA = [] }       = usePlanCharges(yearA)
  const { data: planB = [] }       = usePlanCharges(yearB)
  const { data: fermeturesA = [] } = usePeriodesFermeture(yearA)
  const { data: fermeturesB = [] } = usePeriodesFermeture(yearB)
  const { data: absencesA = [] }   = useAbsencesCapacite(yearA)
  const { data: absencesB = [] }   = useAbsencesCapacite(yearB)
  const sameYear = yearB === yearA
  const plan       = sameYear ? planA       : [...planA, ...planB]
  const fermetures = sameYear ? fermeturesA : [...fermeturesA, ...fermeturesB]
  const absences   = sameYear ? absencesA   : [...absencesA, ...absencesB]

  const rows = useMemo(() => {
    const membres = ctx.membres.filter(m => m.actif && m.trigramme)
    const tris = membres.map(m => m.trigramme!)
    const feries = new Set([...getJoursFeries(yearA), ...(sameYear ? [] : getJoursFeries(yearB))].map(f => f.iso))
    const fermRanges = fermetures.map(f => ({ debut: f.date_debut, fin: f.date_fin }))

    // Clé année+semaine (pas juste semaine) : une semaine 1 de deux années
    // différentes ne doit jamais fusionner ses jours/allocations.
    // Un jour de fermeture est déjà exclu de `jo` (joursOuvresSemaine, plus
    // bas) — s'il tombe aussi dans une absence individuelle, il ne doit PAS
    // être décompté une seconde fois, sinon la capacité chute artificiellement
    // sous l'allocation réelle et déclenche une fausse surcharge (même
    // exclusion que sur la page Plan de charges, cf. fermeturesDayMap).
    const absWk = new Map<string, number>()
    absences.forEach(a => {
      const d = new Date(a.date_debut + 'T00:00:00')
      const end = new Date(a.date_fin + 'T00:00:00')
      while (d <= end) {
        const dow = d.getDay()
        const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        if (dow !== 0 && dow !== 6 && !feries.has(iso) && !fermRanges.some(f => iso >= f.debut && iso <= f.fin)) {
          const { semaine, annee } = getISOWeek(d)
          const k = `${a.trigramme}|${annee}|${semaine}`
          absWk.set(k, (absWk.get(k) ?? 0) + 1)
        }
        d.setDate(d.getDate() + 1)
      }
    })

    // Plan de charges (page dédiée) ne totalise que les produits actifs et
    // non-template — une allocation restée sur un produit archivé/template
    // gonflait ici le total sans jamais apparaître côté Plan de charges,
    // déclenchant une fausse surcharge pour des membres pourtant à l'équilibre.
    const accessibleIds = new Set(ctx.accessibles.map(p => p.id))
    const allocWk = new Map<string, number>()
    plan.forEach(pc => {
      if (!accessibleIds.has(pc.produit_id)) return
      const k = `${pc.assigne_a}|${pc.annee}|${pc.semaine}`
      allocWk.set(k, (allocWk.get(k) ?? 0) + (pc.jours ?? 0))
    })

    return weekStarts.map(monday => {
      const { semaine, annee } = getISOWeek(monday)
      const jo = joursOuvresSemaine(monday, feries, fermRanges)
      let capa = 0, alloc = 0
      const over: string[] = []
      tris.forEach(tri => {
        const c = Math.max(0, jo - (absWk.get(`${tri}|${annee}|${semaine}`) ?? 0))
        const a = allocWk.get(`${tri}|${annee}|${semaine}`) ?? 0
        capa += c; alloc += a
        if (a > c) over.push(tri)
      })
      return { semaine, capa, alloc, over }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.membres, ctx.accessibles, plan, fermetures, absences, yearA, yearB])

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

// Liste des semaines de la fenêtre [semaine_depart, semaine_deadline].
function initiativeWeekRange(init: ScorecardInitiative): number[] {
  const span = Math.max(0, init.semaine_deadline - init.semaine_depart)
  return Array.from({ length: span + 1 }, (_, i) => init.semaine_depart + i)
}

// Une entrée par semaine : `objectif` = trajectoire idéale, part de 0 à la
// semaine de départ et monte linéairement à l'objectif total à la deadline ;
// `realise` = cumul livré saisi cette semaine-là, null si pas encore saisie
// — connectNulls=false sur la ligne réalisé, cf. InitiativeSparkline, pour
// ne pas relier au-delà de la dernière semaine réellement renseignée.
// Même sens que actualPct/idealPct plus bas (% délivré vs % du temps
// écoulé) : on démarre en bas à gauche (0) et on progresse vers le haut à
// droite (objectif atteint à la deadline).
function initiativeWeeks(init: ScorecardInitiative, incs: ScorecardIncrement[]) {
  const byWeek = new Map(incs.map(i => [i.semaine, i.valeur]))
  const span = Math.max(1, init.semaine_deadline - init.semaine_depart)
  return initiativeWeekRange(init).map(w => {
    const cumul = byWeek.get(w)
    return {
      semaine: w,
      objectif: Math.round(init.objectif_increments * (w - init.semaine_depart) / span),
      realise: cumul == null ? null : cumul,
    }
  })
}

type WeekPoint = { semaine: number; objectif: number; realise: number | null }

// Point de projection : si le cumul livré continue à la vélocité moyenne
// observée jusqu'ici (dernier cumul connu / nombre de semaines écoulées
// depuis le départ), où atterrit-on à la deadline ? `null` tant qu'aucune
// semaine n'a de cumul saisi (rien à projeter).
function projectAtCurrentVelocity(weeks: WeekPoint[]): { semaineDeadline: number; objectifFinal: number; projected: number | null } {
  const semaineDepart   = weeks[0].semaine
  const semaineDeadline = weeks[weeks.length - 1].semaine
  const objectifFinal   = weeks[weeks.length - 1].objectif
  const lastKnown = [...weeks].reverse().find(w => w.realise != null)
  if (!lastKnown) return { semaineDeadline, objectifFinal, projected: null }
  const elapsed  = Math.max(1, lastKnown.semaine - semaineDepart)
  const velocity = (lastKnown.realise as number) / elapsed
  const projected = Math.round(velocity * Math.max(1, semaineDeadline - semaineDepart))
  return { semaineDeadline, objectifFinal, projected }
}

// Icône (lucide, un <svg> imbriqué dans le <svg> du graphe) + valeur affichée
// en permanence à côté — utilisée en shape de ReferenceDot pour marquer
// l'objectif final et sa projection. Un <title> seul (info-bulle au survol)
// obligeait à viser très précisément l'icône, en particulier quand les deux
// repères sont proches l'un de l'autre ; la valeur est donc TOUJOURS visible,
// positionnée au-dessus (side="top") ou en dessous (side="bottom") de
// l'icône pour que les deux étiquettes ne se chevauchent pas.
function DotIcon({ cx, cy, icon: Icon, color, size, value, side }: {
  cx?: number; cy?: number; icon: LucideIcon; color: string; size: number; value: number; side: 'top' | 'bottom'
}) {
  if (cx == null || cy == null) return null
  const labelY = side === 'top' ? cy - size / 2 - 5 : cy + size / 2 + (size >= 16 ? 16 : 12)
  return (
    <g>
      <g transform={`translate(${cx - size / 2}, ${cy - size / 2})`}>
        <Icon width={size} height={size} color={color} strokeWidth={2.5} />
      </g>
      <text x={cx} y={labelY} textAnchor="middle" fontSize={size >= 16 ? 12 : 10} fontWeight={700} fill={color}>
        {value}
      </text>
    </g>
  )
}

// Courbe de progression compacte (sparkline) : pointillé gris = trajectoire
// idéale (monte vers l'objectif), plein = cumul réellement livré. Semaine en
// abscisse, croissante de gauche à droite (ordre chronologique) — valeur en
// ordonnée (inversée : 0 en haut). Cible = objectif final ; jauge = ce que
// donnerait la vélocité actuelle projetée jusqu'à la deadline.
function InitiativeSparkline({ weeks }: { weeks: WeekPoint[] }) {
  if (weeks.length < 2) return null
  const { semaineDeadline, objectifFinal, projected } = projectAtCurrentVelocity(weeks)
  return (
    <ResponsiveContainer width="100%" height={540}>
      <RLineChart data={weeks} margin={{ top: 24, right: 14, bottom: 20, left: 0 }}>
        <XAxis type="category" dataKey="semaine" tickFormatter={w => `S${w}`}
          tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis type="number" reversed width={24} tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Line type="monotone" dataKey="objectif" stroke="#CBD5E1" strokeWidth={1.5} strokeDasharray="2 2" dot={false} connectNulls isAnimationActive={false} />
        <Line type="monotone" dataKey="realise" stroke="#6366F1" strokeWidth={2} dot={{ r: 2.5, fill: '#6366F1' }} connectNulls={false} isAnimationActive={false} />
        <ReferenceDot x={semaineDeadline} y={objectifFinal} r={0} ifOverflow="extendDomain"
          shape={props => <DotIcon {...props} icon={Target} color="#4A4CC8" size={12} value={objectifFinal} side="top" />} />
        {projected != null && (
          <ReferenceDot x={semaineDeadline} y={projected} r={0} ifOverflow="extendDomain"
            shape={props => <DotIcon {...props} icon={Gauge} color="#F59E0B" size={12} value={projected} side="bottom" />} />
        )}
      </RLineChart>
    </ResponsiveContainer>
  )
}

// Version agrandie (modal, cf. ScorecardWidget) : mêmes séries, même
// orientation et mêmes repères (cible/projection) que InitiativeSparkline,
// avec axes plus lisibles, tooltip au survol et légende.
function InitiativeProgressDetail({ weeks }: { weeks: WeekPoint[] }) {
  const { semaineDeadline, objectifFinal, projected } = projectAtCurrentVelocity(weeks)
  return (
    // Hauteur bornée par la résolution de l'écran (60% de la hauteur visible,
    // entre 320 et 640px) plutôt qu'une valeur fixe : sur les petits écrans,
    // un graphe trop haut forçait un scroll dans la modale (déjà limitée à
    // 90vh) en plus de son propre scroll interne.
    <div style={{ height: 'clamp(320px, 60vh, 640px)' }}>
      <ResponsiveContainer width="100%" height="100%">
        <RLineChart data={weeks} margin={{ top: 30, right: 28, bottom: 24, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis type="category" dataKey="semaine" tickFormatter={w => `S${w}`}
            tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
          <YAxis type="number" reversed tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <RTooltip labelFormatter={w => `Semaine ${w}`}
            formatter={(v: unknown, name: unknown) => [v as number, name === 'objectif' ? 'Trajectoire idéale' : 'Cumul livré']} />
          <Legend formatter={(v: string) => v === 'objectif' ? 'Trajectoire idéale' : 'Cumul livré'} wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="objectif" name="objectif" stroke="#CBD5E1" strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="realise" name="realise" stroke="#6366F1" strokeWidth={3} dot={{ r: 4, fill: '#6366F1' }} connectNulls={false} isAnimationActive={false} />
          <ReferenceDot x={semaineDeadline} y={objectifFinal} r={0} ifOverflow="extendDomain"
            shape={props => <DotIcon {...props} icon={Target} color="#4A4CC8" size={18} value={objectifFinal} side="top" />} />
          {projected != null && (
            <ReferenceDot x={semaineDeadline} y={projected} r={0} ifOverflow="extendDomain"
              shape={props => <DotIcon {...props} icon={Gauge} color="#F59E0B" size={18} value={projected} side="bottom" />} />
          )}
        </RLineChart>
      </ResponsiveContainer>
    </div>
  )
}

// Taille de carte par initiative — alternative légère à un panel de grille
// par initiative (qui demanderait de synchroniser la grille à chaque
// création/suppression d'initiative) : ici on fait varier le col-span à
// l'intérieur du seul panel Scorecard, cf. grid-cols-1 md:grid-cols-2
// xl:grid-cols-3 plus bas.
type CardSize = 'sm' | 'md' | 'lg'
const CARD_SIZE_CYCLE: Record<CardSize, CardSize> = { sm: 'md', md: 'lg', lg: 'sm' }
const CARD_SIZE_LABEL: Record<CardSize, string> = { sm: 'S', md: 'M', lg: 'L' }
const CARD_SIZE_CLASS: Record<CardSize, string> = { sm: '', md: 'md:col-span-2', lg: 'md:col-span-2 xl:col-span-3' }

// ── Scorecard portefeuille : incréments livrés par initiative transverse
// (hors produits D3X — remplace le suivi tenu à la main dans Excel).
// `valeur` sur scorecard_increments est cumulative ; le repère (trait
// vertical) marque la trajectoire idéale entre semaine de départ et
// deadline, même langage visuel que le curseur temps d'AvancementWidget.
function ScorecardWidget() {
  const { data: initiatives = [], isLoading } = useScorecardInitiatives()
  const { data: increments = [] } = useScorecardIncrements()
  const createInitiative = useCreateScorecardInitiative()
  const updateInitiative = useUpdateScorecardInitiative()
  const deleteInitiative = useDeleteScorecardInitiative()
  const upsertIncrement = useUpsertScorecardIncrement()
  const deleteIncrement = useDeleteScorecardIncrement()

  const curWeek = getISOWeek(new Date()).semaine
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ nom: '', semaine_depart: '', semaine_deadline: '', objectif_increments: '' })
  // Édition des objectifs (semaines de départ/deadline, cible) d'une
  // initiative existante — même forme que la création, un seul id ouvert
  // à la fois. Modifier ces valeurs recalcule la trajectoire idéale de la
  // courbe à l'affichage suivant (pas de recalcul rétroactif des cumuls).
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ nom: '', semaine_depart: '', semaine_deadline: '', objectif_increments: '' })
  // Grille de saisie façon tableur, déployable par initiative — brouillon
  // local par cellule (clé `initiativeId:semaine`) commité au blur, pour ne
  // pas déclencher une requête à chaque frappe.
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [cellDrafts, setCellDrafts] = useState<Record<string, string>>({})
  // Graphique agrandi dans une modale au clic sur la sparkline.
  const [zoomedId, setZoomedId] = useState<number | null>(null)
  // Largeur de carte par initiative (S/M/L, cf. col-span) — préférence
  // d'affichage locale au navigateur, pas une donnée d'équipe : pas besoin
  // de colonne DB ni de sync, cf. localStorage('cockpit-tab') déjà utilisé
  // pour l'onglet actif du cockpit.
  const [cardSizes, setCardSizes] = useState<Record<number, CardSize>>(() => {
    try { return JSON.parse(localStorage.getItem('scorecard-card-sizes') ?? '{}') } catch { return {} }
  })
  useEffect(() => { localStorage.setItem('scorecard-card-sizes', JSON.stringify(cardSizes)) }, [cardSizes])
  function cycleCardSize(id: number) {
    setCardSizes(prev => ({ ...prev, [id]: CARD_SIZE_CYCLE[prev[id] ?? 'sm'] }))
  }

  function incsFor(id: number) {
    return increments.filter(i => i.initiative_id === id).sort((a, b) => a.semaine - b.semaine)
  }

  function toggleExpanded(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function submitAdd() {
    const nom = form.nom.trim()
    const sd = Number(form.semaine_depart), sD = Number(form.semaine_deadline), obj = Number(form.objectif_increments)
    if (!nom || !sd || !sD || !obj) return
    await createInitiative.mutateAsync({ nom, semaine_depart: sd, semaine_deadline: sD, objectif_increments: obj, ordre: (initiatives.length + 1) * 10 })
    setForm({ nom: '', semaine_depart: '', semaine_deadline: '', objectif_increments: '' })
    setAdding(false)
  }

  async function removeInitiative(id: number, nom: string) {
    const ok = await confirm({ title: `Supprimer "${nom}" ?`, message: 'Son historique d\'incréments sera perdu.', confirmLabel: 'Supprimer', variant: 'danger' })
    if (ok) deleteInitiative.mutate(id)
  }

  function startEdit(init: ScorecardInitiative) {
    setEditingId(init.id)
    setEditForm({
      nom: init.nom,
      semaine_depart: String(init.semaine_depart),
      semaine_deadline: String(init.semaine_deadline),
      objectif_increments: String(init.objectif_increments),
    })
  }

  async function submitEdit() {
    if (editingId === null) return
    const nom = editForm.nom.trim()
    const sd = Number(editForm.semaine_depart), sD = Number(editForm.semaine_deadline), obj = Number(editForm.objectif_increments)
    if (!nom || !sd || !sD || !obj) return
    await updateInitiative.mutateAsync({ id: editingId, updates: { nom, semaine_depart: sd, semaine_deadline: sD, objectif_increments: obj } })
    setEditingId(null)
  }

  type IncField = 'valeur' | 'objectif_texte' | 'statut'
  const cellKey = (field: IncField, initId: number, semaine: number) => `${field}:${initId}:${semaine}`

  // Une semaine peut porter valeur / objectif_texte / statut indépendamment
  // — on ne touche que le champ modifié (upsert partiel, cf. useScorecard),
  // et on ne supprime la ligne que si les 3 champs finissent tous vides.
  async function applyField(initId: number, semaine: number, field: IncField, next: number | string | null, row: ScorecardIncrement | undefined) {
    const resultValeur = field === 'valeur' ? (next as number | null) : (row?.valeur ?? null)
    const resultTexte  = field === 'objectif_texte' ? (next as string | null) : (row?.objectif_texte ?? null)
    const resultStatut = field === 'statut' ? (next as ScorecardStatut | null) : (row?.statut ?? null)
    if (resultValeur == null && !resultTexte && !resultStatut) {
      if (row) await deleteIncrement.mutateAsync(row.id)
      return
    }
    const patch: { initiative_id: number; semaine: number; valeur?: number | null; objectif_texte?: string | null; statut?: ScorecardStatut | null } = { initiative_id: initId, semaine }
    if (field === 'valeur') patch.valeur = resultValeur
    if (field === 'objectif_texte') patch.objectif_texte = resultTexte
    if (field === 'statut') patch.statut = resultStatut
    await upsertIncrement.mutateAsync(patch)
  }

  async function commitCell(initId: number, semaine: number, field: 'valeur' | 'objectif_texte', row: ScorecardIncrement | undefined) {
    const key = cellKey(field, initId, semaine)
    const draft = cellDrafts[key]
    if (draft === undefined) return
    const trimmed = draft.trim()
    if (field === 'valeur') {
      if (trimmed !== '' && !Number.isFinite(Number(trimmed))) { setCellDrafts(prev => { const n = { ...prev }; delete n[key]; return n }); return }
      await applyField(initId, semaine, 'valeur', trimmed === '' ? null : Number(trimmed), row)
    } else {
      await applyField(initId, semaine, 'objectif_texte', trimmed === '' ? null : trimmed, row)
    }
    setCellDrafts(prev => { const next = { ...prev }; delete next[key]; return next })
  }

  async function setStatut(initId: number, semaine: number, value: '' | ScorecardStatut, row: ScorecardIncrement | undefined) {
    await applyField(initId, semaine, 'statut', value === '' ? null : value, row)
  }

  // Grille de saisie hebdo (cumul livré + objectif qualitatif/statut) —
  // partagée entre la carte d'initiative repliable et la modale zoom, qui
  // veut pouvoir saisir sans revenir à la carte. Fonction simple (pas un
  // composant séparé) : elle ne fait que lire/appeler les closures ci-dessus,
  // aucun hook à isoler dans un fiber dédié.
  function renderWeeklyTables(init: ScorecardInitiative, incs: ScorecardIncrement[]) {
    const byWeek = new Map(incs.map(i => [i.semaine, i] as const))
    return (
      <div className="flex flex-col gap-2">
        {/* Cumul livré — une colonne par semaine, façon tableur */}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="border-collapse text-[11px] w-full">
            <thead>
              <tr>
                <th className="border-b border-r border-border px-1.5 py-1 text-left font-semibold text-subtle bg-bg whitespace-nowrap">Cumul livré</th>
                {initiativeWeekRange(init).map(w => (
                  <th key={w} className={cn('border-b border-r border-border last:border-r-0 px-0.5 py-1 font-semibold whitespace-nowrap',
                    w === curWeek ? 'bg-indigo-50 text-indigo-700' : 'bg-bg text-subtle')}>
                    S{w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-r border-border px-1.5 py-1 text-subtle whitespace-nowrap">valeur</td>
                {initiativeWeekRange(init).map(w => {
                  const row = byWeek.get(w)
                  const key = cellKey('valeur', init.id, w)
                  const value = cellDrafts[key] ?? (row?.valeur != null ? String(row.valeur) : '')
                  return (
                    <td key={w} className="border-r border-border last:border-r-0 p-0">
                      <input type="number" value={value} title={`Cumul livré — semaine ${w}`}
                        onChange={e => setCellDrafts(p => ({ ...p, [key]: e.target.value }))}
                        onBlur={() => commitCell(init.id, w, 'valeur', row)}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        className="w-11 text-center py-1 text-[11px] bg-transparent outline-none focus:bg-indigo-50" />
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
        {/* Objectif hebdo qualitatif + statut atteint/non atteint —
            une ligne par semaine, plus lisible qu'en colonnes pour
            du texte libre. */}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="border-collapse text-[11px] w-full">
            <thead>
              <tr>
                <th className="border-b border-r border-border px-1.5 py-1 text-left font-semibold text-subtle bg-bg w-12">N° S</th>
                <th className="border-b border-r border-border px-1.5 py-1 text-left font-semibold text-subtle bg-bg">Objectif</th>
                <th className="border-b border-border px-1.5 py-1 text-left font-semibold text-subtle bg-bg w-16">OK/KO</th>
              </tr>
            </thead>
            <tbody>
              {initiativeWeekRange(init).map(w => {
                const row = byWeek.get(w)
                const texteKey = cellKey('objectif_texte', init.id, w)
                const texteValue = cellDrafts[texteKey] ?? (row?.objectif_texte ?? '')
                return (
                  <tr key={w} className={w === curWeek ? 'bg-indigo-50/40' : undefined}>
                    <td className={cn('border-r border-t border-border px-1.5 py-0.5 font-semibold whitespace-nowrap', w === curWeek ? 'text-indigo-700' : 'text-subtle')}>S{w}</td>
                    <td className="border-r border-t border-border p-0">
                      <input type="text" value={texteValue} placeholder="—" title={`Objectif — semaine ${w}`}
                        onChange={e => setCellDrafts(p => ({ ...p, [texteKey]: e.target.value }))}
                        onBlur={() => commitCell(init.id, w, 'objectif_texte', row)}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        className="w-full px-1.5 py-0.5 text-[11px] bg-transparent outline-none focus:bg-indigo-50" />
                    </td>
                    <td className="border-t border-border p-0.5">
                      <select value={row?.statut ?? ''} title={`Statut — semaine ${w}`}
                        onChange={e => setStatut(init.id, w, e.target.value as '' | ScorecardStatut, row)}
                        className={cn('w-full text-[11px] font-semibold rounded-md py-0.5 outline-none border-0 bg-transparent',
                          row?.statut === 'OK' ? 'text-emerald-600' : row?.statut === 'KO' ? 'text-rose-600' : 'text-subtle/50')}>
                        <option value="">—</option>
                        <option value="OK">OK</option>
                        <option value="KO">KO</option>
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (isLoading) return <EmptyHint>Chargement…</EmptyHint>

  const zoomedInit = initiatives.find(i => i.id === zoomedId) ?? null

  return (
    <div className="flex flex-col gap-3">
      {!initiatives.length && !adding && <EmptyHint>Aucune initiative — ajoute la première ci-dessous</EmptyHint>}
      {/* 3 cartes maximum par ligne, chacune avec sa courbe de progression
          verticale — au-delà, ça repasse à la ligne (grid), la page scrolle
          si besoin. */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
      {initiatives.map(init => {
        const incs = incsFor(init.id)
        const withValeur = incs.filter(i => i.valeur != null)
        const actual = withValeur[withValeur.length - 1]?.valeur ?? 0
        const span = Math.max(1, init.semaine_deadline - init.semaine_depart)
        const idealPct = Math.min(100, Math.max(0, (curWeek - init.semaine_depart) / span * 100))
        const actualPct = init.objectif_increments > 0 ? actual / init.objectif_increments * 100 : 0
        const ahead  = actualPct >= idealPct
        const behind = actualPct < idealPct - 5
        const isExpanded = expanded.has(init.id)
        const cardSize = cardSizes[init.id] ?? 'sm'
        return (
          <div key={init.id} className={cn('border border-border rounded-xl p-2.5', CARD_SIZE_CLASS[cardSize])}>
            {editingId === init.id ? (
              <div className="flex flex-col gap-1.5">
                <input autoFocus value={editForm.nom} placeholder="Nom de l'initiative"
                  onChange={e => setEditForm(f => ({ ...f, nom: e.target.value }))}
                  className="ds-input !py-1 !px-2 text-xs" />
                <div className="flex gap-1.5">
                  <input type="number" placeholder="Sem. départ" value={editForm.semaine_depart}
                    onChange={e => setEditForm(f => ({ ...f, semaine_depart: e.target.value }))}
                    className="ds-input !py-1 !px-2 text-xs flex-1 min-w-0" />
                  <input type="number" placeholder="Sem. deadline" value={editForm.semaine_deadline}
                    onChange={e => setEditForm(f => ({ ...f, semaine_deadline: e.target.value }))}
                    className="ds-input !py-1 !px-2 text-xs flex-1 min-w-0" />
                  <input type="number" placeholder="Objectif" value={editForm.objectif_increments}
                    onChange={e => setEditForm(f => ({ ...f, objectif_increments: e.target.value }))}
                    className="ds-input !py-1 !px-2 text-xs flex-1 min-w-0" />
                </div>
                <div className="flex gap-1.5 justify-end">
                  <button onClick={() => setEditingId(null)} className="ds-btn ds-btn-sm">Annuler</button>
                  <button onClick={submitEdit} disabled={updateInitiative.isPending} className="ds-btn-primary ds-btn-sm">Enregistrer</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-bold text-navy truncate flex-1">{init.nom}</span>
                  <button onClick={() => cycleCardSize(init.id)} title="Taille de la carte (S/M/L)"
                    className="shrink-0 w-4 h-4 flex items-center justify-center rounded text-[9px] font-bold text-subtle/50 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                    {CARD_SIZE_LABEL[cardSize]}
                  </button>
                  <button onClick={() => startEdit(init)}
                    className="shrink-0 p-0.5 rounded text-subtle/50 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                    <Pencil size={11} />
                  </button>
                  <button onClick={() => removeInitiative(init.id, init.nom)}
                    className="shrink-0 p-0.5 rounded text-subtle/50 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                    <Trash2 size={11} />
                  </button>
                </div>
                <div className="flex items-center justify-between text-[11px] text-subtle mb-1">
                  <span>S{init.semaine_depart} → S{init.semaine_deadline}</span>
                  <span className={cn('font-bold tabular-nums',
                    ahead ? 'text-emerald-600' : behind ? 'text-rose-600' : 'text-amber-600')}>
                    {actual} / {init.objectif_increments}
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-bg overflow-visible mb-2">
                  <div className={cn('h-2 rounded-full transition-all',
                    ahead ? 'bg-emerald-400' : behind ? 'bg-rose-400' : 'bg-amber-400')}
                    style={{ width: `${Math.min(100, actualPct)}%` }} />
                  <Tooltip content={`Trajectoire idéale : semaine ${curWeek}`}>
                    <span className="absolute -top-1 w-0.5 h-4 bg-navy rounded-full cursor-help" style={{ left: `${idealPct}%` }} />
                  </Tooltip>
                </div>
                <div onClick={() => setZoomedId(init.id)} title="Agrandir le graphique"
                  className="relative group cursor-zoom-in rounded-lg hover:bg-bg/60 transition-colors">
                  <InitiativeSparkline weeks={initiativeWeeks(init, incs)} />
                  <Maximize2 size={11} className="absolute top-1 right-1 text-subtle/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <button onClick={() => toggleExpanded(init.id)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 mt-1.5">
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  Saisir le détail hebdo
                </button>
                {isExpanded && (
                  <div className="mt-1.5">
                    {renderWeeklyTables(init, incs)}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}
      </div>
      {adding ? (
        <div className="border border-dashed border-indigo-300 rounded-xl p-2.5 flex flex-col gap-1.5">
          <input autoFocus placeholder="Nom de l'initiative" value={form.nom}
            onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
            className="ds-input !py-1 !px-2 text-xs" />
          <div className="flex gap-1.5">
            <input type="number" placeholder="Sem. départ" value={form.semaine_depart}
              onChange={e => setForm(f => ({ ...f, semaine_depart: e.target.value }))}
              className="ds-input !py-1 !px-2 text-xs flex-1 min-w-0" />
            <input type="number" placeholder="Sem. deadline" value={form.semaine_deadline}
              onChange={e => setForm(f => ({ ...f, semaine_deadline: e.target.value }))}
              className="ds-input !py-1 !px-2 text-xs flex-1 min-w-0" />
            <input type="number" placeholder="Objectif" value={form.objectif_increments}
              onChange={e => setForm(f => ({ ...f, objectif_increments: e.target.value }))}
              className="ds-input !py-1 !px-2 text-xs flex-1 min-w-0" />
          </div>
          <div className="flex gap-1.5 justify-end">
            <button onClick={() => setAdding(false)} className="ds-btn ds-btn-sm">Annuler</button>
            <button onClick={submitAdd} disabled={createInitiative.isPending} className="ds-btn-primary ds-btn-sm">Ajouter</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="flex items-center justify-center gap-1.5 text-xs font-medium text-indigo-500 border border-dashed border-indigo-200 rounded-xl py-1.5 hover:bg-indigo-50 hover:border-indigo-300 transition-all">
          <Plus size={12} /> Nouvelle initiative
        </button>
      )}

      {zoomedInit && (
        <Modal open onClose={() => setZoomedId(null)} title={zoomedInit.nom} size="xl">
          <div className="flex items-center justify-between text-xs text-subtle mb-3">
            <span>S{zoomedInit.semaine_depart} → S{zoomedInit.semaine_deadline}</span>
            <span className="font-bold text-navy">
              {incsFor(zoomedInit.id)[incsFor(zoomedInit.id).length - 1]?.valeur ?? 0} / {zoomedInit.objectif_increments} incréments livrés
            </span>
          </div>
          <InitiativeProgressDetail weeks={initiativeWeeks(zoomedInit, incsFor(zoomedInit.id))} />
          <button onClick={() => toggleExpanded(zoomedInit.id)}
            className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 mt-4 mb-1.5">
            {expanded.has(zoomedInit.id) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Saisir le détail hebdo
          </button>
          {expanded.has(zoomedInit.id) && renderWeeklyTables(zoomedInit, incsFor(zoomedInit.id))}
        </Modal>
      )}
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
  { key: 'chart_statuts',    label: 'Graphe statuts',     description: 'Répartition des statuts par produit',          icon: <Rows3 size={13} />,         defaultSize: { w: 6, h: 6 }, minW: 4, minH: 4, render: ctx => <PortfolioStatutsChart produits={ctx.produits} allTaches={ctx.allTaches} scope={ctx.scope} /> },
  { key: 'chart_tendance',   label: 'Tendance trimestrielle', description: 'Avancement et budgets par trimestre',      icon: <LineChart size={13} />,     defaultSize: { w: 12, h: 6 }, minW: 6, minH: 4, render: ctx => <PortfolioTendanceChart produits={ctx.produits} /> },
  { key: 'charge',      label: 'Charge équipe',        description: 'Allocation vs capacité sur 4 semaines',         icon: <Users size={13} />,         defaultSize: { w: 4, h: 5 }, minW: 3, minH: 3, render: ctx => <ChargeEquipeWidget ctx={ctx} /> },
  { key: 'scorecard',   label: 'ROCKS',                description: 'Incréments livrés par initiative vs objectif',  icon: <Rocket size={13} />,        defaultSize: { w: 12, h: 12 }, minW: 6, minH: 6, render: ScorecardWidget },
]

export const WIDGET_BY_KEY = new Map(WIDGETS.map(w => [w.key, w]))
