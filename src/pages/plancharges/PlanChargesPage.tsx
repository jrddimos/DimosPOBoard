import { useState, useMemo, useEffect, useRef } from 'react'
import { Layout } from '@/components/layout/Layout'
import { Spinner } from '@/components/ui/Spinner'
import { useProduits } from '@/hooks/useProduits'
import type { Produit, TrimObjectif } from '@/hooks/useProduits'
import { usePlanCharges, useUpsertPlanCharge } from '@/hooks/usePlanCharges'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight } from 'lucide-react'

// ── ISO week helpers ──────────────────────────────────────────
interface WeekInfo { semaine: number; lundi: Date }

function getWeeksForYear(year: number): WeekInfo[] {
  const jan4 = new Date(year, 0, 4)
  const dow   = jan4.getDay() || 7
  const first = new Date(jan4)
  first.setDate(jan4.getDate() - dow + 1)
  const weeks: WeekInfo[] = []
  const cur = new Date(first)
  for (let w = 1; w <= 53; w++) {
    const thu = new Date(cur); thu.setDate(cur.getDate() + 3)
    if (thu.getFullYear() === year) weeks.push({ semaine: w, lundi: new Date(cur) })
    cur.setDate(cur.getDate() + 7)
  }
  return weeks
}

function fmtDayMonth(d: Date): string {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
}

// ── Quarter helpers ───────────────────────────────────────────
const Q_RANGE: Record<number, [number, number]> = { 1:[1,13], 2:[14,26], 3:[27,39], 4:[40,52] }

function parseTrimestre(t: string): { q: number; year: number } | null {
  const m = t.match(/Q([1-4])[^\d]*(\d{4})/i)
  if (!m) return null
  return { q: parseInt(m[1]), year: parseInt(m[2]) }
}

function getTrimForQ(p: Produit, q: number, year: number): TrimObjectif | undefined {
  return (p.objectifs_trimestriels ?? []).find(t => {
    const parsed = parseTrimestre(t.trimestre)
    return parsed?.q === q && parsed?.year === year
  })
}

// ── Statut dot ────────────────────────────────────────────────
const STATUT_DOT: Record<string, string> = {
  'On track': 'bg-green',
  'At risk':  'bg-orange',
  'Off track':'bg-red',
  'En pause': 'bg-subtle/30',
}

// ── Cell input ────────────────────────────────────────────────
function CellInput({ initVal, onSave, onCancel }: {
  initVal: number
  onSave: (v: number) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [val, setVal] = useState(initVal === 0 ? '' : String(initVal))
  useEffect(() => { ref.current?.select() }, [])

  function commit() {
    const n = parseFloat(val.replace(',', '.'))
    onSave(isNaN(n) ? 0 : Math.max(0, n))
  }

  return (
    <input ref={ref} type="text" inputMode="decimal" value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter')  { e.preventDefault(); commit() }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      className="w-full text-center text-[11px] font-semibold bg-blue/10 border border-blue/50 rounded outline-none py-0.5 text-blue tabular-nums"
    />
  )
}

// ── Format helpers ────────────────────────────────────────────
function fmtJ(v: number, decimals = 1): string {
  if (!v) return ''
  return v % 1 === 0 ? `${v}j` : `${v.toFixed(decimals)}j`
}

function fmtJSigné(v: number): string {
  if (v === 0) return '0j'
  const abs = Math.abs(v)
  const s   = v < 0 ? '−' : '+'
  return `${s}${abs % 1 === 0 ? abs : abs.toFixed(1)}j`
}

// ── Constants ─────────────────────────────────────────────────
const DEFAULT_JOURS_TRIM = 65
const COL_PRODUIT = 210
const COL_Q_ALLOC = 64   // "Saisi" sub-column (collapsed)
const COL_Q_RESTE = 72   // "Reste" sub-column (collapsed)
const COL_WK      = 52   // week column (expanded)

// ── Page ─────────────────────────────────────────────────────
export default function PlanChargesPage() {
  const today   = new Date()
  const curYear = today.getFullYear()

  const [annee,     setAnnee]     = useState(curYear)
  const [expandedQ, setExpandedQ] = useState<Set<number>>(new Set())

  const { data: produits  = [], isLoading: loadP } = useProduits()
  const { data: planData  = [], isLoading: loadPl } = usePlanCharges(annee)
  const upsert = useUpsertPlanCharge()

  const allWeeks = useMemo(() => getWeeksForYear(annee), [annee])

  const quarters = useMemo(() => [1,2,3,4].map(q => ({
    q,
    label: `Q${q} ${annee}`,
    weeks: allWeeks.filter(w => w.semaine >= Q_RANGE[q][0] && w.semaine <= Q_RANGE[q][1]),
  })), [annee, allWeeks])

  // All active products (non-template), sorted by name
  const activeProduits = useMemo(() =>
    produits.filter(p => p.actif && !p.is_template)
            .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
  [produits])

  // plan_charges indexed by produit_id + semaine
  // On utilise epic='' assigne_a='' pour les entrées produit-niveau
  const planMap = useMemo(() => {
    const m = new Map<string, number>()
    planData.forEach(pc => {
      const k = `${pc.produit_id}|${pc.semaine}`
      m.set(k, (m.get(k) ?? 0) + pc.jours)
    })
    return m
  }, [planData])

  // Budget par produit par trimestre (en jours)
  function budgetQ(p: Produit, q: number): number {
    const t = getTrimForQ(p, q, annee)
    if (!t?.budget_etp) return 0
    return Math.round((t.budget_etp) * (t.jours_ouvres ?? DEFAULT_JOURS_TRIM) * 10) / 10
  }

  // Somme du prévisionnel saisi pour un produit sur un ensemble de semaines
  function allocForWeeks(produit_id: number, weeks: WeekInfo[]): number {
    return weeks.reduce((s, w) => s + (planMap.get(`${produit_id}|${w.semaine}`) ?? 0), 0)
  }

  // Budget restant = budget - alloué (peut être négatif = dépassement)
  function resteQ(p: Produit, q: number): number | null {
    const b = budgetQ(p, q)
    if (!b) return null
    const alloc = allocForWeeks(p.id, quarters.find(qt => qt.q === q)?.weeks ?? [])
    return Math.round((b - alloc) * 10) / 10
  }

  // Total restant à allouer sur l'année entière (pour badge dans la colonne sticky)
  function totalResteAnnee(p: Produit): { budget: number; alloue: number } {
    const budget = quarters.reduce((s, qt) => s + budgetQ(p, qt.q), 0)
    const alloue = quarters.reduce((s, qt) => s + allocForWeeks(p.id, qt.weeks), 0)
    return { budget: Math.round(budget * 10) / 10, alloue: Math.round(alloue * 10) / 10 }
  }

  // Editing cell state
  const [editCell, setEditCell] = useState<{ produit_id: number; semaine: number } | null>(null)

  function saveCell(produit_id: number, semaine: number, jours: number) {
    upsert.mutate({ produit_id, epic: '', assigne_a: '', semaine, annee, jours })
    setEditCell(null)
  }

  function toggleQ(q: number) {
    setExpandedQ(prev => {
      const next = new Set(prev)
      next.has(q) ? next.delete(q) : next.add(q)
      return next
    })
  }

  if (loadP || loadPl) return <Layout><Spinner /></Layout>

  const totalWidth = COL_PRODUIT + quarters.reduce((s, qt) => {
    return s + (expandedQ.has(qt.q) ? qt.weeks.length * COL_WK : COL_Q_ALLOC + COL_Q_RESTE)
  }, 0) + (COL_Q_ALLOC + COL_Q_RESTE)  // total

  // Color for "reste" value
  function resteColor(reste: number | null): string {
    if (reste === null) return 'text-subtle/40'
    if (reste < 0)  return 'text-red font-bold'
    if (reste === 0) return 'text-green font-semibold'
    if (reste < budgetQ({ objectifs_trimestriels: [] } as unknown as Produit, 0) * 0.2)
      return 'text-orange font-semibold'
    return 'text-subtle font-medium'
  }

  function resteColorSimple(reste: number | null): string {
    if (reste === null) return 'text-subtle/30'
    if (reste < 0)  return 'text-red font-bold'
    if (reste === 0) return 'text-green font-semibold'
    return 'text-orange/80 font-semibold'
  }

  return (
    <Layout>
      {/* ── Topbar ──────────────────────────────────────────── */}
      <div className="page-topbar -mx-3 -mt-3 mb-4 px-3 md:-mx-5 md:-mt-5 md:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-sm font-semibold text-navy">Plan de charges</h1>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-subtle">Année</span>
            <select value={annee} onChange={e => setAnnee(Number(e.target.value))}
              className="ds-select text-xs py-1 w-24">
              {[curYear - 1, curYear, curYear + 1].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>

          <div className="flex gap-2 ml-auto text-xs text-subtle">
            <button onClick={() => setExpandedQ(new Set([1,2,3,4]))}
              className="hover:text-navy transition-colors">Tout déplier</button>
            <span className="text-border">|</span>
            <button onClick={() => setExpandedQ(new Set())}
              className="hover:text-navy transition-colors">Tout replier</button>
          </div>
        </div>
      </div>

      {activeProduits.length === 0 ? (
        <div className="text-center py-16 text-subtle text-sm">
          <p>Aucun produit actif.</p>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse" style={{ minWidth: totalWidth }}>
              <thead>
                {/* ── Row 1 : Quarter labels ─────────────────── */}
                <tr className="border-b border-border/40 bg-navy/5">
                  <th className="sticky left-0 z-20 bg-navy/5 text-left px-4 py-2 border-r border-border"
                    style={{ width: COL_PRODUIT }} rowSpan={2}>
                    <span className="text-[10px] text-subtle uppercase tracking-wider">
                      Produit — Prévisionnel (jours)
                    </span>
                  </th>

                  {quarters.map(qt => {
                    const isExp    = expandedQ.has(qt.q)
                    const colSpan  = isExp ? qt.weeks.length : 2
                    const totAlloc = activeProduits.reduce((s, p) => s + allocForWeeks(p.id, qt.weeks), 0)
                    const totBudget = activeProduits.reduce((s, p) => s + budgetQ(p, qt.q), 0)

                    return (
                      <th key={qt.q} colSpan={colSpan} className="border-r border-border text-center py-0">
                        <button onClick={() => toggleQ(qt.q)}
                          className="w-full flex items-center justify-center gap-1.5 px-2 py-2 hover:bg-black/5 transition-colors">
                          {isExp
                            ? <ChevronDown  size={11} className="text-subtle shrink-0" />
                            : <ChevronRight size={11} className="text-subtle shrink-0" />}
                          <span className="font-bold text-navy text-xs">{qt.label}</span>
                          {!isExp && totBudget > 0 && (
                            <span className="text-[10px] text-subtle/60 tabular-nums">
                              {fmtJ(totAlloc)} / {fmtJ(totBudget)}
                            </span>
                          )}
                        </button>
                      </th>
                    )
                  })}

                  {/* Total header */}
                  <th colSpan={2} className="text-center py-2 text-[10px] font-bold text-navy/60 bg-navy/5 border-l border-border"
                    rowSpan={2}>
                    Total<br />année
                  </th>
                </tr>

                {/* ── Row 2 : Sub-labels ────────────────────── */}
                <tr className="bg-navy text-white border-b border-navy/20">
                  {quarters.map(qt => {
                    const isExp = expandedQ.has(qt.q)
                    if (isExp) {
                      return qt.weeks.map(w => (
                        <th key={w.semaine} className="text-center py-1.5 border-r border-white/10 font-semibold tabular-nums"
                          style={{ width: COL_WK }}>
                          <div className="text-[9px] text-white/50">{fmtDayMonth(w.lundi)}</div>
                          <div className="text-[10px]">S{String(w.semaine).padStart(2,'0')}</div>
                        </th>
                      ))
                    }
                    return [
                      <th key={`${qt.q}-a`} className="text-center py-2 border-r border-white/20 text-[10px] font-semibold text-white/90"
                        style={{ width: COL_Q_ALLOC }}>Saisi</th>,
                      <th key={`${qt.q}-r`} className="text-center py-2 border-r border-white/10 text-[10px] font-semibold text-white/60"
                        style={{ width: COL_Q_RESTE }}>Reste</th>,
                    ]
                  })}
                </tr>
              </thead>

              <tbody>
                {activeProduits.map(p => {
                  const { budget: totBudget, alloue: totAlloue } = totalResteAnnee(p)
                  const totReste = totBudget > 0 ? Math.round((totBudget - totAlloue) * 10) / 10 : null

                  return (
                    <tr key={p.id} className="border-b border-border/20 hover:bg-bg/40 transition-colors group">
                      {/* ── Sticky : produit name + reste indicator ── */}
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 border-r border-border/30"
                        style={{ width: COL_PRODUIT }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-full shrink-0 mt-0.5" style={{ background: p.couleur ?? '#4A4CC8' }} />
                            <span className="font-semibold text-navy text-[11px] truncate" title={p.nom}>{p.nom}</span>
                          </div>
                          {/* Badge reste annuel */}
                          {totReste !== null && (
                            <span className={cn(
                              'text-[10px] tabular-nums shrink-0 px-1.5 py-0.5 rounded-full',
                              totReste < 0  ? 'bg-red/10 text-red font-bold' :
                              totReste === 0 ? 'bg-green/10 text-green font-semibold' :
                                              'bg-orange/10 text-orange font-semibold'
                            )}>
                              {totReste < 0 ? '▲' : totReste === 0 ? '✓' : ''}
                              {fmtJSigné(-totReste === 0 ? 0 : -totReste)}
                            </span>
                          )}
                        </div>
                        {/* Budget annuel sous le nom */}
                        {totBudget > 0 && (
                          <div className="ml-4 mt-0.5 text-[10px] text-subtle tabular-nums">
                            {fmtJ(totAlloue)} saisis / {fmtJ(totBudget)} budget
                          </div>
                        )}
                      </td>

                      {/* ── Quarter columns ── */}
                      {quarters.map(qt => {
                        const isExp   = expandedQ.has(qt.q)
                        const trim    = getTrimForQ(p, qt.q, annee)
                        const bq      = budgetQ(p, qt.q)
                        const allocQ  = allocForWeeks(p.id, qt.weeks)
                        const reste   = resteQ(p, qt.q)
                        const statut  = trim?.statut ?? null

                        if (isExp) {
                          return qt.weeks.map(w => {
                            const v       = planMap.get(`${p.id}|${w.semaine}`) ?? 0
                            const isEdit  = editCell?.produit_id === p.id && editCell?.semaine === w.semaine
                            const isPast  = w.lundi < today

                            return (
                              <td key={w.semaine}
                                className={cn(
                                  'text-center px-0.5 py-0.5 border-r border-border/15 cursor-pointer transition-colors',
                                  isPast ? 'bg-bg/40' : 'hover:bg-blue/5'
                                )}
                                style={{ width: COL_WK }}
                                onClick={() => !isEdit && setEditCell({ produit_id: p.id, semaine: w.semaine })}>
                                {isEdit ? (
                                  <CellInput
                                    initVal={v}
                                    onSave={jours => saveCell(p.id, w.semaine, jours)}
                                    onCancel={() => setEditCell(null)}
                                  />
                                ) : v > 0 ? (
                                  <span className={cn(
                                    'inline-block text-[10px] rounded px-1 py-0.5 font-semibold w-full text-center tabular-nums',
                                    isPast ? 'bg-subtle/10 text-subtle' : 'bg-blue/10 text-blue'
                                  )}>
                                    {fmtJ(v)}
                                  </span>
                                ) : (
                                  <span className="inline-block w-full h-5 rounded hover:bg-blue/5 transition-colors" />
                                )}
                              </td>
                            )
                          })
                        }

                        // ── Collapsed: Saisi | Reste ──
                        return [
                          <td key={`${qt.q}-a`} className="text-center py-2 border-r border-border/15 tabular-nums"
                            style={{ width: COL_Q_ALLOC }}>
                            <div className="flex flex-col items-center gap-0.5">
                              {allocQ > 0
                                ? <span className="text-[11px] font-semibold text-blue">{fmtJ(allocQ)}</span>
                                : <span className="text-subtle/30 text-[10px]">—</span>
                              }
                              {statut && trim?.lance && (
                                <div className={cn('w-1.5 h-1.5 rounded-full', STATUT_DOT[statut] ?? 'bg-subtle/30')} />
                              )}
                            </div>
                          </td>,
                          <td key={`${qt.q}-r`} className="text-center py-2 border-r border-border/15 tabular-nums"
                            style={{ width: COL_Q_RESTE }}>
                            {reste !== null ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className={cn('text-[11px]', resteColorSimple(reste))}>
                                  {reste === 0 ? '✓ 0j' : fmtJSigné(-reste === 0 ? 0 : -reste)}
                                </span>
                                {bq > 0 && (
                                  <div className="w-8 h-0.5 rounded-full bg-border overflow-hidden">
                                    <div className={cn('h-full rounded-full transition-all',
                                      allocQ > bq ? 'bg-red' : allocQ === bq ? 'bg-green' : 'bg-blue'
                                    )} style={{ width: `${Math.min(100, Math.round(allocQ / bq * 100))}%` }} />
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-subtle/20 text-[10px]">—</span>
                            )}
                          </td>,
                        ]
                      })}

                      {/* ── Total année : saisi | reste ── */}
                      <td className="text-center py-2 border-l border-border/30 tabular-nums" style={{ width: COL_Q_ALLOC }}>
                        {totAlloue > 0
                          ? <span className="text-[11px] font-semibold text-blue">{fmtJ(totAlloue)}</span>
                          : <span className="text-subtle/30 text-[10px]">—</span>
                        }
                      </td>
                      <td className="text-center py-2 tabular-nums" style={{ width: COL_Q_RESTE }}>
                        {totReste !== null ? (
                          <span className={cn('text-[11px]', resteColorSimple(totReste))}>
                            {totReste === 0 ? '✓' : fmtJSigné(-totReste === 0 ? 0 : -totReste)}
                          </span>
                        ) : (
                          <span className="text-subtle/30 text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              {/* ── Footer totals ─────────────────────────────── */}
              <tfoot>
                <tr className="border-t-2 border-navy/10 bg-navy/5">
                  <td className="sticky left-0 z-10 bg-navy/5 px-4 py-2 font-bold text-navy text-[10px] uppercase tracking-wider border-r border-border/30"
                    style={{ width: COL_PRODUIT }}>
                    Total équipe
                  </td>
                  {quarters.map(qt => {
                    const isExp     = expandedQ.has(qt.q)
                    const totAlloc  = activeProduits.reduce((s, p) => s + allocForWeeks(p.id, qt.weeks), 0)
                    const totBudget = activeProduits.reduce((s, p) => s + budgetQ(p, qt.q), 0)
                    const totReste  = totBudget > 0 ? Math.round((totBudget - totAlloc) * 10) / 10 : null

                    if (isExp) {
                      return qt.weeks.map(w => {
                        const v = activeProduits.reduce((s, p) => s + (planMap.get(`${p.id}|${w.semaine}`) ?? 0), 0)
                        return (
                          <td key={w.semaine} className="text-center py-2 border-r border-border/20 tabular-nums"
                            style={{ width: COL_WK }}>
                            {v > 0 && (
                              <span className={cn('text-[10px] font-bold',
                                v > 10 ? 'text-red' : v > 5 ? 'text-orange' : 'text-navy/70')}>
                                {fmtJ(v)}
                              </span>
                            )}
                          </td>
                        )
                      })
                    }

                    return [
                      <td key={`${qt.q}-a`} className="text-center py-2 border-r border-border/20 tabular-nums"
                        style={{ width: COL_Q_ALLOC }}>
                        <span className={cn('text-[11px] font-bold', totAlloc > 0 ? 'text-blue' : 'text-subtle/30')}>
                          {totAlloc > 0 ? fmtJ(totAlloc) : '—'}
                        </span>
                      </td>,
                      <td key={`${qt.q}-r`} className="text-center py-2 border-r border-border/20 tabular-nums"
                        style={{ width: COL_Q_RESTE }}>
                        {totReste !== null ? (
                          <span className={cn('text-[11px] font-bold',
                            totReste < 0 ? 'text-red' : totReste === 0 ? 'text-green' : 'text-orange')}>
                            {fmtJSigné(-totReste)}
                          </span>
                        ) : (
                          <span className="text-subtle/30 text-[10px]">—</span>
                        )}
                      </td>,
                    ]
                  })}
                  {/* Total année footer */}
                  <td className="text-center py-2 border-l border-border/30 tabular-nums" style={{ width: COL_Q_ALLOC }}>
                    <span className="text-[11px] font-bold text-blue">
                      {fmtJ(activeProduits.reduce((s, p) =>
                        s + quarters.reduce((qs, qt) => qs + allocForWeeks(p.id, qt.weeks), 0), 0))}
                    </span>
                  </td>
                  <td className="text-center py-2 tabular-nums" style={{ width: COL_Q_RESTE }}>
                    <span className="text-[11px] font-bold text-orange">
                      {(() => {
                        const totB = activeProduits.reduce((s, p) => s + quarters.reduce((qs, qt) => qs + budgetQ(p, qt.q), 0), 0)
                        const totA = activeProduits.reduce((s, p) => s + quarters.reduce((qs, qt) => qs + allocForWeeks(p.id, qt.weeks), 0), 0)
                        return totB > 0 ? fmtJSigné(-(totB - totA)) : '—'
                      })()}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Légende */}
      <div className="flex items-center flex-wrap gap-4 mt-3 text-[10px] text-subtle">
        <div className="flex items-center gap-1.5">
          <span className="inline-block px-1.5 py-0.5 rounded bg-blue/10 text-blue font-semibold">3j</span>
          Prévisionnel saisi (cliquez pour modifier)
        </div>
        <div className="mx-1 h-3 w-px bg-border" />
        <span className="text-orange font-semibold">−5j</span> reste à allouer
        <span className="text-red font-bold">+5j</span> dépassement budget
        <span className="text-green font-semibold">✓</span> budget entièrement alloué
        <div className="mx-1 h-3 w-px bg-border" />
        <span>Budget par trimestre : défini dans la fiche produit → Objectifs trimestriels</span>
      </div>
    </Layout>
  )
}
