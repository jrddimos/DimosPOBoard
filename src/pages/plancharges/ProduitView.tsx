import React from 'react'
import { ChevronDown, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { labelsFermes } from '@/utils/joursFeries'
import type { Produit } from '@/hooks/useProduits'
import type { UserProfile } from '@/contexts/AuthContext'
import {
  COL_PRODUIT, COL_Q, COL_Q_ALLOC, COL_Q_RESTE, COL_WK,
  fmtDayMonth, fmtJ, fmtReste, resteClass,
} from './utils'
import type { PlanMode, WeekInfo } from './utils'
import { CellInput } from './CellInput'
import { MemberTag } from './MemberTag'

interface DragRange { produit_id: number; assigne_a: string; min: number; max: number }
interface EditCellState { produit_id: number; semaine: number; assigne_a: string }

export function ProduitView({
  today, annee, curYear, mode, currentISOWeek,
  quarters, activeProduits, expandedProduit, toggleProduit,
  membersByProduit, headerTotalsByQuarter,
  getMaxJours, memberMaxJours, feriesMap, fermeturesDayMap,
  cellVal, cellValR, produitWkTotal, produitWkTotalR, allocForWeeks, realiseForWeeks, budgetQ,
  editCell, setEditCell, dragRange, setDragRange, dragRef, hasDragged,
  saveCell, totalWidth, canWriteProduit,
}: {
  today: Date; annee: number; curYear: number; mode: PlanMode; currentISOWeek: number
  quarters: Array<{ q: number; label: string; weeks: WeekInfo[] }>
  activeProduits: Produit[]
  expandedProduit: Set<number>; toggleProduit: (id: number) => void
  membersByProduit: Map<number, UserProfile[]>
  headerTotalsByQuarter: Map<number, { totAlloc: number; totBudget: number }>
  getMaxJours: (semaine: number) => number
  memberMaxJours: (tri: string, semaine: number) => number
  feriesMap: Map<string, string>; fermeturesDayMap: Map<string, string>
  cellVal: (produit_id: number, semaine: number, assigne_a: string) => number
  cellValR: (produit_id: number, semaine: number, assigne_a: string) => number
  produitWkTotal: (produit_id: number, semaine: number, members: UserProfile[]) => number
  produitWkTotalR: (produit_id: number, semaine: number, members: UserProfile[]) => number
  allocForWeeks: (produit_id: number, weeks: WeekInfo[], members: UserProfile[]) => number
  realiseForWeeks: (produit_id: number, weeks: WeekInfo[], members: UserProfile[]) => number
  budgetQ: (p: Produit, q: number) => number
  editCell: EditCellState | null; setEditCell: (c: EditCellState | null) => void
  dragRange: DragRange | null; setDragRange: (fn: (prev: DragRange | null) => DragRange | null) => void
  dragRef: React.MutableRefObject<{ produit_id: number; assigne_a: string; start: number } | null>
  hasDragged: React.MutableRefObject<boolean>
  saveCell: (produit_id: number, semaine: number, assigne_a: string, val: number) => void
  totalWidth: number
  canWriteProduit: (produit_id: number) => boolean
}) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="text-xs" style={{ minWidth: totalWidth, borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            {/* ── Ligne 1 : trimestres ─────────────────── */}
            <tr className="border-b border-border/40 bg-slate-50">
              <th className="sticky left-0 z-20 bg-slate-50 text-left px-4 py-2 border-r border-border"
                style={{ width: COL_PRODUIT }} rowSpan={2}>
                <span className="text-[11px] text-subtle uppercase tracking-wider">Produit / Membre</span>
              </th>

              {quarters.map(qt => {
                const { totAlloc, totBudget } = headerTotalsByQuarter.get(qt.q) ?? { totAlloc: 0, totBudget: 0 }
                const pct = totBudget > 0 ? Math.min(100, Math.round(totAlloc / totBudget * 100)) : 0
                return (
                  <th key={qt.q} colSpan={qt.weeks.length + 2}
                    className="border-r border-border text-center py-1.5 px-2">
                    <div className="flex items-center justify-center gap-2">
                      <span className="font-bold text-navy text-xs">{qt.label}</span>
                      {totBudget > 0 && (
                        <span className="text-[11px] text-subtle tabular-nums">
                          {fmtJ(totAlloc) || '0j'} / {fmtJ(totBudget)} ({pct}%)
                        </span>
                      )}
                    </div>
                  </th>
                )
              })}

              {/* Total année — rowSpan=2 */}
              <th rowSpan={2} style={{ width: COL_Q }}
                className="text-center py-2 text-[11px] font-bold text-slate-400 bg-slate-50 border-l border-border">
                Total<br />année
              </th>
            </tr>

            {/* ── Ligne 2 : sous-colonnes semaines ── */}
            <tr className="bg-slate-700 text-white border-b border-slate-600/20">
              {quarters.flatMap(qt => [
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
                      <div className="text-[10px] text-white/50">{fmtDayMonth(w.lundi)}</div>
                      <div className={cn('text-[11px]', isToday && 'font-extrabold text-yellow')}>
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
                  className="text-center py-2 border-l border-white/30 border-r border-white/10 text-[11px] font-bold text-white/90 bg-white/15">
                  {mode === 'realise' ? 'Réalisé' : mode === 'comparaison' ? 'P / R' : 'Saisi'}
                </th>,
                <th key={`${qt.q}-tot-r`} style={{ width: COL_Q_RESTE }}
                  className="text-center py-2 border-r border-white/10 text-[11px] font-bold text-white/60 bg-white/15">
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

                const isReadOnly = mode === 'comparaison' || isTotal || !canWriteProduit(p.id)
                const isEdit = !isReadOnly && editCell?.produit_id === p.id
                  && editCell?.semaine === semaine && editCell?.assigne_a === assigne_a
                const isInDrag = !isReadOnly && dragRange !== null
                  && dragRange.produit_id === p.id && dragRange.assigne_a === assigne_a
                  && semaine >= dragRange.min && semaine <= dragRange.max
                // Capacité individuelle (absences déduites) pour les lignes membre
                const maxJours = assigne_a ? memberMaxJours(assigne_a, semaine) : getMaxJours(semaine)

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
                      className={cn('text-center px-1 py-1.5 border-r border-b border-border',
                        isToday && 'ring-1 ring-inset ring-yellow/40')}>
                      {displayVal
                        ? <span className="text-xs font-bold tabular-nums" style={{ color: textCol }}>{displayVal}</span>
                        : <span className="text-[10px]" style={{ color: '#e2e8f0' }}>·</span>}
                    </td>
                  )
                }

                // ── Ligne totale (résumé produit quand membres dépliés) ─
                if (isTotal) {
                  const ratio = maxJours > 0 ? Math.min(1, v / maxJours) : 0
                  const isGreenTot = mode === 'realise'
                  const barHeightPctTot = v > 0 ? Math.max(14, Math.round(ratio * 100)) : 0
                  return (
                    <td key={`${semaine}-tot`} style={{ width: COL_WK }}
                      className={cn('p-0 border-r border-b border-border',
                        isToday && 'ring-1 ring-inset ring-yellow/40')}>
                      <div className="relative h-9 flex flex-col items-center justify-end px-1 pb-0.5 bg-slate-50">
                        <span className="text-[10px] font-bold leading-none mb-0.5 tabular-nums opacity-70"
                          style={{ color: isGreenTot ? '#166534' : '#1e3a8a' }}>
                          {v > 0 ? fmtJ(v) : ''}
                        </span>
                        {v > 0 && (
                          <div className="w-full rounded-t-sm opacity-50" style={{ height: `${barHeightPctTot}%`, background: isGreenTot ? '#34d399' : '#6366f1' }} />
                        )}
                      </div>
                    </td>
                  )
                }

                // ── Heat-map prévisionnel / réalisé ────────────────────
                if (maxJours === 0 || noBudget) {
                  return (
                    <td key={`${semaine}-${assigne_a}`} style={{ width: COL_WK }}
                      className="text-center px-1 py-1.5 border-r border-b border-border bg-rose-100 cursor-not-allowed" />
                  )
                }

                if (isInDrag) {
                  return (
                    <td key={`${semaine}-${assigne_a}`} style={{ width: COL_WK }}
                      className="text-center px-1 py-1.5 border-r border-b border-border bg-indigo-100/50 ring-2 ring-inset ring-indigo-400 cursor-crosshair"
                      onMouseEnter={() => {
                        if (!dragRef.current) return
                        hasDragged.current = true
                        setDragRange(prev => prev ? { ...prev, min: Math.min(prev.min, semaine), max: Math.max(prev.max, semaine) } : null)
                      }}>
                      <span className="text-xs font-bold tabular-nums text-indigo-600">{v > 0 ? fmtJ(v) : '·'}</span>
                    </td>
                  )
                }

                const isGreen   = mode === 'realise'
                const ratio     = v > 0 ? Math.min(1, v / maxJours) : 0
                const over      = v > maxJours
                const barColor  = over ? '#f43f5e' : isGreen ? '#34d399' : '#6366f1'
                const trackBg   = isPast ? '#f1f5f9' : isGreen ? '#f0fdf4' : '#eef2ff'
                const barHeightPct = v > 0 ? Math.max(14, Math.round(ratio * 100)) : 0
                const textColor = v > 0 ? (over ? '#e11d48' : isGreen ? '#047857' : '#4338ca') : 'transparent'

                return (
                  <td key={`${semaine}-${assigne_a}`}
                    style={{ width: COL_WK }}
                    title={isReadOnly
                      ? 'Lecture seule — vous n\'avez pas les droits d\'édition sur ce produit'
                      : 'Clic : saisir une valeur · Glisser sur plusieurs semaines : remplissage groupé'}
                    className={cn('p-0 border-r border-b border-border select-none transition-all',
                      isReadOnly ? 'cursor-default' : 'cursor-pointer',
                      isToday && 'ring-1 ring-inset ring-yellow/50'
                    )}
                    onMouseDown={e => {
                      if (isEdit || isReadOnly) return
                      e.preventDefault()
                      // N'arme que la ref — le range de drag n'est posé qu'au premier
                      // mouseenter réel (cf. ci-dessous), pour qu'un simple clic sans
                      // mouvement ne bascule jamais la cellule en rendu "isInDrag"
                      // (qui n'a pas de onClick, ce qui cassait le clic seul).
                      dragRef.current = { produit_id: p.id, assigne_a, start: semaine }
                      hasDragged.current = false
                    }}
                    onMouseEnter={() => {
                      if (!dragRef.current || dragRef.current.produit_id !== p.id || dragRef.current.assigne_a !== assigne_a) return
                      hasDragged.current = true
                      const start = dragRef.current.start
                      setDragRange(prev => {
                        const base = prev ?? { produit_id: p.id, assigne_a, min: start, max: start }
                        return { ...base, min: Math.min(base.min, semaine), max: Math.max(base.max, semaine) }
                      })
                    }}
                    onClick={() => {
                      if (hasDragged.current || isReadOnly) return
                      if (!isEdit) setEditCell({ produit_id: p.id, semaine, assigne_a })
                    }}>
                    {isEdit ? (
                      <div className="flex items-center justify-center h-9">
                        <CellInput
                          initVal={v}
                          maxJours={maxJours}
                          onSave={val => saveCell(p.id, semaine, assigne_a, val)}
                          onCancel={() => setEditCell(null)}
                          onMove={dir => {
                            // Navigation tableur : next/prev = semaine suivante/précédente
                            // (en sautant les semaines fermées), up/down = membre du produit
                            if (dir === 'next' || dir === 'prev') {
                              const allWeeks = quarters.flatMap(qt => qt.weeks)
                              const idx = allWeeks.findIndex(w => w.semaine === semaine)
                              const step = dir === 'next' ? 1 : -1
                              for (let i = idx + step; i >= 0 && i < allWeeks.length; i += step) {
                                if (getMaxJours(allWeeks[i].semaine) > 0) {
                                  setEditCell({ produit_id: p.id, semaine: allWeeks[i].semaine, assigne_a })
                                  return
                                }
                              }
                              return
                            }
                            if (!assigne_a) return
                            const tris = members2.map(m => m.trigramme ?? '').filter(Boolean)
                            const mi = tris.indexOf(assigne_a)
                            if (mi === -1) return
                            const ni = dir === 'down' ? mi + 1 : mi - 1
                            if (ni < 0 || ni >= tris.length) return
                            setEditCell({ produit_id: p.id, semaine, assigne_a: tris[ni] })
                          }}
                        />
                      </div>
                    ) : (
                      <div className="relative h-9 flex flex-col items-center justify-end px-1 pb-0.5" style={{ background: trackBg }}>
                        <span className="text-[10px] font-bold leading-none mb-0.5 tabular-nums pointer-events-none" style={{ color: textColor }}>
                          {v > 0 ? fmtJ(v) : ''}
                        </span>
                        {v > 0 ? (
                          <div className="w-full rounded-t-sm pointer-events-none transition-all"
                            style={{ height: `${barHeightPct}%`, background: barColor, opacity: isPast ? 0.55 : 1 }} />
                        ) : (
                          <span className="w-1 h-1 rounded-full bg-slate-300 pointer-events-none" />
                        )}
                      </div>
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
                    <td key={`${qt.q}-collapsed`} colSpan={2} style={{ width: COL_Q_ALLOC + COL_Q_RESTE }}
                      className="px-3 py-2 border-r border-b border-border bg-slate-300 align-middle text-center">
                      <span className="text-[11px] text-slate-600 font-medium italic select-none">Aucun budget</span>
                    </td>
                  )
                }

                // Mode réalisé : barre verte
                if (mode === 'realise') {
                  return (
                    <td key={`${qt.q}-collapsed`} colSpan={2} style={{ width: COL_Q_ALLOC + COL_Q_RESTE }}
                      className="px-3 py-2 border-r border-b border-border bg-slate-300 align-middle">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between tabular-nums">
                          <span className={cn('text-xs font-bold', overR ? 'text-rose-600' : 'text-emerald-600')}>
                            {realQ > 0 ? fmtJ(realQ) : '0j'}
                          </span>
                          {resteR !== null && (
                            <span className={cn('text-[11px] font-semibold', resteClass(resteR))}>
                              {fmtReste(resteR)}
                            </span>
                          )}
                        </div>
                        <div className="h-1.5 rounded-full bg-border overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all',
                            overR ? 'bg-rose-400' : realQ === bq ? 'bg-emerald-400' : 'bg-emerald-300'
                          )} style={{ width: `${pctR}%` }} />
                        </div>
                        <div className="text-[10px] text-subtle/50 tabular-nums text-right">/ {fmtJ(bq)}</div>
                      </div>
                    </td>
                  )
                }

                // Mode comparaison : deux barres P + R
                if (mode === 'comparaison') {
                  return (
                    <td key={`${qt.q}-collapsed`} colSpan={2} style={{ width: COL_Q_ALLOC + COL_Q_RESTE }}
                      className="px-2.5 py-2 border-r border-b border-border bg-slate-300 align-middle">
                      <div className="space-y-1.5">
                        <div>
                          <div className="flex items-center justify-between tabular-nums mb-0.5">
                            <span className="text-[10px] text-indigo-600 font-bold">{allocQ > 0 ? fmtJ(allocQ) : '0j'}</span>
                            {reste !== null && <span className={cn('text-[10px]', resteClass(reste))}>{fmtReste(reste)}</span>}
                          </div>
                          <div className="h-1 rounded-full bg-border overflow-hidden">
                            <div className={cn('h-full rounded-full', over ? 'bg-rose-400' : 'bg-indigo-400')} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between tabular-nums mb-0.5">
                            <span className="text-[10px] text-emerald-600 font-bold">{realQ > 0 ? fmtJ(realQ) : '0j'}</span>
                            {resteR !== null && <span className={cn('text-[10px]', resteClass(resteR))}>{fmtReste(resteR)}</span>}
                          </div>
                          <div className="h-1 rounded-full bg-border overflow-hidden">
                            <div className={cn('h-full rounded-full', overR ? 'bg-rose-400' : 'bg-emerald-400')} style={{ width: `${pctR}%` }} />
                          </div>
                        </div>
                        <div className="text-[10px] text-subtle/40 text-right tabular-nums">/ {fmtJ(bq)}</div>
                      </div>
                    </td>
                  )
                }

                // Mode prévisionnel (défaut)
                return (
                  <td key={`${qt.q}-collapsed`} colSpan={2} style={{ width: COL_Q_ALLOC + COL_Q_RESTE }}
                    className="px-3 py-2 border-r border-b border-border bg-slate-300 align-middle">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between tabular-nums">
                        <span className={cn('text-xs font-bold', over ? 'text-rose-600' : 'text-indigo-600')}>
                          {allocQ > 0 ? fmtJ(allocQ) : '0j'}
                        </span>
                        <span className={cn('text-[11px] font-semibold', resteClass(reste))}>
                          {reste !== null ? fmtReste(reste) : ''}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-border overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all',
                          over ? 'bg-rose-400' : allocQ === bq ? 'bg-emerald-400' : 'bg-indigo-400'
                        )} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-[10px] text-subtle/50 tabular-nums text-right">/ {fmtJ(bq)}</div>
                    </div>
                  </td>
                )
              }

              return (
                <React.Fragment key={`frag-${p.id}`}>
                  {/* ── Ligne produit ─────────────────────── */}
                  <tr
                    className="border-b border-border/20 bg-card hover:bg-bg/30 transition-colors">
                    {/* Sticky : nom + toggle membres */}
                    <td className="sticky left-0 z-10 bg-card px-3 py-2 border-r border-border/30"
                      style={{ width: COL_PRODUIT }}>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />
                        <span className="font-semibold text-navy text-xs flex-1 truncate" title={p.nom}>{p.nom}</span>

                        {/* Badge reste annuel */}
                        {totReste !== null && (
                          <span className={cn(
                            'text-[11px] tabular-nums shrink-0 px-1.5 py-0.5 rounded-full',
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
                            <span className="text-[11px]">{members.length}</span>
                            <ChevronDown size={10} className={cn('transition-transform', !isExpProd && '-rotate-90')} />
                          </button>
                        )}
                      </div>
                      {/* Budget annuel */}
                      {totBudget > 0 && (
                        <div className="ml-4 mt-0.5 text-[11px] text-subtle tabular-nums">
                          {fmtJ(totAlloue)} / {fmtJ(totBudget)} budget
                        </div>
                      )}
                      {/* Pas de membres → indication de saisie directe */}
                      {!hasMembers && (
                        <div className="ml-4 mt-0.5 text-[11px] text-subtle/50 italic">saisie directe</div>
                      )}
                    </td>

                    {/* Colonnes trimestres */}
                    {quarters.map(qt => {
                      // Bloqué uniquement si pas de budget trimestriel ET pas de budget annuel global
                      const noBudget = budgetQ(p, qt.q) === 0 && !p.budget_etp
                      return [
                        ...qt.weeks.map(w => {
                          const isPast = w.lundi < today
                          return renderWkCell(w.semaine, hasMembers ? '__total__' : '', hasMembers, isPast, noBudget)
                        }),
                        renderQCollapsed(qt),
                      ]
                    })}

                    {/* Total année (1 colonne) */}
                    <td className="px-3 py-2 border-l border-border/30 align-middle" style={{ width: COL_Q }}>
                      {totBudget > 0 ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between tabular-nums">
                            <span className={cn('text-xs font-bold',
                              totAlloue > totBudget ? 'text-rose-600' : 'text-indigo-600')}>
                              {totAlloue > 0 ? fmtJ(totAlloue) : '0j'}
                            </span>
                            {totReste !== null && (
                              <span className={cn('text-[11px] font-semibold', resteClass(totReste))}>
                                {fmtReste(totReste)}
                              </span>
                            )}
                          </div>
                          <div className="h-1.5 rounded-full bg-border overflow-hidden">
                            <div className={cn('h-full rounded-full transition-all',
                              totAlloue > totBudget ? 'bg-rose-400' : totAlloue === totBudget ? 'bg-emerald-400' : 'bg-indigo-400'
                            )} style={{ width: `${Math.min(100, totBudget > 0 ? Math.round(totAlloue/totBudget*100) : 0)}%` }} />
                          </div>
                          <div className="text-[10px] text-subtle/50 tabular-nums text-right">/ {fmtJ(totBudget)}</div>
                        </div>
                      ) : (
                        totAlloue > 0
                          ? <span className="text-xs font-bold text-indigo-600 tabular-nums">{fmtJ(totAlloue)}</span>
                          : <span className="text-subtle/30 text-[11px] block text-center">—</span>
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
                        {/* Sticky : membre (fond opaque pour ne pas laisser transparaître les colonnes qui défilent en dessous) */}
                        <td className="sticky left-0 z-10 bg-bg pl-8 pr-3 py-1.5 border-r border-border/20"
                          style={{ width: COL_PRODUIT }}>
                          <div className="flex items-center justify-between gap-2">
                            <MemberTag profile={member} />
                            {memberAlloue > 0 && (
                              <span className="text-[11px] text-subtle tabular-nums shrink-0">
                                {fmtJ(memberAlloue)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Colonnes trimestres membres */}
                        {quarters.map(qt => {
                          const noBudget = budgetQ(p, qt.q) === 0 && !p.budget_etp
                          const allocQ   = qt.weeks.reduce((s, w) => s + cellVal(p.id, w.semaine, tri), 0)
                          const realQ    = qt.weeks.reduce((s, w) => s + cellValR(p.id, w.semaine, tri), 0)
                          const dispQ    = mode === 'realise' ? realQ : allocQ
                          const isGreen  = mode === 'realise'

                          return [
                            ...qt.weeks.map(w => {
                              const isPast = w.lundi < today
                              return renderWkCell(w.semaine, tri, false, isPast, noBudget)
                            }),
                            // Sous-total membre pour ce trimestre
                            <td key={`${qt.q}-a`} style={{ width: COL_Q_ALLOC }}
                              className="text-center py-1.5 border-l border-border/20 border-r border-border/10 tabular-nums bg-slate-300">
                              {mode === 'comparaison' ? (
                                <div className="flex flex-col gap-px">
                                  <span className="text-[10px] text-indigo-600">{allocQ > 0 ? fmtJ(allocQ) : '—'}</span>
                                  <span className="text-[10px] text-emerald-600">{realQ > 0 ? fmtJ(realQ) : '—'}</span>
                                </div>
                              ) : dispQ > 0
                                ? <span className={cn('text-[11px]', isGreen ? 'text-emerald-600' : 'text-indigo-600')}>{fmtJ(dispQ)}</span>
                                : <span className="text-subtle/20 text-[11px]">—</span>}
                            </td>,
                            <td key={`${qt.q}-r`} style={{ width: COL_Q_RESTE }}
                              className="border-r border-border/10 bg-slate-300" />,
                          ]
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
                                <span className="text-[10px] text-indigo-600 font-semibold">{memberAlloue > 0 ? fmtJ(memberAlloue) : '—'}</span>
                                <span className="text-[10px] text-emerald-600 font-semibold">{totalR > 0 ? fmtJ(totalR) : '—'}</span>
                              </div>
                            ) : disp > 0
                              ? <span className={cn('text-[11px] font-semibold', isGreen ? 'text-emerald-600' : 'text-indigo-600')}>{fmtJ(disp)}</span>
                              : <span className="text-subtle/20 text-[11px]">—</span>
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
              <td className="sticky left-0 z-30 bg-slate-50 px-4 py-2 font-bold text-slate-600 text-[11px] uppercase tracking-wider border-r border-border/30"
                style={{ width: COL_PRODUIT }}>
                Total équipe
                {mode !== 'previsionnel' && (
                  <span className={cn('ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                    mode === 'realise' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
                    {mode === 'realise' ? 'Réalisé' : 'Comparaison'}
                  </span>
                )}
              </td>
              {quarters.map(qt => {
                const totBudget  = activeProduits.reduce((s, p) => s + budgetQ(p, qt.q), 0)
                const totAlloc   = activeProduits.reduce((s, p) => s + allocForWeeks(p.id, qt.weeks, membersByProduit.get(p.id) ?? []), 0)
                const totRealise = activeProduits.reduce((s, p) => s + realiseForWeeks(p.id, qt.weeks, membersByProduit.get(p.id) ?? []), 0)
                const totDisp    = mode === 'realise' ? totRealise : totAlloc
                const totReste   = totBudget > 0 ? Math.round((totBudget - totAlloc) * 10) / 10 : null
                const totResteR  = totBudget > 0 ? Math.round((totBudget - totRealise) * 10) / 10 : null

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
                            className={cn('text-center py-2 border-r border-b border-border tabular-nums',
                              isToday && 'ring-1 ring-inset ring-yellow/40')}>
                            {(vP > 0 || vR > 0) && (
                              <span className="text-[11px] font-bold" style={{ color: textCol }}>
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
                          className={cn('text-center py-2 border-r border-b border-border tabular-nums',
                            isToday && 'ring-1 ring-inset ring-yellow/40')}>
                          {v > 0 && (
                            <span className={cn('text-[11px] font-bold',
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
                      className="text-center py-2 border-l border-border/30 border-r border-border/20 tabular-nums bg-slate-300 align-middle">
                      {mode === 'comparaison' ? (
                        <div className="flex flex-col gap-px">
                          <span className={cn('text-[11px] font-bold', totAlloc > 0 ? 'text-indigo-600' : 'text-subtle/30')}>{totAlloc > 0 ? fmtJ(totAlloc) : '—'}</span>
                          <span className={cn('text-[11px] font-bold', totRealise > 0 ? 'text-emerald-600' : 'text-subtle/30')}>{totRealise > 0 ? fmtJ(totRealise) : '—'}</span>
                        </div>
                      ) : (
                        <span className={cn('text-xs font-bold', totDisp > 0 ? (mode === 'realise' ? 'text-emerald-600' : 'text-indigo-600') : 'text-subtle/30')}>
                          {totDisp > 0 ? fmtJ(totDisp) : '—'}
                        </span>
                      )}
                    </td>,
                    // Colonne "Reste / Écart"
                    <td key={`${qt.q}-r`} style={{ width: COL_Q_RESTE }}
                      className="text-center py-2 border-r border-border/20 tabular-nums bg-slate-300 align-middle">
                      {mode === 'comparaison' ? (
                        totResteR !== null
                          ? <span className={cn('text-[11px] font-bold', resteClass(totResteR))}>{fmtReste(totResteR)}</span>
                          : <span className="text-subtle/30 text-[11px]">—</span>
                      ) : mode === 'realise' ? (
                        totResteR !== null
                          ? <span className={cn('text-xs font-bold', resteClass(totResteR))}>{fmtReste(totResteR)}</span>
                          : <span className="text-subtle/30 text-[11px]">—</span>
                      ) : (
                        totReste !== null
                          ? <span className={cn('text-xs font-bold', resteClass(totReste))}>{fmtReste(totReste)}</span>
                          : <span className="text-subtle/30 text-[11px]">—</span>
                      )}
                    </td>,
                ]
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
                            <span className="text-[10px] text-indigo-600 font-bold">{fmtJ(totA) || '0j'}</span>
                            {resteP !== null && <span className={cn('text-[10px]', resteClass(resteP))}>{fmtReste(resteP)}</span>}
                          </div>
                          <div className="h-1 rounded-full bg-white/60 overflow-hidden">
                            <div className={cn('h-full rounded-full', totA > totB ? 'bg-rose-400' : 'bg-indigo-400')} style={{ width: `${pctAnnP}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between tabular-nums mb-0.5">
                            <span className="text-[10px] text-emerald-600 font-bold">{fmtJ(totRl) || '0j'}</span>
                            {resteR !== null && <span className={cn('text-[10px]', resteClass(resteR))}>{fmtReste(resteR)}</span>}
                          </div>
                          <div className="h-1 rounded-full bg-white/60 overflow-hidden">
                            <div className={cn('h-full rounded-full', totRl > totB ? 'bg-rose-400' : 'bg-emerald-400')} style={{ width: `${pctAnnR}%` }} />
                          </div>
                        </div>
                        {totB > 0 && <div className="text-[10px] text-slate-400 tabular-nums text-right">/ {fmtJ(totB)}</div>}
                      </div>
                    ) : totB > 0 ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between tabular-nums">
                          <span className={cn('text-xs font-bold', totD > totB ? 'text-rose-600' : isGreen ? 'text-emerald-600' : 'text-indigo-600')}>{fmtJ(totD) || '0j'}</span>
                          {resteD !== null && <span className={cn('text-[11px] font-bold', resteClass(resteD))}>{fmtReste(resteD)}</span>}
                        </div>
                        <div className="h-1.5 rounded-full bg-white/50 overflow-hidden">
                          <div className={cn('h-full rounded-full', totD > totB ? 'bg-rose-400' : totD === totB ? 'bg-emerald-400' : isGreen ? 'bg-emerald-300' : 'bg-indigo-400')}
                            style={{ width: `${pctAnn}%` }} />
                        </div>
                        <div className="text-[10px] text-slate-400 tabular-nums text-right">/ {fmtJ(totB)}</div>
                      </div>
                    ) : (
                      <span className={cn('text-xs font-bold', totD > 0 ? (isGreen ? 'text-emerald-600' : 'text-indigo-600') : 'text-subtle/30')}>
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
  )
}
