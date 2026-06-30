import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Layout } from '@/components/layout/Layout'
import { Spinner } from '@/components/ui/Spinner'
import { useProduits } from '@/hooks/useProduits'
import type { Produit, TrimObjectif } from '@/hooks/useProduits'
import { usePlanCharges, useUpsertPlanCharge, useRealiseFromTasks } from '@/hooks/usePlanCharges'
import { useAllProfiles, useAllRoles } from '@/hooks/useUserManagement'
import { usePeriodesFermeture } from '@/hooks/usePeriodesFermeture'
import { usePendingProfiles } from '@/hooks/useUserManagement'
import { getJoursFeries, joursOuvresSemaine, labelsFermes } from '@/utils/joursFeries'
import { PlanChargesSettings } from './PlanChargesSettings'
import type { UserProfile } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, ChevronLeft, Users, Settings, CalendarClock } from 'lucide-react'

type PlanMode = 'previsionnel' | 'realise' | 'comparaison'

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

// ── Cell input ────────────────────────────────────────────────
function CellInput({ initVal, maxJours, onSave, onCancel, onTab }: {
  initVal:  number
  maxJours: number
  onSave:   (v: number) => void
  onCancel: () => void
  onTab?:   () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [val, setVal] = useState(initVal === 0 ? '' : String(initVal))
  useEffect(() => { ref.current?.select() }, [])

  const numVal  = parseFloat(val.replace(',', '.'))
  const tooHigh = !isNaN(numVal) && numVal > maxJours

  function commit() {
    const n = parseFloat(val.replace(',', '.'))
    if (isNaN(n) || n < 0) { onSave(0); return }
    onSave(Math.min(n, maxJours))
  }

  return (
    <div className="relative">
      <input ref={ref} type="text" inputMode="decimal" value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter')  { e.preventDefault(); commit() }
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          if (e.key === 'Tab')    { e.preventDefault(); commit(); onTab?.() }
        }}
        className={cn(
          'w-full text-center text-[11px] font-semibold rounded outline-none py-0.5 tabular-nums border',
          tooHigh
            ? 'bg-rose-50 border-rose-300 text-rose-700'
            : 'bg-indigo-50 border-indigo-300 text-indigo-700'
        )}
      />
      {tooHigh && (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] bg-rose-500 text-white px-1.5 py-0.5 rounded z-10">
          max {maxJours}j
        </div>
      )}
    </div>
  )
}

// ── Format helpers ────────────────────────────────────────────
function fmtJ(v: number, dec = 1): string {
  if (!v) return ''
  return v % 1 === 0 ? `${v}j` : `${v.toFixed(dec)}j`
}

function fmtReste(reste: number): string {
  if (reste === 0) return '✓'
  const abs = Math.abs(reste)
  const s   = reste > 0 ? '−' : '+'
  return `${s}${abs % 1 === 0 ? abs : abs.toFixed(1)}j`
}

function resteClass(reste: number | null): string {
  if (reste === null) return 'text-subtle/30'
  if (reste < 0)  return 'text-rose-600 font-bold'
  if (reste === 0) return 'text-emerald-600 font-semibold'
  return 'text-amber-600 font-semibold'
}

// ── Constants ─────────────────────────────────────────────────
const DEFAULT_JOURS_TRIM = 65
const COL_PRODUIT = 220
const COL_Q       = 140   // colonne trimestre repliée (unique)
const COL_Q_ALLOC = 64    // sous-colonne "Saisi" (trimestre déplié uniquement)
const COL_Q_RESTE = 72    // sous-colonne "Reste" (trimestre déplié uniquement)
const COL_WK      = 52

// ── Member avatar ─────────────────────────────────────────────
function MemberTag({ profile }: { profile: UserProfile }) {
  const initials = profile.trigramme ?? (profile.display_name ?? '?').slice(0,2).toUpperCase()
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[9px] font-bold shrink-0"
        style={{ background: profile.couleur ?? '#4A4CC8' }}>
        {initials.slice(0,2)}
      </span>
      <span className="text-[10px] text-navy/70 font-medium truncate max-w-[100px]">
        {profile.prenom ?? profile.display_name ?? initials}
      </span>
    </span>
  )
}

// ── Vue par membre ────────────────────────────────────────────
interface MemberViewProps {
  annee: number; curYear: number; mode: PlanMode
  quarters: Array<{ q: number; label: string; weeks: WeekInfo[] }>
  expandedQ: Set<number>; toggleQ: (q: number) => void
  profiles: (UserProfile & { email?: string })[]
  allRoles: Array<{ user_id: string; produit_id: number }>
  activeProduits: Produit[]
  planMap: Map<string, number>; planMapR: Map<string, number>
  joursOuvresMap: Map<number, number>; currentISOWeek: number
  feriesMap: Map<string, string>; fermeturesDayMap: Map<string, string>
}

function MemberView({ annee, curYear, mode, quarters, expandedQ, toggleQ,
  profiles, allRoles, activeProduits, planMap, planMapR,
  joursOuvresMap, currentISOWeek, feriesMap, fermeturesDayMap }: MemberViewProps) {

  const activeProduitIds = useMemo(() => new Set(activeProduits.map(p => p.id)), [activeProduits])

  const members = useMemo(() =>
    profiles
      .filter(pr => pr.actif !== false && allRoles.some(r => r.user_id === pr.user_id && activeProduitIds.has(r.produit_id)))
      .sort((a, b) => (a.trigramme ?? a.display_name ?? '').localeCompare(b.trigramme ?? b.display_name ?? '', 'fr')),
  [profiles, allRoles, activeProduitIds])

  function getJO(s: number) { return joursOuvresMap.get(s) ?? 5 }

  function wkVal(tri: string, semaine: number) {
    return activeProduits.reduce((sum, p) => sum + (planMap.get(`${p.id}|${semaine}|${tri}`) ?? 0), 0)
  }
  function wkValR(tri: string, semaine: number) {
    return activeProduits.reduce((sum, p) => sum + (planMapR.get(`${p.id}|${semaine}|${tri}`) ?? 0), 0)
  }
  function wkByProduit(tri: string, semaine: number) {
    return activeProduits
      .map(p => ({ p, v: (mode === 'realise' ? planMapR : planMap).get(`${p.id}|${semaine}|${tri}`) ?? 0 }))
      .filter(x => x.v > 0)
  }

  const totalWidth = COL_PRODUIT + quarters.reduce((s, qt) =>
    s + (expandedQ.has(qt.q) ? qt.weeks.length * COL_WK + COL_Q_ALLOC + COL_Q_RESTE : COL_Q), 0) + COL_Q

  if (members.length === 0) return (
    <div className="text-center py-16 text-subtle text-sm">Aucun membre avec rôle sur un produit actif.</div>
  )

  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse" style={{ minWidth: totalWidth }}>
          <thead>
            <tr className="border-b border-border/40 bg-slate-50">
              <th className="sticky left-0 z-20 bg-slate-50 text-left px-4 py-2 border-r border-border"
                style={{ width: COL_PRODUIT }} rowSpan={2}>
                <span className="text-[10px] text-subtle uppercase tracking-wider">Membre</span>
              </th>
              {quarters.map(qt => {
                const isExp = expandedQ.has(qt.q)
                if (!isExp) return (
                  <th key={qt.q} rowSpan={2} style={{ width: COL_Q }}
                    className="border-r border-border align-top p-0">
                    <button onClick={() => toggleQ(qt.q)}
                      className="w-full flex items-center gap-1.5 px-3 py-2.5 hover:bg-black/5 transition-colors text-left">
                      <ChevronRight size={10} className="text-subtle shrink-0" />
                      <span className="font-bold text-navy text-xs">{qt.label}</span>
                    </button>
                  </th>
                )
                return (
                  <th key={qt.q} colSpan={qt.weeks.length + 2} className="border-r border-border text-center py-0">
                    <button onClick={() => toggleQ(qt.q)}
                      className="w-full flex items-center justify-center gap-1.5 px-2 py-2 hover:bg-black/5 transition-colors">
                      <ChevronDown size={11} className="text-subtle" />
                      <span className="font-bold text-navy text-xs">{qt.label}</span>
                    </button>
                  </th>
                )
              })}
              <th rowSpan={2} style={{ width: COL_Q }}
                className="text-center py-2 text-[10px] font-bold text-slate-400 bg-slate-50 border-l border-border">
                Total<br />année
              </th>
            </tr>
            <tr className="bg-slate-700 text-white border-b border-slate-600/20">
              {quarters.filter(qt => expandedQ.has(qt.q)).flatMap(qt => [
                ...qt.weeks.map(w => {
                  const jo = getJO(w.semaine)
                  const isFerme = jo === 0; const hasOff = jo < 5
                  const isToday = w.semaine === currentISOWeek && annee === curYear
                  const labels = labelsFermes(w.lundi, feriesMap, fermeturesDayMap)
                  return (
                    <th key={`${qt.q}-${w.semaine}`} style={{ width: COL_WK }}
                      title={labels.length ? labels.join(' · ') : undefined}
                      {...(isToday ? { 'data-today': 'true' } : {})}
                      className={cn('text-center py-1.5 border-r border-white/10 font-semibold tabular-nums relative',
                        isToday ? 'bg-yellow/25 ring-1 ring-inset ring-yellow/60'
                        : isFerme ? 'bg-rose-400/25' : hasOff ? 'bg-amber-400/20' : '')}>
                      {isToday && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-yellow rounded-b-full" />}
                      <div className="text-[9px] text-white/50">{fmtDayMonth(w.lundi)}</div>
                      <div className={cn('text-[10px]', isToday && 'font-extrabold text-yellow')}>S{String(w.semaine).padStart(2,'0')}</div>
                      <div className={cn('text-[8px] font-bold mt-0.5', isFerme ? 'text-rose-300' : hasOff ? 'text-amber-300' : isToday ? 'text-yellow/80' : 'text-white/30')}>{jo}j</div>
                    </th>
                  )
                }),
                <th key={`${qt.q}-a`} style={{ width: COL_Q_ALLOC }}
                  className="text-center py-2 border-l border-white/30 border-r border-white/10 text-[10px] font-bold text-white/90 bg-white/5">
                  {mode === 'realise' ? 'Réalisé' : 'Saisi'}
                </th>,
                <th key={`${qt.q}-r`} style={{ width: COL_Q_RESTE }}
                  className="text-center py-2 border-r border-white/10 text-[10px] font-bold text-white/60 bg-white/5">Charge</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {members.map(member => {
              const tri = member.trigramme ?? ''
              const memberProduits = activeProduits.filter(p =>
                allRoles.some(r => r.user_id === member.user_id && r.produit_id === p.id))

              const totAnnee = quarters.reduce((s, qt) =>
                s + qt.weeks.reduce((ws, w) => ws + (mode === 'realise' ? wkValR(tri, w.semaine) : wkVal(tri, w.semaine)), 0), 0)

              return (
                <tr key={member.user_id} className="border-b border-border/10 hover:bg-bg/20 transition-colors">
                  {/* Sticky : membre */}
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 border-r border-border/30" style={{ width: COL_PRODUIT }}>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-[10px] font-bold shrink-0"
                        style={{ background: member.couleur ?? '#4A4CC8' }}>
                        {(member.trigramme ?? member.display_name ?? '?').slice(0,2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-navy truncate">{member.display_name}</div>
                        <div className="flex gap-1 mt-0.5 flex-wrap">
                          {memberProduits.slice(0,4).map(p => (
                            <span key={p.id} className="w-2 h-2 rounded-full inline-block" style={{ background: p.couleur ?? '#4A4CC8' }} title={p.nom} />
                          ))}
                        </div>
                      </div>
                      {totAnnee > 0 && (
                        <span className="ml-auto text-[10px] text-subtle tabular-nums shrink-0">{fmtJ(totAnnee)}j</span>
                      )}
                    </div>
                  </td>

                  {/* Colonnes */}
                  {quarters.map(qt => {
                    const isExp = expandedQ.has(qt.q)
                    const allocQ = qt.weeks.reduce((s, w) => s + wkVal(tri, w.semaine), 0)
                    const realQ  = qt.weeks.reduce((s, w) => s + wkValR(tri, w.semaine), 0)
                    const dispQ  = mode === 'realise' ? realQ : allocQ
                    const maxQJ  = qt.weeks.reduce((s, w) => s + getJO(w.semaine), 0)
                    const ratioQ = maxQJ > 0 ? Math.min(1, dispQ / maxQJ) : 0

                    if (isExp) {
                      return [
                        ...qt.weeks.map(w => {
                          const v    = mode === 'realise' ? wkValR(tri, w.semaine) : wkVal(tri, w.semaine)
                          const vP   = wkVal(tri, w.semaine)
                          const vR   = wkValR(tri, w.semaine)
                          const jo   = getJO(w.semaine)
                          const isToday = w.semaine === currentISOWeek && annee === curYear
                          const ratio = jo > 0 ? Math.min(1, v / jo) : 0
                          const breakdown = wkByProduit(tri, w.semaine)

                          const tooltipText = breakdown.length > 0
                            ? breakdown.map(x => `${x.p.nom}: ${fmtJ(x.v)}`).join('\n')
                            : undefined

                          if (mode === 'comparaison') {
                            let bg = 'transparent'; let textCol = '#94a3b8'
                            if (vR > 0) {
                              const r = vP > 0 ? vR / vP : Infinity
                              if (vP === 0)     { bg = 'rgba(251,191,36,0.25)'; textCol = '#92400e' }
                              else if (r <= 1)  { bg = 'rgba(34,197,94,0.25)';  textCol = '#166534' }
                              else if (r <= 1.2){ bg = 'rgba(251,146,60,0.25)'; textCol = '#9a3412' }
                              else              { bg = 'rgba(239,68,68,0.3)';   textCol = '#7f1d1d' }
                            } else if (vP > 0) {
                              bg = 'rgba(59,130,246,0.08)'; textCol = '#93c5fd'
                            }
                            return (
                              <td key={`${qt.q}-${w.semaine}`} style={{ width: COL_WK, background: bg }}
                                title={tooltipText}
                                className={cn('text-center px-1 py-1.5 border-r border-b border-[#d1d5db]',
                                  isToday && 'ring-1 ring-inset ring-yellow/40')}>
                                {(vP > 0 || vR > 0)
                                  ? <span className="text-[11px] font-bold tabular-nums" style={{ color: textCol }}>{fmtJ(vR > 0 ? vR : vP)}</span>
                                  : <span className="text-[9px] text-subtle/20">·</span>}
                              </td>
                            )
                          }

                          const isGreen = mode === 'realise'
                          const over = v > jo
                          const [rc, gc, bc] = over ? [239,68,68] : isGreen ? [34,197,94] : [59,130,246]
                          const opacity = v > 0 ? 0.1 + ratio * 0.75 : 0
                          const bgC = v > 0 ? `rgba(${rc},${gc},${bc},${opacity})` : '#f9fafb'
                          const txtC = opacity > 0.45 ? '#fff' : over ? '#7f1d1d' : isGreen ? '#14532d' : '#1e3a8a'

                          return (
                            <td key={`${qt.q}-${w.semaine}`} style={{ width: COL_WK, background: bgC }}
                              title={tooltipText}
                              className={cn('border-r border-b border-[#d1d5db] select-none p-0',
                                isToday && 'ring-1 ring-inset ring-yellow/50')}>
                              <div className="flex flex-col h-full min-h-[34px] items-center justify-center py-1">
                                {v > 0 && (
                                  <span className="text-[11px] font-bold tabular-nums leading-none" style={{ color: txtC }}>
                                    {fmtJ(v)}
                                  </span>
                                )}
                                {/* Stacked product bar */}
                                {breakdown.length > 0 && v > 0 && (
                                  <div className="flex w-full mt-1 h-1 rounded-full overflow-hidden gap-px px-1">
                                    {breakdown.map(({ p, v: pv }) => (
                                      <div key={p.id} title={`${p.nom}: ${fmtJ(pv)}`}
                                        style={{ flex: pv, background: p.couleur ?? '#4A4CC8', minWidth: 2 }} />
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          )
                        }),
                        // Saisi Q
                        <td key={`${qt.q}-a`} style={{ width: COL_Q_ALLOC }}
                          className="text-center py-1.5 border-l border-border/20 border-r border-border/10 bg-bg/20 tabular-nums align-middle">
                          {dispQ > 0
                            ? <span className={cn('text-[10px] font-semibold', mode === 'realise' ? 'text-emerald-600' : 'text-indigo-600')}>{fmtJ(dispQ)}</span>
                            : <span className="text-subtle/20 text-[10px]">—</span>}
                        </td>,
                        // Charge Q (% du temps dispo)
                        <td key={`${qt.q}-r`} style={{ width: COL_Q_RESTE }}
                          className="px-2 border-r border-border/10 bg-bg/20 align-middle">
                          {maxQJ > 0 && (
                            <div>
                              <div className="h-1.5 rounded-full bg-[#e5e7eb] overflow-hidden">
                                <div className="h-full rounded-full" style={{
                                  width: `${Math.round(ratioQ * 100)}%`,
                                  background: ratioQ > 1 ? '#ef4444' : ratioQ > 0.8 ? '#f97316' : '#22c55e'
                                }} />
                              </div>
                              <div className="text-[9px] text-subtle/50 text-center mt-0.5 tabular-nums">{Math.round(ratioQ * 100)}%</div>
                            </div>
                          )}
                        </td>,
                      ]
                    }

                    // Q replié
                    const isGreen = mode === 'realise'
                    return (
                      <td key={`${qt.q}-col`} style={{ width: COL_Q }}
                        className="px-3 py-2 border-r border-b border-[#d1d5db] align-middle">
                        {dispQ > 0 ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between tabular-nums">
                              <span className={cn('text-[11px] font-bold', isGreen ? 'text-emerald-600' : 'text-indigo-600')}>{fmtJ(dispQ)}</span>
                              <span className="text-[9px] text-subtle/50">{Math.round(ratioQ * 100)}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-[#e5e7eb] overflow-hidden">
                              <div className="h-full rounded-full" style={{
                                width: `${Math.round(ratioQ * 100)}%`,
                                background: ratioQ > 1 ? '#fb7185' : ratioQ > 0.8 ? '#fbbf24' : isGreen ? '#34d399' : '#818cf8'
                              }} />
                            </div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-subtle/30 block text-center">—</span>
                        )}
                      </td>
                    )
                  })}

                  {/* Total année */}
                  <td className="px-3 py-2 border-l border-border/20 align-middle text-center" style={{ width: COL_Q }}>
                    {totAnnee > 0
                      ? <span className={cn('text-[11px] font-bold tabular-nums', mode === 'realise' ? 'text-emerald-600' : 'text-indigo-600')}>{fmtJ(totAnnee)}</span>
                      : <span className="text-subtle/20 text-[10px]">—</span>}
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

// ── Page ─────────────────────────────────────────────────────
export default function PlanChargesPage() {
  const today   = new Date()
  const curYear = today.getFullYear()

  const [annee,          setAnnee]          = useState(curYear)
  const [mode,           setMode]           = useState<PlanMode>('previsionnel')
  const [viewMode,       setViewMode]       = useState<'produit' | 'membre'>('produit')
  const [expandedQ,      setExpandedQ]      = useState<Set<number>>(() => {
    try { const s = localStorage.getItem('pc-expandedQ'); if (s) return new Set(JSON.parse(s)) } catch {}
    return new Set()
  })
  const [expandedProduit,setExpandedProduit]= useState<Set<number>>(() => {
    try { const s = localStorage.getItem('pc-expandedProduit'); if (s) return new Set(JSON.parse(s)) } catch {}
    return new Set()
  })
  const [shouldScrollToday, setShouldScrollToday] = useState(false)

  const { data: produits        = [], isLoading: loadP  } = useProduits()
  const { data: planData        = [], isLoading: loadPl } = usePlanCharges(annee)
  const { data: profiles        = [], isLoading: loadPr } = useAllProfiles()
  const { data: allRoles        = [], isLoading: loadR  } = useAllRoles()
  const { data: fermetures      = [] }                    = usePeriodesFermeture(annee)
  const { data: pendingProfiles = [] }                    = usePendingProfiles()
  const { data: realiseTaskMap  = new Map() }             = useRealiseFromTasks(annee)
  const upsert = useUpsertPlanCharge()

  // Semaine ISO courante
  const currentISOWeek = useMemo(() => {
    const d = new Date(today)
    d.setDate(d.getDate() + 4 - (d.getDay() || 7))
    const y = new Date(d.getFullYear(), 0, 1)
    return Math.ceil((((d.getTime() - y.getTime()) / 86400000) + 1) / 7)
  }, [today])

  const [showSettings, setShowSettings] = useState(false)

  // Jours fériés + fermetures → sets pour calcul rapide
  const feriesData = useMemo(() => getJoursFeries(annee), [annee])

  const feriesSet = useMemo(() =>
    new Set(feriesData.map(f => f.iso)),
  [feriesData])

  const feriesMap = useMemo(() =>
    new Map(feriesData.map(f => [f.iso, f.label])),
  [feriesData])

  const fermeturesRanges = useMemo(() =>
    fermetures.map(f => ({ debut: f.date_debut, fin: f.date_fin })),
  [fermetures])

  const fermeturesDayMap = useMemo(() => {
    const m = new Map<string, string>()
    fermetures.forEach(f => {
      const d = new Date(f.date_debut)
      while (true) {
        const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        if (iso > f.date_fin) break
        m.set(iso, f.label)
        d.setDate(d.getDate() + 1)
      }
    })
    return m
  }, [fermetures])

  const allWeeks = useMemo(() => getWeeksForYear(annee), [annee])

  // Jours ouvrés par semaine
  const joursOuvresMap = useMemo(() => {
    const m = new Map<number, number>()
    allWeeks.forEach(w => {
      m.set(w.semaine, joursOuvresSemaine(w.lundi, feriesSet, fermeturesRanges))
    })
    return m
  }, [allWeeks, feriesSet, fermeturesRanges])

  function getMaxJours(semaine: number): number {
    return joursOuvresMap.get(semaine) ?? 5
  }

  const quarters = useMemo(() => [1,2,3,4].map(q => ({
    q,
    label: `Q${q} ${annee}`,
    weeks: allWeeks.filter(w => w.semaine >= Q_RANGE[q][0] && w.semaine <= Q_RANGE[q][1]),
  })), [annee, allWeeks])

  const activeProduits = useMemo(() =>
    produits.filter(p => p.actif && !p.is_template)
            .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
  [produits])

  // Membres par produit (profiles avec rôle sur ce produit)
  const membersByProduit = useMemo(() => {
    const profileMap = new Map<string, UserProfile & { email?: string }>(
      profiles.map(p => [p.user_id, p])
    )
    const byProduit = new Map<number, UserProfile[]>()
    for (const role of allRoles) {
      const profile = profileMap.get(role.user_id)
      if (!profile || profile.actif === false) continue
      const list = byProduit.get(role.produit_id) ?? []
      list.push(profile as UserProfile)
      byProduit.set(role.produit_id, list)
    }
    // Ajouter les profils en attente (pending) selon leurs produits assignés
    for (const pp of pendingProfiles) {
      if (!pp.trigramme) continue  // sans trigramme, pas identifiable dans plan_charges
      for (const produitId of (pp.pending_produit_ids ?? [])) {
        const list = byProduit.get(produitId) ?? []
        if (list.some(m => m.user_id === `pending_${pp.id}`)) continue
        list.push({
          user_id:      `pending_${pp.id}`,
          display_name: pp.display_name,
          trigramme:    pp.trigramme,
          prenom:       pp.prenom,
          nom:          pp.nom,
          couleur:      pp.couleur ?? '#4A4CC8',
          actif:        true,
          equipe_id:    pp.equipe_ids?.[0] ?? null,
          equipe_ids:   pp.equipe_ids ?? [],
          role_global:  pp.role_global,
          avatar_url:   null,
        } as UserProfile)
        byProduit.set(produitId, list)
      }
    }
    // Trier par trigramme
    byProduit.forEach((list, k) => {
      byProduit.set(k, list.sort((a, b) => (a.trigramme ?? '').localeCompare(b.trigramme ?? '')))
    })
    return byProduit
  }, [profiles, allRoles, pendingProfiles])

  // plan_charges indexé par `${produit_id}|${semaine}|${assigne_a}`
  const planMap = useMemo(() => {
    const m = new Map<string, number>()
    planData.forEach(pc => {
      const k = `${pc.produit_id}|${pc.semaine}|${pc.assigne_a}`
      m.set(k, (m.get(k) ?? 0) + pc.jours)
    })
    return m
  }, [planData])

  // Réalisé combiné : tâches Fait (priorité) + saisie manuelle (fallback)
  const planMapR = useMemo(() => {
    const m = new Map<string, number>()
    // Saisie manuelle en base
    planData.forEach(pc => {
      if ((pc.jours_realises ?? 0) > 0) {
        const k = `${pc.produit_id}|${pc.semaine}|${pc.assigne_a}`
        m.set(k, (pc.jours_realises ?? 0))
      }
    })
    // Tâches Fait — remplace/complète la saisie manuelle
    realiseTaskMap.forEach((v, k) => { m.set(k, v) })
    return m
  }, [planData, realiseTaskMap])

  // Valeur prévisionnel
  function cellVal(produit_id: number, semaine: number, assigne_a: string): number {
    return planMap.get(`${produit_id}|${semaine}|${assigne_a}`) ?? 0
  }

  // Valeur réalisé
  function cellValR(produit_id: number, semaine: number, assigne_a: string): number {
    return planMapR.get(`${produit_id}|${semaine}|${assigne_a}`) ?? 0
  }

  // Total produit pour une semaine — prévisionnel
  function produitWkTotal(produit_id: number, semaine: number, members: UserProfile[]): number {
    if (members.length === 0) return cellVal(produit_id, semaine, '')
    return members.reduce((s, m) => s + cellVal(produit_id, semaine, m.trigramme ?? ''), 0)
  }

  // Total produit pour une semaine — réalisé
  function produitWkTotalR(produit_id: number, semaine: number, members: UserProfile[]): number {
    if (members.length === 0) return cellValR(produit_id, semaine, '')
    return members.reduce((s, m) => s + cellValR(produit_id, semaine, m.trigramme ?? ''), 0)
  }

  // Somme prévisionnel pour un ensemble de semaines
  function allocForWeeks(produit_id: number, weeks: WeekInfo[], members: UserProfile[]): number {
    return weeks.reduce((s, w) => s + produitWkTotal(produit_id, w.semaine, members), 0)
  }

  // Somme réalisé pour un ensemble de semaines
  function realiseForWeeks(produit_id: number, weeks: WeekInfo[], members: UserProfile[]): number {
    return weeks.reduce((s, w) => s + produitWkTotalR(produit_id, w.semaine, members), 0)
  }

  // Budget trimestriel en jours
  function budgetQ(p: Produit, q: number): number {
    const t = getTrimForQ(p, q, annee)
    if (!t?.budget_etp) return 0
    return Math.round(t.budget_etp * (t.jours_ouvres ?? DEFAULT_JOURS_TRIM) * 10) / 10
  }

  // Edit cell state
  const [editCell, setEditCell] = useState<{ produit_id: number; semaine: number; assigne_a: string } | null>(null)

  function saveCell(produit_id: number, semaine: number, assigne_a: string, val: number) {
    if (mode === 'realise') {
      upsert.mutate({ produit_id, epic: '', assigne_a, semaine, annee, jours_realises: val })
    } else {
      upsert.mutate({ produit_id, epic: '', assigne_a, semaine, annee, jours: val })
    }
    setEditCell(null)
  }

  // Persistance localStorage
  useEffect(() => { localStorage.setItem('pc-expandedQ', JSON.stringify(Array.from(expandedQ))) }, [expandedQ])
  useEffect(() => { localStorage.setItem('pc-expandedProduit', JSON.stringify(Array.from(expandedProduit))) }, [expandedProduit])

  // Scroll vers aujourd'hui
  useEffect(() => {
    if (!shouldScrollToday) return
    setShouldScrollToday(false)
    requestAnimationFrame(() => {
      const el = document.querySelector('[data-today]') as HTMLElement | null
      const container = el?.closest('.overflow-x-auto') as HTMLElement | null
      if (el && container) container.scrollLeft = Math.max(0, el.offsetLeft - container.clientWidth / 3)
    })
  }, [shouldScrollToday, expandedQ])

  function scrollToToday() {
    if (annee !== curYear) return
    const todayQ = ([1,2,3,4] as const).find(q => currentISOWeek >= Q_RANGE[q][0] && currentISOWeek <= Q_RANGE[q][1])
    if (todayQ == null) return
    setExpandedQ(prev => { const n = new Set(prev); n.add(todayQ); return n })
    setShouldScrollToday(true)
  }

  // ── Drag-to-fill ────────────────────────────────────────────
  const dragRef    = useRef<{ produit_id: number; assigne_a: string; start: number } | null>(null)
  const hasDragged = useRef(false)
  const [dragRange,  setDragRange]  = useState<{ produit_id: number; assigne_a: string; min: number; max: number } | null>(null)
  const [fillModal,  setFillModal]  = useState<{ produit_id: number; assigne_a: string; semaines: number[] } | null>(null)
  const [fillVal,    setFillVal]    = useState('')
  const fillInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onGlobalMouseUp() {
      if (dragRef.current && hasDragged.current && dragRange) {
        const semaines: number[] = []
        for (let s = dragRange.min; s <= dragRange.max; s++) semaines.push(s)
        setFillModal({ produit_id: dragRef.current.produit_id, assigne_a: dragRef.current.assigne_a, semaines })
        setFillVal('')
      }
      dragRef.current  = null
      hasDragged.current = false
      setDragRange(null)
    }
    window.addEventListener('mouseup', onGlobalMouseUp)
    return () => window.removeEventListener('mouseup', onGlobalMouseUp)
  }, [dragRange])

  function applyFill() {
    if (!fillModal) return
    const jours = parseFloat(fillVal.replace(',', '.'))
    if (!isNaN(jours) && jours >= 0) {
      fillModal.semaines.forEach(semaine =>
        upsert.mutate({ produit_id: fillModal.produit_id, epic: '', assigne_a: fillModal.assigne_a, semaine, annee, jours })
      )
    }
    setFillModal(null)
  }

  function toggleQ(q: number) {
    setExpandedQ(prev => { const n = new Set(prev); n.has(q) ? n.delete(q) : n.add(q); return n })
  }

  function toggleProduit(id: number) {
    setExpandedProduit(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  if (loadP || loadPl || loadPr || loadR) return <Layout><Spinner /></Layout>

  const totalWidth = COL_PRODUIT + quarters.reduce((s, qt) => {
    return s + (expandedQ.has(qt.q)
      ? qt.weeks.length * COL_WK + COL_Q_ALLOC + COL_Q_RESTE
      : COL_Q)
  }, 0) + COL_Q   // colonne Total année

  return (
    <Layout>
      {/* ── Topbar ────────────────────────────────────────────── */}
      <div className="page-topbar -mx-3 -mt-3 mb-4 px-3 md:-mx-5 md:-mt-5 md:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-sm font-semibold text-navy">Plan de charges</h1>

          <div className="flex items-center gap-1">
            <button onClick={() => setAnnee(a => a - 1)}
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <select value={annee} onChange={e => setAnnee(Number(e.target.value))}
              className="ds-select text-xs py-1 w-20 text-center">
              {[curYear - 2, curYear - 1, curYear, curYear + 1, curYear + 2].map(y => <option key={y}>{y}</option>)}
            </select>
            <button onClick={() => setAnnee(a => a + 1)}
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>

          {annee === curYear && (
            <button onClick={scrollToToday}
              className="flex items-center gap-1.5 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors">
              <CalendarClock size={13} />
              Aujourd'hui
            </button>
          )}

          {/* Toggle vue */}
          <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden text-[11px] font-medium">
            {(['produit', 'membre'] as const).map(v => (
              <button key={v} onClick={() => setViewMode(v)}
                className={cn('px-3 py-1.5 transition-colors border-r border-slate-200 last:border-0',
                  viewMode === v ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                )}>
                {v === 'produit' ? 'Par produit' : 'Par membre'}
              </button>
            ))}
          </div>

          {/* Toggle mode */}
          <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden text-[11px] font-medium">
            {(['previsionnel', 'realise', 'comparaison'] as PlanMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={cn('px-3 py-1.5 transition-colors border-r border-slate-200 last:border-0',
                  mode === m
                    ? m === 'realise'      ? 'bg-emerald-50 text-emerald-700'
                    : m === 'comparaison'  ? 'bg-amber-50 text-amber-700'
                    :                        'bg-indigo-50 text-indigo-700'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                )}>
                {m === 'previsionnel' ? 'Prévisionnel' : m === 'realise' ? 'Réalisé' : 'Comparaison'}
              </button>
            ))}
          </div>

          <div className="flex gap-2 ml-auto text-xs text-subtle items-center">
            <button onClick={() => setExpandedQ(new Set([1,2,3,4]))} className="hover:text-navy transition-colors">
              Tout déplier
            </button>
            <span className="text-border">|</span>
            <button onClick={() => setExpandedQ(new Set())} className="hover:text-navy transition-colors">
              Tout replier
            </button>
            <span className="text-border">|</span>
            <button onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 hover:text-navy transition-colors font-medium">
              <Settings size={13} />
              Paramètres
            </button>
          </div>
        </div>
      </div>

      {activeProduits.length === 0 ? (
        <div className="text-center py-16 text-subtle text-sm">Aucun produit actif.</div>
      ) : viewMode === 'membre' ? (
        /* ══════════════════ VUE PAR MEMBRE ══════════════════ */
        <MemberView
          annee={annee}
          curYear={curYear}
          mode={mode}
          quarters={quarters}
          expandedQ={expandedQ}
          toggleQ={toggleQ}
          profiles={profiles}
          allRoles={allRoles}
          activeProduits={activeProduits}
          planMap={planMap}
          planMapR={planMapR}
          joursOuvresMap={joursOuvresMap}
          currentISOWeek={currentISOWeek}
          feriesMap={feriesMap}
          fermeturesDayMap={fermeturesDayMap}
        />
      ) : (
        <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse" style={{ minWidth: totalWidth }}>
              <thead>
                {/* ── Ligne 1 : trimestres ─────────────────── */}
                <tr className="border-b border-border/40 bg-slate-50">
                  <th className="sticky left-0 z-20 bg-slate-50 text-left px-4 py-2 border-r border-border"
                    style={{ width: COL_PRODUIT }} rowSpan={2}>
                    <span className="text-[10px] text-subtle uppercase tracking-wider">Produit / Membre</span>
                  </th>

                  {quarters.map(qt => {
                    const isExp     = expandedQ.has(qt.q)
                    const totAlloc  = activeProduits.reduce((s, p) => { const m = membersByProduit.get(p.id) ?? []; return s + allocForWeeks(p.id, qt.weeks, m) }, 0)
                    const totBudget = activeProduits.reduce((s, p) => s + budgetQ(p, qt.q), 0)
                    const pct       = totBudget > 0 ? Math.min(100, Math.round(totAlloc / totBudget * 100)) : 0

                    if (!isExp) {
                      // Replié : 1 seule colonne, rowSpan=2
                      return (
                        <th key={qt.q} rowSpan={2} style={{ width: COL_Q }}
                          className={cn('border-r border-border align-top p-0', totBudget === 0 && activeProduits.every(p => !p.budget_etp) && 'bg-[#f9fafb]')}>
                          <button onClick={() => toggleQ(qt.q)}
                            className="w-full flex flex-col items-stretch px-3 py-2.5 hover:bg-black/5 transition-colors text-left gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <ChevronRight size={10} className="text-subtle shrink-0 mt-0.5" />
                              <span className="font-bold text-navy text-xs">{qt.label}</span>
                            </div>
                            {totBudget > 0 ? (
                              <>
                                <div className="flex items-center justify-between text-[10px] tabular-nums">
                                  <span className="font-semibold text-indigo-600">{totAlloc > 0 ? fmtJ(totAlloc) : '0j'}</span>
                                  <span className={cn('font-semibold', totBudget - totAlloc < 0 ? 'text-rose-600' : totBudget - totAlloc === 0 ? 'text-emerald-600' : 'text-subtle')}>
                                    / {fmtJ(totBudget)}
                                  </span>
                                </div>
                                <div className="h-1.5 rounded-full bg-[#e5e7eb] overflow-hidden">
                                  <div className={cn('h-full rounded-full transition-all',
                                    totAlloc > totBudget ? 'bg-rose-400' : totAlloc === totBudget ? 'bg-emerald-400' : 'bg-indigo-400'
                                  )} style={{ width: `${pct}%` }} />
                                </div>
                                <div className="text-[9px] text-subtle tabular-nums">{pct}% alloué</div>
                              </>
                            ) : (
                              <div className="text-[10px] text-subtle/40 italic">Aucun budget défini</div>
                            )}
                          </button>
                        </th>
                      )
                    }

                    // Déplié : colSpan = semaines + 2 colonnes saisi/reste
                    return (
                      <th key={qt.q} colSpan={qt.weeks.length + 2}
                        className="border-r border-border text-center py-0">
                        <button onClick={() => toggleQ(qt.q)}
                          className="w-full flex items-center justify-center gap-1.5 px-2 py-2 hover:bg-black/5 transition-colors">
                          <ChevronDown size={11} className="text-subtle shrink-0" />
                          <span className="font-bold text-navy text-xs">{qt.label}</span>
                        </button>
                      </th>
                    )
                  })}

                  {/* Total année — rowSpan=2 */}
                  <th rowSpan={2} style={{ width: COL_Q }}
                    className="text-center py-2 text-[10px] font-bold text-slate-400 bg-slate-50 border-l border-border">
                    Total<br />année
                  </th>
                </tr>

                {/* ── Ligne 2 : sous-colonnes semaines (uniquement pour trimestres dépliés) ── */}
                <tr className="bg-slate-700 text-white border-b border-slate-600/20">
                  {quarters.filter(qt => expandedQ.has(qt.q)).flatMap(qt => [
                    ...qt.weeks.map(w => {
                      const jo      = getMaxJours(w.semaine)
                      const isFerme = jo === 0
                      const hasOff  = jo < 5
                      const isToday = w.semaine === currentISOWeek && annee === curYear
                      const labels  = labelsFermes(w.lundi, feriesMap, fermeturesDayMap)
                      return (
                        <th key={`${qt.q}-${w.semaine}`} style={{ width: COL_WK }}
                          title={labels.length ? labels.join(' · ') : undefined}
                          {...(isToday ? { 'data-today': 'true' } : {})}
                          className={cn(
                            'text-center py-1.5 border-r border-white/10 font-semibold tabular-nums relative',
                            isToday   ? 'bg-yellow/25 ring-1 ring-inset ring-yellow/60'
                            : isFerme ? 'bg-rose-400/25'
                            : hasOff  ? 'bg-amber-400/20'
                            : ''
                          )}>
                          {isToday && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-yellow rounded-b-full" />}
                          <div className="text-[9px] text-white/50">{fmtDayMonth(w.lundi)}</div>
                          <div className={cn('text-[10px]', isToday && 'font-extrabold text-yellow')}>
                            S{String(w.semaine).padStart(2,'0')}
                          </div>
                          <div className={cn('text-[8px] font-bold mt-0.5',
                            isFerme ? 'text-rose-300' : hasOff ? 'text-amber-300' : isToday ? 'text-yellow/80' : 'text-white/30')}>
                            {jo}j
                          </div>
                        </th>
                      )
                    }),
                    <th key={`${qt.q}-tot-a`} style={{ width: COL_Q_ALLOC }}
                      className="text-center py-2 border-l border-white/30 border-r border-white/10 text-[10px] font-bold text-white/90 bg-white/5">
                      {mode === 'realise' ? 'Réalisé' : mode === 'comparaison' ? 'P / R' : 'Saisi'}
                    </th>,
                    <th key={`${qt.q}-tot-r`} style={{ width: COL_Q_RESTE }}
                      className="text-center py-2 border-r border-white/10 text-[10px] font-bold text-white/60 bg-white/5">
                      {mode === 'realise' ? 'Écart' : 'Reste'}
                    </th>,
                  ])}
                </tr>
              </thead>

              <tbody>
                {activeProduits.map(p => {
                  const members    = membersByProduit.get(p.id) ?? []
                  const hasMembers = members.length > 0
                  const isExpProd  = expandedProduit.has(p.id)

                  // Totaux annuels du produit
                  const totAlloue = quarters.reduce((s, qt) => s + allocForWeeks(p.id, qt.weeks, members), 0)
                  const totBudget = quarters.reduce((s, qt) => s + budgetQ(p, qt.q), 0)
                  const totReste  = totBudget > 0 ? Math.round((totBudget - totAlloue) * 10) / 10 : null

                  // ── Rendu d'une cellule semaine (produit ou membre) ──
                  function renderWkCell(semaine: number, assigne_a: string, isTotal: boolean, isPast: boolean, noBudget = false) {
                    const members2 = membersByProduit.get(p.id) ?? []
                    const vP = isTotal ? produitWkTotal(p.id, semaine, members2) : cellVal(p.id, semaine, assigne_a)
                    const vR = isTotal ? produitWkTotalR(p.id, semaine, members2) : cellValR(p.id, semaine, assigne_a)
                    const v  = mode === 'realise' ? vR : vP

                    const isReadOnly = mode === 'comparaison' || isTotal
                    const isEdit = !isReadOnly && editCell?.produit_id === p.id
                      && editCell?.semaine === semaine && editCell?.assigne_a === assigne_a
                    const isInDrag = !isReadOnly && dragRange !== null
                      && dragRange.produit_id === p.id && dragRange.assigne_a === assigne_a
                      && semaine >= dragRange.min && semaine <= dragRange.max
                    const maxJours = getMaxJours(semaine)

                    const isToday = semaine === currentISOWeek && annee === curYear

                    // ── Mode comparaison : réalisé vs prévisionnel ──────────
                    if (mode === 'comparaison') {
                      let bg = 'transparent'
                      let textCol = '#94a3b8'
                      let displayVal = ''
                      if (vR > 0) {
                        displayVal = fmtJ(vR)
                        const ratio = vP > 0 ? vR / vP : Infinity
                        if (vP === 0) { bg = 'rgba(251,191,36,0.25)'; textCol = '#92400e' }         // non planifié
                        else if (ratio <= 1)     { bg = 'rgba(34,197,94,0.25)'; textCol = '#166534' } // sous budget ✓
                        else if (ratio <= 1.2)   { bg = 'rgba(251,146,60,0.25)'; textCol = '#9a3412' } // léger dépassement
                        else                     { bg = 'rgba(239,68,68,0.3)';  textCol = '#7f1d1d' }  // dépassement fort
                      } else if (vP > 0) {
                        displayVal = fmtJ(vP)
                        bg = isPast ? 'rgba(148,163,184,0.12)' : 'rgba(59,130,246,0.08)'
                        textCol = isPast ? '#94a3b8' : '#93c5fd'
                      }
                      return (
                        <td key={`${semaine}-${isTotal ? 'tot' : assigne_a}`}
                          style={{ width: COL_WK, background: bg }}
                          className={cn('text-center px-1 py-1.5 border-r border-b border-[#d1d5db]',
                            isToday && 'ring-1 ring-inset ring-yellow/40')}>
                          {displayVal
                            ? <span className="text-[11px] font-bold tabular-nums" style={{ color: textCol }}>{displayVal}</span>
                            : <span className="text-[9px]" style={{ color: '#e2e8f0' }}>·</span>}
                        </td>
                      )
                    }

                    // ── Ligne totale (résumé produit quand membres dépliés) ─
                    if (isTotal) {
                      const ratio = maxJours > 0 ? Math.min(1, v / maxJours) : 0
                      const bg    = v > 0
                        ? (mode === 'realise'
                            ? `rgba(34,197,94,${0.08 + ratio * 0.25})`
                            : `rgba(59,130,246,${0.06 + ratio * 0.2})`)
                        : isPast ? '#f3f4f6' : '#f9fafb'
                      return (
                        <td key={`${semaine}-tot`} style={{ width: COL_WK, background: bg }}
                          className={cn('text-center px-1 py-1.5 border-r border-b border-[#d1d5db]',
                            isToday && 'ring-1 ring-inset ring-yellow/40')}>
                          {v > 0 && (
                            <span className="text-[10px] font-bold tabular-nums" style={{ color: mode === 'realise' ? '#166534' : '#1e3a8a', opacity: 0.7 }}>
                              {fmtJ(v)}
                            </span>
                          )}
                        </td>
                      )
                    }

                    // ── Heat-map prévisionnel / réalisé ────────────────────
                    if (maxJours === 0 || noBudget) {
                      return (
                        <td key={`${semaine}-${assigne_a}`} style={{ width: COL_WK }}
                          className="text-center px-1 py-1.5 border-r border-b border-[#d1d5db] bg-[#fee2e2] cursor-not-allowed" />
                      )
                    }

                    if (isInDrag) {
                      return (
                        <td key={`${semaine}-${assigne_a}`} style={{ width: COL_WK }}
                          className="text-center px-1 py-1.5 border-r border-b border-[#d1d5db] bg-indigo-100/50 ring-2 ring-inset ring-indigo-400 cursor-crosshair"
                          onMouseEnter={() => {
                            if (!dragRef.current) return
                            hasDragged.current = true
                            setDragRange(prev => prev ? { ...prev, min: Math.min(prev.min, semaine), max: Math.max(prev.max, semaine) } : null)
                          }}>
                          <span className="text-[11px] font-bold tabular-nums text-indigo-600">{v > 0 ? fmtJ(v) : '·'}</span>
                        </td>
                      )
                    }

                    const isGreen = mode === 'realise'
                    const ratio   = v > 0 ? Math.min(1, v / maxJours) : 0
                    const over    = v > maxJours
                    const [r, g, b] = over ? [239,68,68] : isGreen ? [34,197,94] : [59,130,246]
                    const opacity = v > 0 ? (isPast ? 0.08 + ratio * 0.55 : 0.1 + ratio * 0.75) : 0
                    const bgColor = v > 0 ? `rgba(${r},${g},${b},${opacity})` : isPast ? '#f3f4f6' : isGreen ? '#f0fdf4' : '#eff6ff'
                    const textColor = opacity > 0.45
                      ? '#ffffff'
                      : over ? '#7f1d1d' : isGreen ? '#14532d' : '#1e3a8a'

                    return (
                      <td key={`${semaine}-${assigne_a}`}
                        style={{ width: COL_WK, background: bgColor }}
                        className={cn('text-center px-1 py-1.5 border-r border-b border-[#d1d5db] select-none cursor-pointer transition-all',
                          isToday && 'ring-1 ring-inset ring-yellow/50'
                        )}
                        onMouseDown={e => {
                          if (isEdit) return
                          e.preventDefault()
                          dragRef.current = { produit_id: p.id, assigne_a, start: semaine }
                          hasDragged.current = false
                          setDragRange({ produit_id: p.id, assigne_a, min: semaine, max: semaine })
                        }}
                        onMouseEnter={() => {
                          if (!dragRef.current || dragRef.current.produit_id !== p.id || dragRef.current.assigne_a !== assigne_a) return
                          hasDragged.current = true
                          setDragRange(prev => prev
                            ? { ...prev, min: Math.min(prev.min, semaine), max: Math.max(prev.max, semaine) }
                            : null)
                        }}
                        onClick={() => {
                          if (hasDragged.current) return
                          if (!isEdit) setEditCell({ produit_id: p.id, semaine, assigne_a })
                        }}>
                        {isEdit ? (
                          <CellInput
                            initVal={v}
                            maxJours={maxJours}
                            onSave={val => saveCell(p.id, semaine, assigne_a, val)}
                            onCancel={() => setEditCell(null)}
                            onTab={() => {
                              const expWeeks = quarters.filter(qt => expandedQ.has(qt.q)).flatMap(qt => qt.weeks)
                              const idx = expWeeks.findIndex(w => w.semaine === semaine)
                              for (let i = idx + 1; i < expWeeks.length; i++) {
                                if (getMaxJours(expWeeks[i].semaine) > 0) {
                                  setEditCell({ produit_id: p.id, semaine: expWeeks[i].semaine, assigne_a })
                                  return
                                }
                              }
                            }}
                          />
                        ) : v > 0 ? (
                          <span className="inline-block text-[11px] font-bold w-full text-center tabular-nums pointer-events-none"
                            style={{ color: textColor }}>
                            {fmtJ(v)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-full h-5 text-[10px] pointer-events-none"
                            style={{ color: isGreen ? 'rgba(34,197,94,0.2)' : 'rgba(147,197,253,0.5)' }}>·</span>
                        )}
                      </td>
                    )
                  }

                  // ── Rendu cellule trimestre repliée / colonne saisi+reste ──
                  function renderQCollapsed(qt: { q: number; weeks: WeekInfo[] }) {
                    const bq     = budgetQ(p, qt.q)
                    const allocQ = allocForWeeks(p.id, qt.weeks, members)
                    const realQ  = realiseForWeeks(p.id, qt.weeks, members)
                    const reste  = bq > 0 ? Math.round((bq - allocQ) * 10) / 10 : null
                    const resteR = bq > 0 ? Math.round((bq - realQ) * 10) / 10 : null
                    const pct    = bq > 0 ? Math.min(100, Math.round(allocQ / bq * 100)) : 0
                    const pctR   = bq > 0 ? Math.min(100, Math.round(realQ / bq * 100)) : 0
                    const over   = bq > 0 && allocQ > bq
                    const overR  = bq > 0 && realQ > bq

                    if (bq === 0 && !p.budget_etp) {
                      return (
                        <td key={`${qt.q}-collapsed`} style={{ width: COL_Q }}
                          className="px-3 py-2 border-r border-b border-[#d1d5db] bg-[#f3f4f6] align-middle text-center">
                          <span className="text-[10px] text-subtle/40 italic select-none">Aucun budget</span>
                        </td>
                      )
                    }

                    // Mode réalisé : barre verte
                    if (mode === 'realise') {
                      return (
                        <td key={`${qt.q}-collapsed`} style={{ width: COL_Q }}
                          className="px-3 py-2 border-r border-b border-[#d1d5db] align-middle">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between tabular-nums">
                              <span className={cn('text-[11px] font-bold', overR ? 'text-rose-600' : 'text-emerald-600')}>
                                {realQ > 0 ? fmtJ(realQ) : '0j'}
                              </span>
                              {resteR !== null && (
                                <span className={cn('text-[10px] font-semibold', resteClass(resteR))}>
                                  {fmtReste(resteR)}
                                </span>
                              )}
                            </div>
                            <div className="h-1.5 rounded-full bg-[#e5e7eb] overflow-hidden">
                              <div className={cn('h-full rounded-full transition-all',
                                overR ? 'bg-rose-400' : realQ === bq ? 'bg-emerald-400' : 'bg-emerald-300'
                              )} style={{ width: `${pctR}%` }} />
                            </div>
                            <div className="text-[9px] text-subtle/50 tabular-nums text-right">/ {fmtJ(bq)}</div>
                          </div>
                        </td>
                      )
                    }

                    // Mode comparaison : deux barres P + R
                    if (mode === 'comparaison') {
                      return (
                        <td key={`${qt.q}-collapsed`} style={{ width: COL_Q }}
                          className="px-2.5 py-2 border-r border-b border-[#d1d5db] align-middle">
                          <div className="space-y-1.5">
                            <div>
                              <div className="flex items-center justify-between tabular-nums mb-0.5">
                                <span className="text-[9px] text-indigo-600 font-bold">{allocQ > 0 ? fmtJ(allocQ) : '0j'}</span>
                                {reste !== null && <span className={cn('text-[9px]', resteClass(reste))}>{fmtReste(reste)}</span>}
                              </div>
                              <div className="h-1 rounded-full bg-[#e5e7eb] overflow-hidden">
                                <div className={cn('h-full rounded-full', over ? 'bg-rose-400' : 'bg-indigo-400')} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center justify-between tabular-nums mb-0.5">
                                <span className="text-[9px] text-emerald-600 font-bold">{realQ > 0 ? fmtJ(realQ) : '0j'}</span>
                                {resteR !== null && <span className={cn('text-[9px]', resteClass(resteR))}>{fmtReste(resteR)}</span>}
                              </div>
                              <div className="h-1 rounded-full bg-[#e5e7eb] overflow-hidden">
                                <div className={cn('h-full rounded-full', overR ? 'bg-rose-400' : 'bg-emerald-400')} style={{ width: `${pctR}%` }} />
                              </div>
                            </div>
                            <div className="text-[9px] text-subtle/40 text-right tabular-nums">/ {fmtJ(bq)}</div>
                          </div>
                        </td>
                      )
                    }

                    // Mode prévisionnel (défaut)
                    return (
                      <td key={`${qt.q}-collapsed`} style={{ width: COL_Q }}
                        className="px-3 py-2 border-r border-b border-[#d1d5db] align-middle">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between tabular-nums">
                            <span className={cn('text-[11px] font-bold', over ? 'text-rose-600' : 'text-indigo-600')}>
                              {allocQ > 0 ? fmtJ(allocQ) : '0j'}
                            </span>
                            <span className={cn('text-[10px] font-semibold', resteClass(reste))}>
                              {reste !== null ? fmtReste(reste) : ''}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[#e5e7eb] overflow-hidden">
                            <div className={cn('h-full rounded-full transition-all',
                              over ? 'bg-rose-400' : allocQ === bq ? 'bg-emerald-400' : 'bg-indigo-400'
                            )} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="text-[9px] text-subtle/50 tabular-nums text-right">/ {fmtJ(bq)}</div>
                        </div>
                      </td>
                    )
                  }

                  return (
                    <React.Fragment key={`frag-${p.id}`}>
                      {/* ── Ligne produit ─────────────────────── */}
                      <tr
                        className="border-b border-border/20 bg-white hover:bg-bg/30 transition-colors">
                        {/* Sticky : nom + toggle membres */}
                        <td className="sticky left-0 z-10 bg-white px-3 py-2 border-r border-border/30"
                          style={{ width: COL_PRODUIT }}>
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />
                            <span className="font-semibold text-navy text-[11px] flex-1 truncate" title={p.nom}>{p.nom}</span>

                            {/* Badge reste annuel */}
                            {totReste !== null && (
                              <span className={cn(
                                'text-[10px] tabular-nums shrink-0 px-1.5 py-0.5 rounded-full',
                                totReste < 0  ? 'bg-rose-50 text-rose-600 font-bold' :
                                totReste === 0 ? 'bg-emerald-50 text-emerald-600 font-semibold' :
                                                'bg-amber-50 text-amber-600 font-semibold'
                              )}>
                                {fmtReste(totReste)}
                              </span>
                            )}

                            {/* Bouton expand membres */}
                            {hasMembers && (
                              <button onClick={() => toggleProduit(p.id)}
                                className="flex items-center gap-0.5 text-subtle hover:text-indigo-600 transition-colors shrink-0 ml-1">
                                <Users size={11} />
                                <span className="text-[10px]">{members.length}</span>
                                <ChevronDown size={10} className={cn('transition-transform', !isExpProd && '-rotate-90')} />
                              </button>
                            )}
                          </div>
                          {/* Budget annuel */}
                          {totBudget > 0 && (
                            <div className="ml-4 mt-0.5 text-[10px] text-subtle tabular-nums">
                              {fmtJ(totAlloue)} / {fmtJ(totBudget)} budget
                            </div>
                          )}
                          {/* Pas de membres → indication de saisie directe */}
                          {!hasMembers && (
                            <div className="ml-4 mt-0.5 text-[10px] text-subtle/50 italic">saisie directe</div>
                          )}
                        </td>

                        {/* Colonnes trimestres */}
                        {quarters.map(qt => {
                          const isExpQ   = expandedQ.has(qt.q)
                          // Bloqué uniquement si pas de budget trimestriel ET pas de budget annuel global
                          const noBudget = budgetQ(p, qt.q) === 0 && !p.budget_etp
                          if (isExpQ) {
                            return [
                              ...qt.weeks.map(w => {
                                const isPast = w.lundi < today
                                return renderWkCell(w.semaine, hasMembers ? '__total__' : '', hasMembers, isPast, noBudget)
                              }),
                              renderQCollapsed(qt),
                            ]
                          }
                          return renderQCollapsed(qt)
                        })}

                        {/* Total année (1 colonne) */}
                        <td className="px-3 py-2 border-l border-border/30 align-middle" style={{ width: COL_Q }}>
                          {totBudget > 0 ? (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between tabular-nums">
                                <span className={cn('text-[11px] font-bold',
                                  totAlloue > totBudget ? 'text-rose-600' : 'text-indigo-600')}>
                                  {totAlloue > 0 ? fmtJ(totAlloue) : '0j'}
                                </span>
                                {totReste !== null && (
                                  <span className={cn('text-[10px] font-semibold', resteClass(totReste))}>
                                    {fmtReste(totReste)}
                                  </span>
                                )}
                              </div>
                              <div className="h-1.5 rounded-full bg-[#e5e7eb] overflow-hidden">
                                <div className={cn('h-full rounded-full transition-all',
                                  totAlloue > totBudget ? 'bg-rose-400' : totAlloue === totBudget ? 'bg-emerald-400' : 'bg-indigo-400'
                                )} style={{ width: `${Math.min(100, totBudget > 0 ? Math.round(totAlloue/totBudget*100) : 0)}%` }} />
                              </div>
                              <div className="text-[9px] text-subtle/50 tabular-nums text-right">/ {fmtJ(totBudget)}</div>
                            </div>
                          ) : (
                            totAlloue > 0
                              ? <span className="text-[11px] font-bold text-indigo-600 tabular-nums">{fmtJ(totAlloue)}</span>
                              : <span className="text-subtle/30 text-[10px] block text-center">—</span>
                          )}
                        </td>
                      </tr>

                      {/* ── Sous-lignes membres (si dépliés) ─── */}
                      {hasMembers && isExpProd && members.map(member => {
                        const tri = member.trigramme ?? ''
                        const memberAlloue = quarters.reduce((s, qt) =>
                          s + qt.weeks.reduce((ws, w) => ws + cellVal(p.id, w.semaine, tri), 0), 0)

                        return (
                          <tr key={`member-${p.id}-${tri}`}
                            className="border-b border-border/10 bg-bg/20 hover:bg-bg/40 transition-colors">
                            {/* Sticky : membre */}
                            <td className="sticky left-0 z-10 bg-bg/20 pl-8 pr-3 py-1.5 border-r border-border/20"
                              style={{ width: COL_PRODUIT }}>
                              <div className="flex items-center justify-between gap-2">
                                <MemberTag profile={member} />
                                {memberAlloue > 0 && (
                                  <span className="text-[10px] text-subtle tabular-nums shrink-0">
                                    {fmtJ(memberAlloue)}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Colonnes trimestres membres */}
                            {quarters.map(qt => {
                              const isExpQ   = expandedQ.has(qt.q)
                              const noBudget = budgetQ(p, qt.q) === 0 && !p.budget_etp
                              const allocQ   = qt.weeks.reduce((s, w) => s + cellVal(p.id, w.semaine, tri), 0)
                              const realQ    = qt.weeks.reduce((s, w) => s + cellValR(p.id, w.semaine, tri), 0)
                              const dispQ    = mode === 'realise' ? realQ : allocQ
                              const isGreen  = mode === 'realise'

                              if (isExpQ) {
                                return [
                                  ...qt.weeks.map(w => {
                                    const isPast = w.lundi < today
                                    return renderWkCell(w.semaine, tri, false, isPast, noBudget)
                                  }),
                                  // Sous-total membre pour ce trimestre déplié
                                  <td key={`${qt.q}-a`} style={{ width: COL_Q_ALLOC }}
                                    className="text-center py-1.5 border-l border-border/20 border-r border-border/10 tabular-nums bg-bg/30">
                                    {mode === 'comparaison' ? (
                                      <div className="flex flex-col gap-px">
                                        <span className="text-[9px] text-indigo-600">{allocQ > 0 ? fmtJ(allocQ) : '—'}</span>
                                        <span className="text-[9px] text-emerald-600">{realQ > 0 ? fmtJ(realQ) : '—'}</span>
                                      </div>
                                    ) : dispQ > 0
                                      ? <span className={cn('text-[10px]', isGreen ? 'text-emerald-600' : 'text-indigo-600')}>{fmtJ(dispQ)}</span>
                                      : <span className="text-subtle/20 text-[10px]">—</span>}
                                  </td>,
                                  <td key={`${qt.q}-r`} style={{ width: COL_Q_RESTE }}
                                    className="border-r border-border/10 bg-bg/30" />,
                                ]
                              }

                              // Trimestre replié : 1 cellule compacte
                              return (
                                <td key={`${qt.q}-col`} style={{ width: COL_Q }}
                                  className="text-center py-1.5 border-r border-b border-[#d1d5db] tabular-nums">
                                  {mode === 'comparaison' ? (
                                    <div className="flex flex-col gap-px">
                                      <span className="text-[9px] text-indigo-600 font-semibold">{allocQ > 0 ? fmtJ(allocQ) : '—'}</span>
                                      <span className="text-[9px] text-emerald-600 font-semibold">{realQ > 0 ? fmtJ(realQ) : '—'}</span>
                                    </div>
                                  ) : dispQ > 0
                                    ? <span className={cn('text-[10px] font-semibold', isGreen ? 'text-emerald-500' : 'text-indigo-500')}>{fmtJ(dispQ)}</span>
                                    : <span className="text-subtle/20 text-[10px]">—</span>}
                                </td>
                              )
                            })}

                            {/* Total année membre */}
                            <td className="text-center py-1.5 border-l border-border/20 tabular-nums" style={{ width: COL_Q }}>
                              {(() => {
                                const totalR = quarters.reduce((s, qt) =>
                                  s + qt.weeks.reduce((ws, w) => ws + cellValR(p.id, w.semaine, tri), 0), 0)
                                const disp = mode === 'realise' ? totalR : memberAlloue
                                const isGreen = mode === 'realise'
                                return mode === 'comparaison' ? (
                                  <div className="flex flex-col gap-px">
                                    <span className="text-[9px] text-indigo-600 font-semibold">{memberAlloue > 0 ? fmtJ(memberAlloue) : '—'}</span>
                                    <span className="text-[9px] text-emerald-600 font-semibold">{totalR > 0 ? fmtJ(totalR) : '—'}</span>
                                  </div>
                                ) : disp > 0
                                  ? <span className={cn('text-[10px] font-semibold', isGreen ? 'text-emerald-600' : 'text-indigo-600')}>{fmtJ(disp)}</span>
                                  : <span className="text-subtle/20 text-[10px]">—</span>
                              })()}
                            </td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  )
                })}
              </tbody>

              {/* ── Footer totaux équipe ──────────────────────── */}
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 sticky bottom-0 z-20">
                  <td className="sticky left-0 z-30 bg-slate-50 px-4 py-2 font-bold text-slate-600 text-[10px] uppercase tracking-wider border-r border-border/30"
                    style={{ width: COL_PRODUIT }}>
                    Total équipe
                    {mode !== 'previsionnel' && (
                      <span className={cn('ml-2 text-[9px] font-semibold px-1.5 py-0.5 rounded-full',
                        mode === 'realise' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
                        {mode === 'realise' ? 'Réalisé' : 'Comparaison'}
                      </span>
                    )}
                  </td>
                  {quarters.map(qt => {
                    const isExpQ     = expandedQ.has(qt.q)
                    const totBudget  = activeProduits.reduce((s, p) => s + budgetQ(p, qt.q), 0)
                    const totAlloc   = activeProduits.reduce((s, p) => s + allocForWeeks(p.id, qt.weeks, membersByProduit.get(p.id) ?? []), 0)
                    const totRealise = activeProduits.reduce((s, p) => s + realiseForWeeks(p.id, qt.weeks, membersByProduit.get(p.id) ?? []), 0)
                    const totDisp    = mode === 'realise' ? totRealise : totAlloc
                    const totReste   = totBudget > 0 ? Math.round((totBudget - totAlloc) * 10) / 10 : null
                    const totResteR  = totBudget > 0 ? Math.round((totBudget - totRealise) * 10) / 10 : null
                    const pctP       = totBudget > 0 ? Math.min(100, Math.round(totAlloc / totBudget * 100)) : 0
                    const pctR       = totBudget > 0 ? Math.min(100, Math.round(totRealise / totBudget * 100)) : 0

                    if (isExpQ) {
                      return [
                        ...qt.weeks.map(w => {
                          const vP = activeProduits.reduce((s, p) => s + produitWkTotal(p.id, w.semaine, membersByProduit.get(p.id) ?? []), 0)
                          const vR = activeProduits.reduce((s, p) => s + produitWkTotalR(p.id, w.semaine, membersByProduit.get(p.id) ?? []), 0)
                          const isToday = w.semaine === currentISOWeek && annee === curYear

                          if (mode === 'comparaison') {
                            let bg = 'transparent'; let textCol = '#94a3b8'
                            if (vR > 0) {
                              const ratio = vP > 0 ? vR / vP : Infinity
                              if (vP === 0)      { bg = 'rgba(251,191,36,0.2)'; textCol = '#92400e' }
                              else if (ratio<=1) { bg = 'rgba(34,197,94,0.2)';  textCol = '#166534' }
                              else if (ratio<=1.2){ bg = 'rgba(251,146,60,0.2)';textCol = '#9a3412' }
                              else               { bg = 'rgba(239,68,68,0.25)'; textCol = '#7f1d1d' }
                            } else if (vP > 0) { bg = 'rgba(59,130,246,0.07)'; textCol = '#93c5fd' }
                            return (
                              <td key={w.semaine} style={{ width: COL_WK, background: bg }}
                                className={cn('text-center py-2 border-r border-b border-[#d1d5db] tabular-nums',
                                  isToday && 'ring-1 ring-inset ring-yellow/40')}>
                                {(vP > 0 || vR > 0) && (
                                  <span className="text-[10px] font-bold" style={{ color: textCol }}>
                                    {fmtJ(vR > 0 ? vR : vP)}
                                  </span>
                                )}
                              </td>
                            )
                          }

                          const v = mode === 'realise' ? vR : vP
                          const isGreen = mode === 'realise'
                          return (
                            <td key={w.semaine} style={{ width: COL_WK }}
                              className={cn('text-center py-2 border-r border-b border-[#d1d5db] tabular-nums',
                                isToday && 'ring-1 ring-inset ring-yellow/40')}>
                              {v > 0 && (
                                <span className={cn('text-[10px] font-bold',
                                  isGreen
                                    ? v > 10 ? 'text-rose-600' : 'text-emerald-600'
                                    : v > 10 ? 'text-rose-600' : v > 5 ? 'text-amber-600' : 'text-slate-500')}>
                                  {fmtJ(v)}
                                </span>
                              )}
                            </td>
                          )
                        }),
                        // Colonne "Saisi / Réalisé"
                        <td key={`${qt.q}-a`} style={{ width: COL_Q_ALLOC }}
                          className="text-center py-2 border-l border-border/30 border-r border-border/20 tabular-nums bg-slate-100 align-middle">
                          {mode === 'comparaison' ? (
                            <div className="flex flex-col gap-px">
                              <span className={cn('text-[10px] font-bold', totAlloc > 0 ? 'text-indigo-600' : 'text-subtle/30')}>{totAlloc > 0 ? fmtJ(totAlloc) : '—'}</span>
                              <span className={cn('text-[10px] font-bold', totRealise > 0 ? 'text-emerald-600' : 'text-subtle/30')}>{totRealise > 0 ? fmtJ(totRealise) : '—'}</span>
                            </div>
                          ) : (
                            <span className={cn('text-[11px] font-bold', totDisp > 0 ? (mode === 'realise' ? 'text-emerald-600' : 'text-indigo-600') : 'text-subtle/30')}>
                              {totDisp > 0 ? fmtJ(totDisp) : '—'}
                            </span>
                          )}
                        </td>,
                        // Colonne "Reste / Écart"
                        <td key={`${qt.q}-r`} style={{ width: COL_Q_RESTE }}
                          className="text-center py-2 border-r border-border/20 tabular-nums bg-slate-100 align-middle">
                          {mode === 'comparaison' ? (
                            totResteR !== null
                              ? <span className={cn('text-[10px] font-bold', resteClass(totResteR))}>{fmtReste(totResteR)}</span>
                              : <span className="text-subtle/30 text-[10px]">—</span>
                          ) : mode === 'realise' ? (
                            totResteR !== null
                              ? <span className={cn('text-[11px] font-bold', resteClass(totResteR))}>{fmtReste(totResteR)}</span>
                              : <span className="text-subtle/30 text-[10px]">—</span>
                          ) : (
                            totReste !== null
                              ? <span className={cn('text-[11px] font-bold', resteClass(totReste))}>{fmtReste(totReste)}</span>
                              : <span className="text-subtle/30 text-[10px]">—</span>
                          )}
                        </td>,
                      ]
                    }

                    // Trimestre replié
                    if (mode === 'comparaison') {
                      return (
                        <td key={`${qt.q}-col`} style={{ width: COL_Q }}
                          className="px-2.5 py-2 border-r border-[#d1d5db] align-middle">
                          <div className="space-y-1.5">
                            <div>
                              <div className="flex items-center justify-between tabular-nums mb-0.5">
                                <span className="text-[9px] text-indigo-600 font-bold">{fmtJ(totAlloc) || '0j'}</span>
                                {totReste !== null && <span className={cn('text-[9px]', resteClass(totReste))}>{fmtReste(totReste)}</span>}
                              </div>
                              <div className="h-1 rounded-full bg-white/60 overflow-hidden">
                                <div className={cn('h-full rounded-full', totAlloc > totBudget ? 'bg-rose-400' : 'bg-indigo-400')} style={{ width: `${pctP}%` }} />
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center justify-between tabular-nums mb-0.5">
                                <span className="text-[9px] text-emerald-600 font-bold">{fmtJ(totRealise) || '0j'}</span>
                                {totResteR !== null && <span className={cn('text-[9px]', resteClass(totResteR))}>{fmtReste(totResteR)}</span>}
                              </div>
                              <div className="h-1 rounded-full bg-white/60 overflow-hidden">
                                <div className={cn('h-full rounded-full', totRealise > totBudget ? 'bg-rose-400' : 'bg-emerald-400')} style={{ width: `${pctR}%` }} />
                              </div>
                            </div>
                            {totBudget > 0 && <div className="text-[9px] text-navy/40 tabular-nums text-right">/ {fmtJ(totBudget)}</div>}
                          </div>
                        </td>
                      )
                    }

                    const isGreen = mode === 'realise'
                    const pctFt   = isGreen ? pctR : pctP
                    const totDisp2 = isGreen ? totRealise : totAlloc
                    const resteDisp = isGreen ? totResteR : totReste
                    return (
                      <td key={`${qt.q}-col`} style={{ width: COL_Q }}
                        className="px-3 py-2 border-r border-[#d1d5db] align-middle">
                        {totBudget > 0 ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between tabular-nums">
                              <span className={cn('text-[11px] font-bold',
                                totDisp2 > totBudget ? 'text-rose-600' : isGreen ? 'text-emerald-600' : 'text-indigo-600')}>
                                {fmtJ(totDisp2) || '0j'}
                              </span>
                              {resteDisp !== null && (
                                <span className={cn('text-[10px] font-bold', resteClass(resteDisp))}>
                                  {fmtReste(resteDisp)}
                                </span>
                              )}
                            </div>
                            <div className="h-1.5 rounded-full bg-white/50 overflow-hidden">
                              <div className={cn('h-full rounded-full transition-all',
                                totDisp2 > totBudget ? 'bg-rose-400' : totDisp2 === totBudget ? 'bg-emerald-400' : isGreen ? 'bg-emerald-300' : 'bg-indigo-400'
                              )} style={{ width: `${pctFt}%` }} />
                            </div>
                            <div className="text-[9px] text-slate-400 tabular-nums text-right">/ {fmtJ(totBudget)}</div>
                          </div>
                        ) : (
                          <span className={cn('text-[11px] font-bold', totDisp2 > 0 ? (isGreen ? 'text-emerald-600' : 'text-indigo-600') : 'text-subtle/30')}>
                            {totDisp2 > 0 ? fmtJ(totDisp2) : '—'}
                          </span>
                        )}
                      </td>
                    )
                  })}

                  {/* Total année footer */}
                  {(() => {
                    const totB  = activeProduits.reduce((s, p) => s + quarters.reduce((qs, qt) => qs + budgetQ(p, qt.q), 0), 0)
                    const totA  = activeProduits.reduce((s, p) => s + quarters.reduce((qs, qt) => qs + allocForWeeks(p.id, qt.weeks, membersByProduit.get(p.id) ?? []), 0), 0)
                    const totRl = activeProduits.reduce((s, p) => s + quarters.reduce((qs, qt) => qs + realiseForWeeks(p.id, qt.weeks, membersByProduit.get(p.id) ?? []), 0), 0)
                    const totD  = mode === 'realise' ? totRl : totA
                    const resteP = totB > 0 ? totB - totA  : null
                    const resteR = totB > 0 ? totB - totRl : null
                    const resteD = mode === 'realise' ? resteR : resteP
                    const pctAnn = totB > 0 ? Math.min(100, Math.round(totD / totB * 100)) : 0
                    const pctAnnP = totB > 0 ? Math.min(100, Math.round(totA / totB * 100)) : 0
                    const pctAnnR = totB > 0 ? Math.min(100, Math.round(totRl / totB * 100)) : 0
                    const isGreen = mode === 'realise'
                    return (
                      <td className="px-3 py-2 border-l border-border/30 align-middle" style={{ width: COL_Q }}>
                        {mode === 'comparaison' ? (
                          <div className="space-y-1.5">
                            <div>
                              <div className="flex items-center justify-between tabular-nums mb-0.5">
                                <span className="text-[9px] text-indigo-600 font-bold">{fmtJ(totA) || '0j'}</span>
                                {resteP !== null && <span className={cn('text-[9px]', resteClass(resteP))}>{fmtReste(resteP)}</span>}
                              </div>
                              <div className="h-1 rounded-full bg-white/60 overflow-hidden">
                                <div className={cn('h-full rounded-full', totA > totB ? 'bg-rose-400' : 'bg-indigo-400')} style={{ width: `${pctAnnP}%` }} />
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center justify-between tabular-nums mb-0.5">
                                <span className="text-[9px] text-emerald-600 font-bold">{fmtJ(totRl) || '0j'}</span>
                                {resteR !== null && <span className={cn('text-[9px]', resteClass(resteR))}>{fmtReste(resteR)}</span>}
                              </div>
                              <div className="h-1 rounded-full bg-white/60 overflow-hidden">
                                <div className={cn('h-full rounded-full', totRl > totB ? 'bg-rose-400' : 'bg-emerald-400')} style={{ width: `${pctAnnR}%` }} />
                              </div>
                            </div>
                            {totB > 0 && <div className="text-[9px] text-slate-400 tabular-nums text-right">/ {fmtJ(totB)}</div>}
                          </div>
                        ) : totB > 0 ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between tabular-nums">
                              <span className={cn('text-[11px] font-bold', totD > totB ? 'text-rose-600' : isGreen ? 'text-emerald-600' : 'text-indigo-600')}>{fmtJ(totD) || '0j'}</span>
                              {resteD !== null && <span className={cn('text-[10px] font-bold', resteClass(resteD))}>{fmtReste(resteD)}</span>}
                            </div>
                            <div className="h-1.5 rounded-full bg-white/50 overflow-hidden">
                              <div className={cn('h-full rounded-full', totD > totB ? 'bg-rose-400' : totD === totB ? 'bg-emerald-400' : isGreen ? 'bg-emerald-300' : 'bg-indigo-400')}
                                style={{ width: `${pctAnn}%` }} />
                            </div>
                            <div className="text-[9px] text-slate-400 tabular-nums text-right">/ {fmtJ(totB)}</div>
                          </div>
                        ) : (
                          <span className={cn('text-[11px] font-bold', totD > 0 ? (isGreen ? 'text-emerald-600' : 'text-indigo-600') : 'text-subtle/30')}>
                            {totD > 0 ? fmtJ(totD) : '—'}
                          </span>
                        )}
                      </td>
                    )
                  })()}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center flex-wrap gap-4 mt-3 text-[10px] text-subtle">
        <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-semibold">3j</span>
        <span>Cliquez pour éditer · <strong>cliquez-glissez</strong> pour remplir plusieurs semaines</span>
        <span className="mx-1 h-3 w-px bg-border" />
        <span><Users size={10} className="inline" /> N = membres — cliquez pour déplier</span>
      </div>

      {/* ── Panneau Paramètres ───────────────────────────────── */}
      {showSettings && (
        <PlanChargesSettings annee={annee} onClose={() => setShowSettings(false)} />
      )}

      {/* ── Modale drag-to-fill ───────────────────────────────── */}
      {fillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          onClick={e => { if (e.target === e.currentTarget) setFillModal(null) }}>
          <div className="bg-white rounded-xl shadow-xl border border-border w-72 p-4">
            <div className="mb-3">
              <div className="text-[11px] font-bold text-navy mb-0.5">
                Remplir {fillModal.semaines.length} semaine{fillModal.semaines.length > 1 ? 's' : ''}
              </div>
              <div className="text-[10px] text-subtle">
                S{String(fillModal.semaines[0]).padStart(2,'0')}
                {fillModal.semaines.length > 1 && ` → S${String(fillModal.semaines[fillModal.semaines.length-1]).padStart(2,'0')}`}
              </div>
            </div>
            <input
              ref={fillInputRef}
              autoFocus
              type="text"
              inputMode="decimal"
              value={fillVal}
              onChange={e => setFillVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  { e.preventDefault(); applyFill() }
                if (e.key === 'Escape') setFillModal(null)
              }}
              placeholder="ex: 3.5 ou 0 pour effacer"
              className="ds-input w-full text-sm mb-3"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setFillModal(null)}
                className="ds-btn ds-btn-sm">Annuler</button>
              <button onClick={applyFill}
                className="ds-btn-primary ds-btn-sm">
                Appliquer
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
