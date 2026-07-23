import { useState, useMemo } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, LineChart as RLineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, Cell,
} from 'recharts'
import { Gantt as SvarGantt, Willow, type ITask } from '@svar-ui/react-gantt'
import '@svar-ui/react-gantt/all.css'
import { Tooltip } from '@/components/ui/Tooltip'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { cn, epicShortName, formatSprintLabel } from '@/lib/utils'
import { scopedMetrics, computeBurndownWeeks } from '@/utils/produitMetrics'
import type { MultiScope, ProduitMetrics, BurndownDoneEntry } from '@/utils/produitMetrics'
import { trimAvancement } from '@/hooks/useProduits'
import type { Produit } from '@/hooks/useProduits'
import type { Tache, Statut, Sprint } from '@/types'

// ── Palette statuts (reprend les couleurs pill- déjà établies dans index.css, ajustées pour la validation daltonisme) ──
const STATUT_ORDER: Statut[] = ['À faire', 'En cours', 'Fait', 'Bloqué']
const STATUT_COLORS: Record<Statut, string> = {
  'À faire':   '#6366F1',
  'En cours':  '#F59E0B',
  'Fait':      '#10B981',
  'Bloqué':    '#F43F5E',
  // N'apparaît jamais dans STATUT_ORDER (jamais sur taches.statut) — entrée
  // requise par Record<Statut,...> une fois le type élargi.
  'Transféré': '#94A3B8',
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-white rounded-2xl overflow-hidden shadow-md">
      <div className="px-4 py-3 border-b border-border bg-slate-50">
        <span className="text-xs font-bold text-navy uppercase tracking-wider">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

// ── Tooltip commun, calé sur le style ds-card ────────────────────
function ChartTooltip({ active, payload, label, valueFormatter }: {
  active?: boolean; label?: string
  payload?: { name: string; value: number | null; color: string }[]
  valueFormatter?: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  const fmt = valueFormatter ?? ((v: number) => `${v}`)
  return (
    <div className="bg-card rounded-xl shadow-lg border border-border px-3 py-2 text-xs min-w-[120px]">
      {label && <div className="font-semibold text-navy mb-1">{label}</div>}
      <div className="flex flex-col gap-1">
        {payload.filter(p => p.value !== null).map(p => (
          <div key={p.name} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-subtle flex-1 truncate">{p.name}</span>
            <span className="font-bold text-navy tabular-nums">{fmt(p.value!)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const AXIS_TICK = { fontSize: 10, fill: '#94A3B8' }

// ── Barre horizontale (1 série) — hauteur toujours calée sur le nombre de lignes ──
function HorizontalBarChart({ data, colorFor, valueFormatter }: {
  data: { label: string; value: number }[]
  colorFor: (label: string) => string
  valueFormatter?: (v: number) => string
}) {
  if (data.length === 0) return <p className="text-xs text-subtle italic">Aucune donnée.</p>
  const h = 28 + data.length * 34
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }} barCategoryGap="24%">
        <CartesianGrid horizontal={false} stroke="#EEF1F6" />
        <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={110} tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <RTooltip cursor={{ fill: '#F8FAFC' }}
          content={({ active, label, payload }) => (
            <ChartTooltip active={active} label={label as string} valueFormatter={valueFormatter}
              payload={payload?.map(p => ({ name: label as string, value: p.value as number, color: colorFor(label as string) }))} />
          )} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={20} isAnimationActive>
          {data.map(d => <Cell key={d.label} fill={colorFor(d.label)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Barres verticales (colonnes), 1 série ─────────────────────────
function VerticalBarChart({ data, colorFor, valueFormatter }: {
  data: { label: string; value: number }[]
  colorFor: (label: string) => string
  valueFormatter?: (v: number) => string
}) {
  if (data.length === 0) return <p className="text-xs text-subtle italic">Aucune donnée.</p>
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -12 }} barCategoryGap="24%">
        <CartesianGrid vertical={false} stroke="#EEF1F6" />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} angle={-25} textAnchor="end" height={54} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
        <RTooltip cursor={{ fill: '#F8FAFC' }}
          content={({ active, label, payload }) => (
            <ChartTooltip active={active} label={label as string} valueFormatter={valueFormatter}
              payload={payload?.map(p => ({ name: label as string, value: p.value as number, color: colorFor(label as string) }))} />
          )} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={44} isAnimationActive>
          {data.map(d => <Cell key={d.label} fill={colorFor(d.label)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Barre verticale empilée (répartition statuts, un seul produit) ──
export function VerticalStackedStatutChart({ taches }: { taches: Tache[] }) {
  const total = taches.length
  const data = [{ label: 'Statuts', ...Object.fromEntries(STATUT_ORDER.map(s => [s, taches.filter(t => t.statut === s).length])) }]
  if (total === 0) return <p className="text-xs text-subtle italic">Aucune tâche pour ce produit.</p>
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
        <CartesianGrid vertical={false} stroke="#EEF1F6" />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
        <RTooltip cursor={{ fill: '#F8FAFC' }}
          content={({ active, payload }) => (
            <ChartTooltip active={active} label={`${total} tâche${total > 1 ? 's' : ''}`}
              payload={payload?.map(p => ({ name: p.dataKey as string, value: p.value as number, color: STATUT_COLORS[p.dataKey as Statut] }))} />
          )} />
        <Legend
          formatter={(value: string) => <span className="text-[11px] text-slate-500">{value}</span>}
          iconType="circle" iconSize={8} wrapperStyle={{ paddingTop: 8 }} />
        {STATUT_ORDER.map(s => (
          <Bar key={s} dataKey={s} stackId="statut" fill={STATUT_COLORS[s]} stroke="#fff" strokeWidth={2} maxBarSize={64} isAnimationActive />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Barre(s) empilée(s) compacte(s) — répartition statuts, sans axes (juste des pilules) ──
function StackedStatutRows({ rows }: { rows: { label: string; taches: Tache[] }[] }) {
  if (rows.length === 0) return <p className="text-xs text-subtle italic">Aucune donnée.</p>
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map(r => {
        const total = r.taches.length
        const counts = STATUT_ORDER.map(s => ({ s, n: r.taches.filter(t => t.statut === s).length })).filter(c => c.n > 0)
        return (
          <div key={r.label} className="flex items-center gap-3">
            <span className="w-32 truncate text-xs text-navy font-medium shrink-0" title={r.label}>{r.label}</span>
            {total === 0 ? (
              <div className="flex-1 h-2.5 rounded-full bg-slate-100" />
            ) : (
              <Tooltip content={counts.map(c => `${c.s} : ${c.n}`).join('\n')} className="flex-1">
                <div className="flex w-full gap-[2px] cursor-help" style={{ height: 10 }}>
                  {counts.map((c, i) => (
                    <div key={c.s}
                      className={cn(i === 0 && 'rounded-l-full', i === counts.length - 1 && 'rounded-r-full')}
                      style={{ width: `${c.n / total * 100}%`, background: STATUT_COLORS[c.s] }} />
                  ))}
                </div>
              </Tooltip>
            )}
            <span className="w-10 text-right text-xs font-bold text-navy tabular-nums shrink-0">{total}</span>
          </div>
        )
      })}
      <div className="flex items-center gap-4 flex-wrap mt-1.5 pt-3 border-t border-slate-100">
        {STATUT_ORDER.map(s => (
          <span key={s} className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: STATUT_COLORS[s] }} />
            {s}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Courbe (1..N séries, un seul axe) ────────────────────────────
export interface LineSeries { id: string; label: string; color: string; dash?: boolean; points: { x: string; y: number | null }[] }

function TrendLineChart({ categories, series, valueFormatter }: {
  categories: string[]; series: LineSeries[]; valueFormatter?: (v: number) => string
}) {
  if (categories.length === 0 || series.every(s => s.points.every(p => p.y === null))) {
    return <p className="text-xs text-subtle italic">Pas encore de données à tracer.</p>
  }
  const data = categories.map((c, i) => {
    const row: Record<string, string | number | null> = { x: c }
    series.forEach(s => { row[s.id] = s.points[i]?.y ?? null })
    return row
  })
  return (
    <ResponsiveContainer width="100%" height={240}>
      <RLineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
        <CartesianGrid vertical={false} stroke="#EEF1F6" />
        <XAxis dataKey="x" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <RTooltip cursor={{ stroke: '#E2E8F0' }}
          content={({ active, label, payload }) => (
            <ChartTooltip active={active} label={label as string} valueFormatter={valueFormatter}
              payload={payload?.map(p => ({ name: series.find(s => s.id === p.dataKey)?.label ?? String(p.dataKey), value: p.value as number, color: p.color as string }))} />
          )} />
        {series.length > 1 && <Legend
          formatter={(value: string) => <span className="text-[11px] text-slate-500">{series.find(s => s.id === value)?.label ?? value}</span>}
          iconType="circle" iconSize={8} wrapperStyle={{ paddingTop: 8 }} />}
        {series.map(s => (
          <Line key={s.id} type="monotone" dataKey={s.id} name={s.id} stroke={s.color} strokeWidth={2}
            strokeDasharray={s.dash ? '5 4' : undefined}
            dot={s.dash ? false : { r: 3.5, fill: '#fff', stroke: s.color, strokeWidth: 2 }}
            activeDot={{ r: 5 }} connectNulls={false} isAnimationActive />
        ))}
      </RLineChart>
    </ResponsiveContainer>
  )
}

function trimSortKey(id: string): number {
  const m = id.match(/Q([1-4])[- ](\d{4})/i)
  if (!m) return 0
  return parseInt(m[2], 10) * 10 + parseInt(m[1], 10)
}

type TrimMetric = 'avancement' | 'etp' | 'invest' | 'achats'
const TRIM_METRIC_LABEL: Record<TrimMetric, string> = {
  avancement: 'Avancement objectifs (%)', etp: 'Budget ETP consommé (%)',
  invest: 'Budget Invest consommé (%)', achats: 'Budget Achats consommé (%)',
}

// ── Graphiques portefeuille (widgets du cockpit) ─────────────────
export function PortfolioAvancementChart({ produits, metricsMap, scope }: {
  produits: Produit[]; metricsMap: Map<number, ProduitMetrics>; scope: MultiScope
}) {
  if (produits.length === 0) return null
  const colorByNom = new Map(produits.map(p => [p.nom, p.couleur ?? '#4A4CC8']))
  const avancementData = produits.map(p => {
    const m = metricsMap.get(p.id)
    const s = m ? scopedMetrics(m, scope) : null
    return { label: p.nom, value: s?.backlogPct ?? 0 }
  }).sort((a, b) => b.value - a.value)
  return <HorizontalBarChart data={avancementData} colorFor={l => colorByNom.get(l) ?? '#4A4CC8'} valueFormatter={v => `${v}%`} />
}

export function PortfolioStatutsChart({ produits, allTaches, scope }: {
  produits: Produit[]; allTaches: Tache[]; scope: MultiScope
}) {
  if (produits.length === 0) return null
  // En scope Trimestre, restreint aux US du trimestre ACTIF de chaque produit
  // (même logique que RepartitionWidget/computeProduitMetrics) — sinon ce
  // graphe affichait toujours le total global tous sprints confondus.
  const statutRows = produits.map(p => {
    const currentTrim = scope === 'trim'
      ? [...(p.objectifs_trimestriels ?? [])].reverse().find(o => !!o.lance && !o.pause && !o.cloture) : null
    const trimSprintSet = new Set<string>(currentTrim?.sprints_ids ?? [])
    return {
      label: p.nom,
      taches: allTaches.filter(t => t.produit_id === p.id && t.type_tache !== 'Conteneur'
        && (scope !== 'trim' || (!!t.sprint_debut && trimSprintSet.has(t.sprint_debut)))),
    }
  })
  return <StackedStatutRows rows={statutRows} />
}

export function PortfolioTendanceChart({ produits }: { produits: Produit[] }) {
  const [trimMetric, setTrimMetric] = useState<TrimMetric>('avancement')
  if (produits.length === 0) return null

  const trimIds = new Set<string>()
  produits.forEach(p => (p.objectifs_trimestriels ?? []).forEach(t => trimIds.add(t.trimestre)))
  const categories = [...trimIds].sort((a, b) => trimSortKey(a) - trimSortKey(b))
  const trimSeries: LineSeries[] = produits.map(p => ({
    id: String(p.id), label: p.nom, color: p.couleur ?? '#4A4CC8',
    points: categories.map(tid => {
      const t = (p.objectifs_trimestriels ?? []).find(o => o.trimestre === tid)
      let y: number | null = null
      if (t) {
        if (trimMetric === 'avancement') y = trimAvancement(t)
        else if (trimMetric === 'etp'    && t.budget_etp)    y = Math.round((t.realise_etp    ?? 0) / t.budget_etp    * 100)
        else if (trimMetric === 'invest' && t.budget_invest) y = Math.round((t.realise_invest  ?? 0) / t.budget_invest * 100)
        else if (trimMetric === 'achats' && t.budget_achats) y = Math.round((t.realise_achats  ?? 0) / t.budget_achats * 100)
      }
      return { x: tid, y }
    }),
  }))

  return (
    <div>
      <div className="mb-3">
        <ToggleGroup value={trimMetric} onChange={setTrimMetric} options={[
          { key: 'avancement', label: 'Avancement' },
          { key: 'etp',        label: 'Budget ETP' },
          { key: 'invest',     label: 'Invest' },
          { key: 'achats',     label: 'Achats' },
        ]} />
      </div>
      <TrendLineChart categories={categories} series={trimSeries} valueFormatter={v => `${v}%`} />
      <p className="text-[11px] text-slate-400 mt-2">{TRIM_METRIC_LABEL[trimMetric]}, par trimestre.</p>
    </div>
  )
}

// ── Burndown trimestriel (reste à faire théorique vs réel, semaine par semaine) ──
// "Objectif" (pointillé) = pente idéale linéaire du total d'US à 0 sur toute la
// durée du trimestre. "Réalisé" (plein, vert) = US restantes réellement, à partir
// des dates de passage à "Fait" issues du journal d'activité — s'arrête à
// aujourd'hui, ne continue pas au-delà.
export function ProduitBurndownChart({ quarterStart, quarterEnd, objectif, doneDates, trimLabel, unitLabel = 'US', stepDays = 7, subsCount = 0 }: {
  quarterStart: Date | null; quarterEnd: Date | null; objectif: number; doneDates: BurndownDoneEntry[]; trimLabel?: string | null
  unitLabel?: string
  stepDays?: number
  // Nombre de sous-tâches comptées en plus des US racines (0 = case décochée).
  subsCount?: number
}) {
  if (!quarterStart || !quarterEnd || objectif === 0) {
    return <p className="text-xs text-subtle italic">Pas de période active avec des {unitLabel} planifiées pour ce périmètre.</p>
  }
  const weeks = computeBurndownWeeks(quarterStart, quarterEnd, objectif, doneDates, stepDays)
  if (weeks.length === 0) {
    return <p className="text-xs text-subtle italic">Cette période n'a pas encore commencé.</p>
  }
  const series: LineSeries[] = [
    { id: 'objectif', label: 'Objectif', color: '#94A3B8', dash: true, points: weeks.map(w => ({ x: w.label, y: w.objectif })) },
    { id: 'realise',  label: 'Réalisé',  color: '#10B981', points: weeks.map(w => ({ x: w.label, y: w.realise })) },
  ]
  return (
    <div>
      {/* Le graphe cumule US + sous-tâches quand la case est cochée (subsCount
          > 0) : le nombre affiché au survol ne peut alors pas être qualifié
          de "US" seul (ex: "59 US" alors que c'est 15 US + 44 sous-tâches) —
          libellé générique dans ce cas, cohérent avec la légende sous le
          graphe qui, elle, détaille la répartition. */}
      <TrendLineChart categories={weeks.map(w => w.label)} series={series}
        valueFormatter={v => subsCount > 0 ? `${v} restants (US + sous-tâches)` : `${v} ${unitLabel} restants`} />
      <p className="text-[11px] text-slate-400 mt-2">
        {/* `objectif` inclut les sous-tâches quand la case est cochée (c'est ce
            total qui pilote le graphe) — le texte affiche plutôt le nombre
            d'US seul, avec les sous-tâches en aside entre parenthèses. */}
        {trimLabel ? `${trimLabel} — ` : ''}{objectif - subsCount} {unitLabel}{subsCount > 0 ? ` (avec ${subsCount} sous-tâche${subsCount > 1 ? 's' : ''})` : ''} à écouler sur la période, reste à faire par {stepDays === 1 ? 'jour' : 'semaine'}.
      </p>
    </div>
  )
}

// Version compacte (sparkline) sans axes ni légende, pour une ligne de tableau.
export function BurndownSparkline({ quarterStart, quarterEnd, objectif, doneDates }: {
  quarterStart: Date | null; quarterEnd: Date | null; objectif: number; doneDates: BurndownDoneEntry[]
}) {
  if (!quarterStart || !quarterEnd || objectif === 0) return null
  const weeks = computeBurndownWeeks(quarterStart, quarterEnd, objectif, doneDates)
  if (weeks.length < 2) return null
  const lastReal = [...weeks].reverse().find(w => w.realise !== null)
  return (
    <Tooltip content={lastReal ? `Burndown trimestre : ${lastReal.realise}/${objectif} US restantes` : `Objectif : ${objectif} US`}>
      <ResponsiveContainer width={72} height={28}>
        <RLineChart data={weeks} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line type="monotone" dataKey="objectif" stroke="#CBD5E1" strokeWidth={1.5} strokeDasharray="2 2" dot={false} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="realise" stroke="#10B981" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
        </RLineChart>
      </ResponsiveContainer>
    </Tooltip>
  )
}

type SprintMetric = 'avancement' | 'effort' | 'us'
const SPRINT_METRIC_CFG: Record<SprintMetric, { label: string; color: string; get: (s: Sprint) => number | null; fmt: (v: number) => string }> = {
  avancement: { label: 'Avancement (%)',     color: '#6366F1', get: s => s.stats?.pct ?? null,    fmt: v => `${v}%` },
  effort:     { label: 'Effort réalisé (j)', color: '#F59E0B', get: s => s.stats?.effort ?? null, fmt: v => `${v} j` },
  us:         { label: 'US terminées',       color: '#10B981', get: s => s.stats?.fait ?? null,   fmt: v => `${v}` },
}


// ── Briques par produit (widgets du dashboard produit) ───────────
export function ProduitEpicsChart({ taches, epicColors }: { taches: Tache[]; epicColors?: Map<string, string> }) {
  const byEpic = new Map<string, number>()
  taches.forEach(t => { if (t.epic) byEpic.set(t.epic, (byEpic.get(t.epic) ?? 0) + 1) })
  const epicData = [...byEpic.entries()].map(([epic, n]) => ({ label: epicShortName(epic), fullEpic: epic, value: n })).sort((a, b) => b.value - a.value)
  const epicColorByLabel = new Map(epicData.map(e => [e.label, epicColors?.get(e.fullEpic) ?? '#6366F1']))
  if (epicData.length === 0) return <p className="text-xs text-subtle/40 italic p-2">Aucun épic dans les tâches</p>
  return <VerticalBarChart data={epicData} colorFor={l => epicColorByLabel.get(l) ?? '#6366F1'} />
}

export function ProduitTendanceSprintChart({ sprints }: { sprints: Sprint[] }) {
  const [sprintMetric, setSprintMetric] = useState<SprintMetric>('avancement')
  const sprintsWithStats = sprints.filter(s => s.stats)
  const cfg = SPRINT_METRIC_CFG[sprintMetric]
  const sprintSeries: LineSeries[] = [{
    id: 'sprint', label: cfg.label, color: cfg.color,
    points: sprintsWithStats.map(s => ({ x: formatSprintLabel(s.numero), y: cfg.get(s) })),
  }]
  if (sprintsWithStats.length === 0) return <p className="text-xs text-subtle/40 italic p-2">Aucun sprint clôturé avec statistiques</p>
  return (
    <div>
      <div className="mb-3">
        <ToggleGroup value={sprintMetric} onChange={setSprintMetric} options={[
          { key: 'avancement', label: 'Avancement' },
          { key: 'effort',     label: 'Effort réalisé' },
          { key: 'us',         label: 'US terminées' },
        ]} />
      </div>
      <TrendLineChart categories={sprintsWithStats.map(s => formatSprintLabel(s.numero))} series={sprintSeries} valueFormatter={cfg.fmt} />
    </div>
  )
}

// ── Vue Par produit ──────────────────────────────────────────────
// ── Roadmap maison (Epics ou Jalons dans le temps) ────────────────
// Même vocabulaire visuel que Plan de charges : barres pastel arrondies,
// remplissage = avancement, marqueur "aujourd'hui".
type RoadmapMode = 'epic' | 'jalon'

interface RoadmapRow { key: string; label: string; color: string; start: Date; end: Date; progress: number; n: number }

function buildSprintDateIndex(sprints: Sprint[]): Map<string, { start: Date; end: Date }> {
  const map = new Map<string, { start: Date; end: Date }>()
  sprints.forEach(s => {
    if (!s.started_at) return
    const start = new Date(s.started_at)
    const end = s.closed_at ? new Date(s.closed_at) : new Date(start.getTime() + 14 * 86400000)
    map.set(s.numero, { start, end })
  })
  return map
}

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function buildRoadmapRows(taches: Tache[], sprintDates: Map<string, { start: Date; end: Date }>, mode: RoadmapMode,
  epicColors: Map<string, string>, jalonColors: Map<string, string>): RoadmapRow[] {
  const groups = new Map<string, Tache[]>()
  taches.forEach(t => {
    const key = mode === 'epic' ? t.epic : t.jalon
    if (!key) return
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  })

  const rows: RoadmapRow[] = []
  groups.forEach((groupTaches, key) => {
    let start: Date | null = null
    let end: Date | null = null
    groupTaches.forEach(t => {
      // `t.sprint` (l'ancien champ) porte une valeur par défaut ('S01'
      // constaté en base) sur la quasi-totalité des tâches — seul
      // sprint_debut est fiable (même bug corrigé dans sprintEligibility.ts).
      const sp = t.sprint_debut ? sprintDates.get(t.sprint_debut) : undefined
      if (!sp) return
      if (start === null || sp.start.getTime() < start.getTime()) start = sp.start
      if (end === null || sp.end.getTime() > end.getTime()) end = sp.end
    })
    if (start === null || end === null) return
    const done = groupTaches.filter(t => t.statut === 'Fait').length
    rows.push({
      key, label: mode === 'epic' ? epicShortName(key) : key,
      color: mode === 'epic' ? (epicColors.get(key) ?? '#6366F1') : (jalonColors.get(key) ?? '#6366F1'),
      start, end, progress: groupTaches.length ? Math.round(done / groupTaches.length * 100) : 0,
      n: groupTaches.length,
    })
  })
  return rows.sort((a, b) => a.start.getTime() - b.start.getTime())
}

// Colonnes de la grille de gauche : le pourcentage y est toujours lisible et jamais
// coupé, contrairement à un libellé posé dans la barre (illisible sur les barres
// courtes selon le niveau de zoom).
// Bar sans libellé : le nom de l'Epic/Jalon est déjà affiché dans la colonne "Nom" à gauche
function EmptyBarContent() { return null }

const ROADMAP_COLUMNS = [
  { id: 'text', header: 'Nom', flexgrow: 1, align: 'left' as const },
  {
    id: 'progress', header: '%', width: 52, align: 'center' as const,
    cell: ({ row }: { row: { progress?: number } }) => (
      <span className="text-xs font-bold text-navy">{row.progress ?? 0}%</span>
    ),
  },
]

export function RoadmapChart({ produit, taches, sprints, epicColors, jalonColors }: {
  produit: Produit; taches: Tache[]; sprints: Sprint[]
  epicColors?: Map<string, string>; jalonColors?: Map<string, string>
}) {
  const [mode, setMode] = useState<RoadmapMode>('epic')
  const sprintDates = useMemo(() => buildSprintDateIndex(sprints), [sprints])
  const rows = useMemo(() => buildRoadmapRows(taches, sprintDates, mode, epicColors ?? new Map(), jalonColors ?? new Map()),
    [taches, sprintDates, mode, epicColors, jalonColors])

  const ganttTasks: ITask[] = useMemo(() => rows.map(r => ({
    id: r.key, text: r.label, start: r.start, end: r.end, progress: r.progress, type: slugify(r.key),
  })), [rows])

  const taskTypes = useMemo(() => rows.map(r => ({ id: slugify(r.key), label: r.label })), [rows])

  // Une couleur par Epic/Jalon (mêmes couleurs que le reste de l'app) via une classe CSS par type de tâche.
  // Piste = teinte pastel de la couleur, remplissage = couleur pleine (variable héritée
  // --wx-gantt-task-fill-color) — sinon piste et remplissage se confondent, aucun contraste visible.
  const colorCss = useMemo(() => rows.map(r => `
    .wx-gantt .wx-bar.wx-task.${slugify(r.key)} {
      background-color: ${r.color}2e;
      --wx-gantt-task-fill-color: ${r.color};
    }
  `).join('\n'), [rows])

  return (
    <ChartCard title={`Roadmap — ${produit.nom}`}>
      <div className="mb-4">
        <ToggleGroup value={mode} onChange={setMode} options={[
          { key: 'epic',  label: 'Epics' },
          { key: 'jalon', label: 'Jalons - Incréments majeurs' },
        ]} />
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-subtle italic">
          Pas assez de sprints datés pour construire une roadmap — renseigne les dates de début/clôture des sprints dans Setup.
        </p>
      ) : (
        <div className="rounded-xl overflow-hidden border border-slate-100" style={{ height: Math.max(220, 70 + rows.length * 38) }}>
          <style>{colorCss}</style>
          <Willow>
            <SvarGantt tasks={ganttTasks} taskTypes={taskTypes} columns={ROADMAP_COLUMNS} readonly
              gridWidth={210} cellWidth={40} cellHeight={38} scaleHeight={36} taskTemplate={EmptyBarContent} />
          </Willow>
        </div>
      )}
    </ChartCard>
  )
}
