import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { labelsFermes } from '@/utils/joursFeries'
import { useAbsences, useCreateAbsence, useDeleteAbsence } from '@/hooks/useAbsences'
import { CalendarOff, Plus, X } from 'lucide-react'
import type { Produit } from '@/hooks/useProduits'
import type { UserProfile } from '@/contexts/AuthContext'
import { COL_PRODUIT, COL_Q, COL_Q_ALLOC, COL_Q_RESTE, COL_WK, fmtDayMonth, fmtJ } from './utils'
import type { PlanMode, WeekInfo } from './utils'

interface MemberViewProps {
  annee: number; curYear: number; mode: PlanMode
  quarters: Array<{ q: number; label: string; weeks: WeekInfo[] }>
  profiles: (UserProfile & { email?: string })[]
  allRoles: Array<{ user_id: string; produit_id: number }>
  activeProduits: Produit[]
  planMap: Map<string, number>; planMapR: Map<string, number>
  joursOuvresMap: Map<number, number>; currentISOWeek: number
  memberMaxJours: (tri: string, semaine: number) => number
  feriesMap: Map<string, string>; fermeturesDayMap: Map<string, string>
  search: string
}

export function MemberView({ annee, curYear, mode, quarters,
  profiles, allRoles, activeProduits, planMap, planMapR,
  joursOuvresMap, memberMaxJours, currentISOWeek, feriesMap, fermeturesDayMap, search }: MemberViewProps) {

  const [absencesFor, setAbsencesFor] = useState<UserProfile | null>(null)

  const activeProduitIds = useMemo(() => new Set(activeProduits.map(p => p.id)), [activeProduits])

  const members = useMemo(() => {
    const q = search.trim().toLowerCase()
    return profiles
      .filter(pr => pr.actif !== false && allRoles.some(r => r.user_id === pr.user_id && activeProduitIds.has(r.produit_id)))
      .filter(pr => !q || (pr.trigramme ?? '').toLowerCase().includes(q) || (pr.display_name ?? '').toLowerCase().includes(q))
      .sort((a, b) => (a.trigramme ?? a.display_name ?? '').localeCompare(b.trigramme ?? b.display_name ?? '', 'fr'))
  }, [profiles, allRoles, activeProduitIds, search])

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
    s + qt.weeks.length * COL_WK + COL_Q_ALLOC + COL_Q_RESTE, 0) + COL_Q

  if (members.length === 0) return (
    <div className="text-center py-16 text-subtle text-sm">
      {search.trim() ? `Aucun membre ne correspond à « ${search} ».` : 'Aucun membre avec rôle sur un produit actif.'}
    </div>
  )

  return (
    <>
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="text-xs" style={{ minWidth: totalWidth, borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr className="border-b border-border/40 bg-slate-50">
              <th className="sticky left-0 z-20 bg-slate-50 text-left px-4 py-2 border-r border-border"
                style={{ width: COL_PRODUIT }} rowSpan={2}>
                <span className="text-[11px] text-subtle uppercase tracking-wider">Membre</span>
              </th>
              {quarters.map(qt => (
                <th key={qt.q} colSpan={qt.weeks.length + 2} className="border-r border-border text-center py-2">
                  <span className="font-bold text-navy text-xs">{qt.label}</span>
                </th>
              ))}
              <th rowSpan={2} style={{ width: COL_Q }}
                className="text-center py-2 text-[11px] font-bold text-slate-400 bg-slate-50 border-l border-border">
                Total<br />année
              </th>
            </tr>
            <tr className="bg-slate-700 text-white border-b border-slate-600/20">
              {quarters.flatMap(qt => [
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
                      <div className="text-[10px] text-white/50">{fmtDayMonth(w.lundi)}</div>
                      <div className={cn('text-[11px]', isToday && 'font-extrabold text-yellow')}>S{String(w.semaine).padStart(2,'0')}</div>
                      <div className={cn('text-[8px] font-bold mt-0.5', isFerme ? 'text-rose-300' : hasOff ? 'text-amber-300' : isToday ? 'text-yellow/80' : 'text-white/30')}>{jo}j</div>
                    </th>
                  )
                }),
                <th key={`${qt.q}-a`} style={{ width: COL_Q_ALLOC }}
                  className="text-center py-2 border-l border-white/30 border-r border-white/10 text-[11px] font-bold text-white/90 bg-white/15">
                  {mode === 'realise' ? 'Réalisé' : 'Saisi'}
                </th>,
                <th key={`${qt.q}-r`} style={{ width: COL_Q_RESTE }}
                  className="text-center py-2 border-r border-white/10 text-[11px] font-bold text-white/60 bg-white/15">Charge</th>,
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
                  <td className="sticky left-0 z-10 bg-card px-3 py-2 border-r border-border/30" style={{ width: COL_PRODUIT }}>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-[11px] font-bold shrink-0"
                        style={{ background: member.couleur ?? '#4A4CC8' }}>
                        {(member.trigramme ?? member.display_name ?? '?').slice(0,2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-navy truncate">{member.display_name}</div>
                        <div className="flex gap-1 mt-0.5 flex-wrap">
                          {memberProduits.slice(0,4).map(p => (
                            <span key={p.id} className="w-2 h-2 rounded-full inline-block" style={{ background: p.couleur ?? '#4A4CC8' }} title={p.nom} />
                          ))}
                        </div>
                      </div>
                      <div className="ml-auto flex items-center gap-1 shrink-0">
                        {totAnnee > 0 && (
                          <span className="text-[11px] text-subtle tabular-nums">{fmtJ(totAnnee)}j</span>
                        )}
                        <button onClick={() => setAbsencesFor(member)} title="Gérer les absences"
                          className="p-1 rounded hover:bg-amber-50 text-subtle/50 hover:text-amber-600 transition-colors">
                          <CalendarOff size={12} />
                        </button>
                      </div>
                    </div>
                  </td>

                  {/* Colonnes */}
                  {quarters.map(qt => {
                    const allocQ = qt.weeks.reduce((s, w) => s + wkVal(tri, w.semaine), 0)
                    const realQ  = qt.weeks.reduce((s, w) => s + wkValR(tri, w.semaine), 0)
                    const dispQ  = mode === 'realise' ? realQ : allocQ
                    const maxQJ  = qt.weeks.reduce((s, w) => s + memberMaxJours(tri, w.semaine), 0)
                    const ratioQ = maxQJ > 0 ? Math.min(1, dispQ / maxQJ) : 0

                    return [
                        ...qt.weeks.map(w => {
                          const v    = mode === 'realise' ? wkValR(tri, w.semaine) : wkVal(tri, w.semaine)
                          const vP   = wkVal(tri, w.semaine)
                          const vR   = wkValR(tri, w.semaine)
                          const jo   = memberMaxJours(tri, w.semaine)
                          const joGlobal = getJO(w.semaine)
                          const absJ = joGlobal - jo
                          const isToday = w.semaine === currentISOWeek && annee === curYear
                          const ratio = jo > 0 ? Math.min(1, v / jo) : 0
                          const breakdown = wkByProduit(tri, w.semaine)

                          const tooltipText = [
                            ...(breakdown.length > 0 ? breakdown.map(x => `${x.p.nom}: ${fmtJ(x.v)}`) : []),
                            ...(absJ > 0 ? [`Absence : ${absJ}j`] : []),
                          ].join('\n') || undefined

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
                                className={cn('text-center px-1 py-1.5 border-r border-b border-border',
                                  isToday && 'ring-1 ring-inset ring-yellow/40')}>
                                {(vP > 0 || vR > 0)
                                  ? <span className="text-xs font-bold tabular-nums" style={{ color: textCol }}>{fmtJ(vR > 0 ? vR : vP)}</span>
                                  : <span className="text-[10px] text-subtle/20">·</span>}
                              </td>
                            )
                          }

                          const isGreen = mode === 'realise'
                          const over = v > jo
                          const fullAbs = jo === 0 && joGlobal > 0
                          const barColor = over ? '#f43f5e' : isGreen ? '#34d399' : '#6366f1'
                          const trackBg  = fullAbs ? '#fef3c7' : isGreen ? '#f0fdf4' : '#eef2ff'
                          const barHeightPct = v > 0 ? Math.max(14, Math.round(ratio * 100)) : 0
                          const txtC = v > 0 ? (over ? '#e11d48' : isGreen ? '#047857' : '#4338ca') : 'transparent'

                          return (
                            <td key={`${qt.q}-${w.semaine}`} style={{ width: COL_WK }}
                              title={tooltipText}
                              className={cn('border-r border-b border-border select-none p-0',
                                isToday && 'ring-1 ring-inset ring-yellow/50')}>
                              <div className="relative h-9 flex flex-col items-center justify-end px-1 pb-0.5" style={{ background: trackBg }}>
                                {absJ > 0 && (
                                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" title={`Absence : ${absJ}j`} />
                                )}
                                {fullAbs && v === 0 && (
                                  <span className="absolute inset-0 flex items-center justify-center text-[10px] text-amber-600 font-bold">abs</span>
                                )}
                                <span className="text-[10px] font-bold tabular-nums leading-none mb-0.5" style={{ color: txtC }}>
                                  {v > 0 ? fmtJ(v) : ''}
                                </span>
                                {v > 0 ? (
                                  <div className="w-full rounded-t-sm" style={{ height: `${barHeightPct}%`, background: barColor }} />
                                ) : (
                                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                                )}
                                {/* Stacked product bar */}
                                {breakdown.length > 0 && v > 0 && (
                                  <div className="absolute bottom-0 left-0 right-0 flex h-1 overflow-hidden gap-px px-1">
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
                          className="text-center py-1.5 border-l border-border/20 border-r border-border/10 bg-slate-300 tabular-nums align-middle">
                          {dispQ > 0
                            ? <span className={cn('text-[11px] font-semibold', mode === 'realise' ? 'text-emerald-600' : 'text-indigo-600')}>{fmtJ(dispQ)}</span>
                            : <span className="text-subtle/20 text-[11px]">—</span>}
                        </td>,
                        // Charge Q (% du temps dispo)
                        <td key={`${qt.q}-r`} style={{ width: COL_Q_RESTE }}
                          className="px-2 border-r border-border/10 bg-slate-300 align-middle">
                          {maxQJ > 0 && (
                            <div>
                              <div className="h-1.5 rounded-full bg-border overflow-hidden">
                                <div className="h-full rounded-full" style={{
                                  width: `${Math.round(ratioQ * 100)}%`,
                                  background: ratioQ > 1 ? '#ef4444' : ratioQ > 0.8 ? '#f97316' : '#22c55e'
                                }} />
                              </div>
                              <div className="text-[10px] text-subtle/50 text-center mt-0.5 tabular-nums">{Math.round(ratioQ * 100)}%</div>
                            </div>
                          )}
                        </td>,
                    ]
                  })}

                  {/* Total année */}
                  <td className="px-3 py-2 border-l border-border/20 align-middle text-center" style={{ width: COL_Q }}>
                    {totAnnee > 0
                      ? <span className={cn('text-xs font-bold tabular-nums', mode === 'realise' ? 'text-emerald-600' : 'text-indigo-600')}>{fmtJ(totAnnee)}</span>
                      : <span className="text-subtle/20 text-[11px]">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>

    {absencesFor && (
      <AbsencesModal member={absencesFor} annee={annee} onClose={() => setAbsencesFor(null)} />
    )}
    </>
  )
}

// ── Modale de gestion des absences d'un membre ────────────────────
function AbsencesModal({ member, annee, onClose }: { member: UserProfile; annee: number; onClose: () => void }) {
  const tri = member.trigramme ?? ''
  const { data: absences = [] } = useAbsences(annee)
  const createAbs = useCreateAbsence()
  const deleteAbs = useDeleteAbsence()

  const [label, setLabel] = useState('Congés')
  const [debut, setDebut] = useState('')
  const [fin, setFin]     = useState('')

  const mine = absences.filter(a => a.trigramme === tri)
  const fmtD = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

  async function add() {
    if (!debut) return
    const f = !fin || fin < debut ? debut : fin
    await createAbs.mutateAsync({ trigramme: tri, annee, label: label.trim() || 'Congés', date_debut: debut, date_fin: f })
    setDebut(''); setFin('')
  }

  return (
    <div className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-modal w-full max-w-md p-5 animate-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 mb-4">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-bold shrink-0"
            style={{ background: member.couleur ?? '#4A4CC8' }}>
            {tri.slice(0, 2).toUpperCase()}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-navy truncate">Absences — {member.display_name}</h3>
            <p className="text-[11px] text-subtle">{annee} · décomptées de la capacité hebdo</p>
          </div>
          <button onClick={onClose} className="text-subtle hover:text-navy p-1"><X size={14} /></button>
        </div>

        <div className="flex flex-col gap-1.5 mb-4 max-h-52 overflow-y-auto">
          {mine.length === 0 && (
            <p className="text-xs text-subtle/50 italic py-3 text-center">Aucune absence enregistrée en {annee}</p>
          )}
          {mine.map(a => (
            <div key={a.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border bg-bg/40 group/abs">
              <CalendarOff size={12} className="text-amber-500 shrink-0" />
              <span className="text-xs font-semibold text-navy flex-1 truncate">{a.label}</span>
              <span className="text-xs text-subtle tabular-nums shrink-0">
                {fmtD(a.date_debut)}{a.date_fin !== a.date_debut && ` → ${fmtD(a.date_fin)}`}
              </span>
              <button onClick={() => deleteAbs.mutate({ id: a.id, annee })}
                className="max-md:opacity-100 opacity-0 group-hover/abs:opacity-100 text-subtle hover:text-rose-600 transition-all shrink-0">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-3">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
            <div>
              <span className="ds-label mb-1 block">Motif</span>
              <input value={label} onChange={e => setLabel(e.target.value)} className="ds-input text-xs" placeholder="Congés" />
            </div>
            <div>
              <span className="ds-label mb-1 block">Du</span>
              <input type="date" value={debut} onChange={e => setDebut(e.target.value)} className="ds-input text-xs" />
            </div>
            <div>
              <span className="ds-label mb-1 block">Au</span>
              <input type="date" value={fin} onChange={e => setFin(e.target.value)} min={debut || undefined} className="ds-input text-xs" />
            </div>
          </div>
          <button onClick={add} disabled={!debut || createAbs.isPending}
            className="ds-btn-primary w-full mt-2.5 flex items-center justify-center gap-1.5">
            <Plus size={13} /> Ajouter l'absence
          </button>
          <p className="text-[11px] text-subtle/50 mt-2 text-center">Un seul jour ? Laisse « Au » vide. Week-ends, fériés et fermetures ne sont pas décomptés.</p>
        </div>
      </div>
    </div>
  )
}
