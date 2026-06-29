import { useState, useMemo, useEffect, useRef } from 'react'
import { Layout } from '@/components/layout/Layout'
import { Spinner } from '@/components/ui/Spinner'
import { useProduits } from '@/hooks/useProduits'
import type { Produit, TrimObjectif } from '@/hooks/useProduits'
import { usePlanCharges, useUpsertPlanCharge } from '@/hooks/usePlanCharges'
import { useAllProfiles, useAllRoles } from '@/hooks/useUserManagement'
import { usePeriodesFermeture } from '@/hooks/usePeriodesFermeture'
import { usePendingProfiles } from '@/hooks/useUserManagement'
import { getJoursFeries, joursOuvresSemaine, labelsFermes } from '@/utils/joursFeries'
import { PlanChargesSettings } from './PlanChargesSettings'
import type { UserProfile } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, Users, Settings } from 'lucide-react'

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
function CellInput({ initVal, maxJours, onSave, onCancel }: {
  initVal:  number
  maxJours: number   // jours ouvrés disponibles cette semaine
  onSave:   (v: number) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [val, setVal] = useState(initVal === 0 ? '' : String(initVal))
  useEffect(() => { ref.current?.select() }, [])

  const numVal  = parseFloat(val.replace(',', '.'))
  const tooHigh = !isNaN(numVal) && numVal > maxJours

  function commit() {
    const n = parseFloat(val.replace(',', '.'))
    if (isNaN(n) || n < 0) { onSave(0); return }
    onSave(Math.min(n, maxJours))  // cap silencieux au max
  }

  return (
    <div className="relative">
      <input ref={ref} type="text" inputMode="decimal" value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter')  { e.preventDefault(); commit() }
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        }}
        className={cn(
          'w-full text-center text-[11px] font-semibold rounded outline-none py-0.5 tabular-nums border',
          tooHigh
            ? 'bg-red/10 border-red/60 text-red'
            : 'bg-blue/10 border-blue/50 text-blue'
        )}
      />
      {tooHigh && (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] bg-red text-white px-1.5 py-0.5 rounded z-10">
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
  if (reste < 0)  return 'text-red font-bold'
  if (reste === 0) return 'text-green font-semibold'
  return 'text-orange font-semibold'
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

// ── Page ─────────────────────────────────────────────────────
export default function PlanChargesPage() {
  const today   = new Date()
  const curYear = today.getFullYear()

  const [annee,          setAnnee]          = useState(curYear)
  const [expandedQ,      setExpandedQ]      = useState<Set<number>>(new Set())
  const [expandedProduit,setExpandedProduit]= useState<Set<number>>(new Set())

  const { data: produits        = [], isLoading: loadP  } = useProduits()
  const { data: planData        = [], isLoading: loadPl } = usePlanCharges(annee)
  const { data: profiles        = [], isLoading: loadPr } = useAllProfiles()
  const { data: allRoles        = [], isLoading: loadR  } = useAllRoles()
  const { data: fermetures      = [] }                    = usePeriodesFermeture(annee)
  const { data: pendingProfiles = [] }                    = usePendingProfiles()
  const upsert = useUpsertPlanCharge()

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

  // Valeur pour un (produit, semaine, assigne_a)
  function cellVal(produit_id: number, semaine: number, assigne_a: string): number {
    return planMap.get(`${produit_id}|${semaine}|${assigne_a}`) ?? 0
  }

  // Total produit pour une semaine (somme de tous les membres / entrée directe)
  function produitWkTotal(produit_id: number, semaine: number, members: UserProfile[]): number {
    if (members.length === 0) return cellVal(produit_id, semaine, '')
    return members.reduce((s, m) => s + cellVal(produit_id, semaine, m.trigramme ?? ''), 0)
  }

  // Somme pour un ensemble de semaines
  function allocForWeeks(produit_id: number, weeks: WeekInfo[], members: UserProfile[]): number {
    return weeks.reduce((s, w) => s + produitWkTotal(produit_id, w.semaine, members), 0)
  }

  // Budget trimestriel en jours
  function budgetQ(p: Produit, q: number): number {
    const t = getTrimForQ(p, q, annee)
    if (!t?.budget_etp) return 0
    return Math.round(t.budget_etp * (t.jours_ouvres ?? DEFAULT_JOURS_TRIM) * 10) / 10
  }

  // Edit cell state
  const [editCell, setEditCell] = useState<{ produit_id: number; semaine: number; assigne_a: string } | null>(null)

  function saveCell(produit_id: number, semaine: number, assigne_a: string, jours: number) {
    upsert.mutate({ produit_id, epic: '', assigne_a, semaine, annee, jours })
    setEditCell(null)
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

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-subtle">Année</span>
            <select value={annee} onChange={e => setAnnee(Number(e.target.value))}
              className="ds-select text-xs py-1 w-24">
              {[curYear - 1, curYear, curYear + 1].map(y => <option key={y}>{y}</option>)}
            </select>
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
      ) : (
        <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse" style={{ minWidth: totalWidth }}>
              <thead>
                {/* ── Ligne 1 : trimestres ─────────────────── */}
                <tr className="border-b border-border/40 bg-navy/5">
                  <th className="sticky left-0 z-20 bg-navy/5 text-left px-4 py-2 border-r border-border"
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
                                  <span className="font-semibold text-blue">{totAlloc > 0 ? fmtJ(totAlloc) : '0j'}</span>
                                  <span className={cn('font-semibold', totBudget - totAlloc < 0 ? 'text-red' : totBudget - totAlloc === 0 ? 'text-green' : 'text-subtle')}>
                                    / {fmtJ(totBudget)}
                                  </span>
                                </div>
                                <div className="h-1.5 rounded-full bg-[#e5e7eb] overflow-hidden">
                                  <div className={cn('h-full rounded-full transition-all',
                                    totAlloc > totBudget ? 'bg-red' : totAlloc === totBudget ? 'bg-green' : 'bg-blue'
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
                    className="text-center py-2 text-[10px] font-bold text-navy/60 bg-navy/5 border-l border-border">
                    Total<br />année
                  </th>
                </tr>

                {/* ── Ligne 2 : sous-colonnes semaines (uniquement pour trimestres dépliés) ── */}
                <tr className="bg-navy text-white border-b border-navy/20">
                  {quarters.filter(qt => expandedQ.has(qt.q)).flatMap(qt => [
                    ...qt.weeks.map(w => {
                      const jo      = getMaxJours(w.semaine)
                      const isFerme = jo === 0
                      const hasOff  = jo < 5
                      const labels  = labelsFermes(w.lundi, feriesMap, fermeturesDayMap)
                      return (
                        <th key={`${qt.q}-${w.semaine}`} style={{ width: COL_WK }}
                          title={labels.length ? labels.join(' · ') : undefined}
                          className={cn(
                            'text-center py-1.5 border-r border-white/10 font-semibold tabular-nums',
                            isFerme ? 'bg-red/30' : hasOff ? 'bg-orange/20' : ''
                          )}>
                          <div className="text-[9px] text-white/50">{fmtDayMonth(w.lundi)}</div>
                          <div className="text-[10px]">S{String(w.semaine).padStart(2,'0')}</div>
                          <div className={cn('text-[8px] font-bold mt-0.5',
                            isFerme ? 'text-red/80' : hasOff ? 'text-orange/80' : 'text-white/30')}>
                            {jo}j
                          </div>
                        </th>
                      )
                    }),
                    <th key={`${qt.q}-tot-a`} style={{ width: COL_Q_ALLOC }}
                      className="text-center py-2 border-l border-white/30 border-r border-white/10 text-[10px] font-bold text-white/90 bg-white/5">
                      Saisi
                    </th>,
                    <th key={`${qt.q}-tot-r`} style={{ width: COL_Q_RESTE }}
                      className="text-center py-2 border-r border-white/10 text-[10px] font-bold text-white/60 bg-white/5">
                      Reste
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
                    const v = isTotal
                      ? produitWkTotal(p.id, semaine, members2)
                      : cellVal(p.id, semaine, assigne_a)
                    const isEdit = !isTotal && editCell?.produit_id === p.id
                      && editCell?.semaine === semaine && editCell?.assigne_a === assigne_a
                    const isInDrag  = !isTotal && dragRange !== null
                      && dragRange.produit_id === p.id && dragRange.assigne_a === assigne_a
                      && semaine >= dragRange.min && semaine <= dragRange.max
                    const maxJours  = getMaxJours(semaine)
                    const isClosed  = maxJours === 0 || noBudget

                    if (isTotal) {
                      return (
                        <td key={`${semaine}-tot`} style={{ width: COL_WK }}
                          className={cn(
                            'text-center px-1 py-1.5 border-r border-b border-[#d1d5db]',
                            isPast ? 'bg-[#f3f4f6]' : 'bg-[#f9fafb]'
                          )}>
                          {v > 0 && (
                            <span className="inline-block text-[10px] rounded px-1 py-0.5 font-bold w-full text-center tabular-nums text-navy/60">
                              {fmtJ(v)}
                            </span>
                          )}
                        </td>
                      )
                    }

                    return (
                      <td key={`${semaine}-${assigne_a}`} style={{ width: COL_WK }}
                        className={cn(
                          'text-center px-1 py-1.5 border-r border-b border-[#d1d5db] select-none transition-colors',
                          isInDrag
                            ? 'bg-blue/25 ring-2 ring-inset ring-blue cursor-crosshair'
                            : isClosed
                              ? 'bg-[#fee2e2] cursor-not-allowed'
                              : isPast
                                ? 'bg-[#f3f4f6] cursor-pointer hover:bg-blue/10'
                                : 'bg-[#eff6ff] cursor-pointer hover:bg-blue/20'
                        )}
                        onMouseDown={e => {
                          if (isEdit || isClosed) return
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
                          if (hasDragged.current || isClosed) return
                          if (!isEdit) setEditCell({ produit_id: p.id, semaine, assigne_a })
                        }}>
                        {isEdit ? (
                          <CellInput
                            initVal={v}
                            maxJours={getMaxJours(semaine)}
                            onSave={jours => saveCell(p.id, semaine, assigne_a, jours)}
                            onCancel={() => setEditCell(null)}
                          />
                        ) : v > 0 ? (
                          <span className={cn(
                            'inline-block text-[11px] rounded-sm px-1 py-0.5 font-bold w-full text-center tabular-nums pointer-events-none',
                            isInDrag       ? 'bg-blue/40 text-blue'
                            : isPast       ? 'bg-[#d1d5db] text-[#6b7280]'
                            :                'bg-blue text-white'
                          )}>
                            {fmtJ(v)}
                          </span>
                        ) : (
                          <span className={cn(
                            'inline-flex items-center justify-center w-full h-5 text-[10px] pointer-events-none',
                            isPast ? 'text-[#9ca3af]' : 'text-[#bfdbfe]'
                          )}>
                            ·
                          </span>
                        )}
                      </td>
                    )
                  }

                  // ── Rendu cellule trimestre repliée (1 seule colonne, barre de progression) ──
                  function renderQCollapsed(qt: { q: number; weeks: WeekInfo[] }) {
                    const bq     = budgetQ(p, qt.q)
                    const allocQ = allocForWeeks(p.id, qt.weeks, members)
                    const reste  = bq > 0 ? Math.round((bq - allocQ) * 10) / 10 : null
                    const pct    = bq > 0 ? Math.min(100, Math.round(allocQ / bq * 100)) : 0
                    const over   = bq > 0 && allocQ > bq

                    // Pas de budget trimestriel ni global : cellule grisée, saisie interdite
                    if (bq === 0 && !p.budget_etp) {
                      return (
                        <td key={`${qt.q}-collapsed`} style={{ width: COL_Q }}
                          className="px-3 py-2 border-r border-b border-[#d1d5db] bg-[#f3f4f6] align-middle text-center">
                          <span className="text-[10px] text-subtle/40 italic select-none">Aucun budget</span>
                        </td>
                      )
                    }

                    return (
                      <td key={`${qt.q}-collapsed`} style={{ width: COL_Q }}
                        className="px-3 py-2 border-r border-b border-[#d1d5db] align-middle">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between tabular-nums">
                            <span className={cn('text-[11px] font-bold', over ? 'text-red' : 'text-blue')}>
                              {allocQ > 0 ? fmtJ(allocQ) : '0j'}
                            </span>
                            <span className={cn('text-[10px] font-semibold', resteClass(reste))}>
                              {reste !== null ? fmtReste(reste) : ''}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[#e5e7eb] overflow-hidden">
                            <div className={cn('h-full rounded-full transition-all',
                              over ? 'bg-red' : allocQ === bq ? 'bg-green' : 'bg-blue'
                            )} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="text-[9px] text-subtle/50 tabular-nums text-right">
                            / {fmtJ(bq)}
                          </div>
                        </div>
                      </td>
                    )
                  }

                  return (
                    <>
                      {/* ── Ligne produit ─────────────────────── */}
                      <tr key={`prod-${p.id}`}
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
                                totReste < 0  ? 'bg-red/10 text-red font-bold' :
                                totReste === 0 ? 'bg-green/10 text-green font-semibold' :
                                                'bg-orange/10 text-orange font-semibold'
                              )}>
                                {fmtReste(totReste)}
                              </span>
                            )}

                            {/* Bouton expand membres */}
                            {hasMembers && (
                              <button onClick={() => toggleProduit(p.id)}
                                className="flex items-center gap-0.5 text-subtle hover:text-blue transition-colors shrink-0 ml-1">
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
                                  totAlloue > totBudget ? 'text-red' : 'text-blue')}>
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
                                  totAlloue > totBudget ? 'bg-red' : totAlloue === totBudget ? 'bg-green' : 'bg-blue'
                                )} style={{ width: `${Math.min(100, totBudget > 0 ? Math.round(totAlloue/totBudget*100) : 0)}%` }} />
                              </div>
                              <div className="text-[9px] text-subtle/50 tabular-nums text-right">/ {fmtJ(totBudget)}</div>
                            </div>
                          ) : (
                            totAlloue > 0
                              ? <span className="text-[11px] font-bold text-blue tabular-nums">{fmtJ(totAlloue)}</span>
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

                              if (isExpQ) {
                                return [
                                  ...qt.weeks.map(w => {
                                    const isPast = w.lundi < today
                                    return renderWkCell(w.semaine, tri, false, isPast, noBudget)
                                  }),
                                  // Sous-total saisi membre pour ce trimestre déplié
                                  <td key={`${qt.q}-a`} style={{ width: COL_Q_ALLOC }}
                                    className="text-center py-1.5 border-l border-border/20 border-r border-border/10 tabular-nums bg-bg/30">
                                    {allocQ > 0
                                      ? <span className="text-[10px] text-blue">{fmtJ(allocQ)}</span>
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
                                  {allocQ > 0
                                    ? <span className="text-[10px] text-blue/80 font-semibold">{fmtJ(allocQ)}</span>
                                    : <span className="text-subtle/20 text-[10px]">—</span>}
                                </td>
                              )
                            })}

                            {/* Total année membre (1 colonne) */}
                            <td className="text-center py-1.5 border-l border-border/20 tabular-nums" style={{ width: COL_Q }}>
                              {memberAlloue > 0
                                ? <span className="text-[10px] text-blue font-semibold">{fmtJ(memberAlloue)}</span>
                                : <span className="text-subtle/20 text-[10px]">—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </>
                  )
                })}
              </tbody>

              {/* ── Footer totaux équipe ──────────────────────── */}
              <tfoot>
                <tr className="border-t-2 border-navy/10 bg-navy/5">
                  <td className="sticky left-0 z-10 bg-navy/5 px-4 py-2 font-bold text-navy text-[10px] uppercase tracking-wider border-r border-border/30"
                    style={{ width: COL_PRODUIT }}>
                    Total équipe
                  </td>
                  {quarters.map(qt => {
                    const isExpQ    = expandedQ.has(qt.q)
                    const totBudget = activeProduits.reduce((s, p) => s + budgetQ(p, qt.q), 0)

                    const totAlloc = activeProduits.reduce((s, p) => {
                      const members = membersByProduit.get(p.id) ?? []
                      return s + allocForWeeks(p.id, qt.weeks, members)
                    }, 0)
                    const totReste = totBudget > 0
                      ? Math.round((totBudget - totAlloc) * 10) / 10 : null

                    if (isExpQ) {
                      return [
                        ...qt.weeks.map(w => {
                          const v = activeProduits.reduce((s, p) => {
                            const members = membersByProduit.get(p.id) ?? []
                            return s + produitWkTotal(p.id, w.semaine, members)
                          }, 0)
                          return (
                            <td key={w.semaine} style={{ width: COL_WK }}
                              className="text-center py-2 border-r border-b border-[#d1d5db] tabular-nums">
                              {v > 0 && (
                                <span className={cn('text-[10px] font-bold',
                                  v > 10 ? 'text-red' : v > 5 ? 'text-orange' : 'text-navy/70')}>
                                  {fmtJ(v)}
                                </span>
                              )}
                            </td>
                          )
                        }),
                        // Sous-total "Saisi|Reste" du trimestre déplié dans le footer
                        <td key={`${qt.q}-a`} style={{ width: COL_Q_ALLOC }}
                          className="text-center py-2 border-l border-border/30 border-r border-border/20 tabular-nums bg-navy/10">
                          <span className={cn('text-[11px] font-bold', totAlloc > 0 ? 'text-blue' : 'text-subtle/30')}>
                            {totAlloc > 0 ? fmtJ(totAlloc) : '—'}
                          </span>
                        </td>,
                        <td key={`${qt.q}-r`} style={{ width: COL_Q_RESTE }}
                          className="text-center py-2 border-r border-border/20 tabular-nums bg-navy/10">
                          {totReste !== null
                            ? <span className={cn('text-[11px] font-bold', resteClass(totReste))}>{fmtReste(totReste)}</span>
                            : <span className="text-subtle/30 text-[10px]">—</span>}
                        </td>,
                      ]
                    }

                    // Trimestre replié : 1 cellule avec barre de progression
                    const pctFt = totBudget > 0 ? Math.min(100, Math.round(totAlloc / totBudget * 100)) : 0
                    return (
                      <td key={`${qt.q}-col`} style={{ width: COL_Q }}
                        className="px-3 py-2 border-r border-[#d1d5db] align-middle">
                        {totBudget > 0 ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between tabular-nums">
                              <span className={cn('text-[11px] font-bold',
                                totAlloc > totBudget ? 'text-red' : 'text-blue')}>
                                {fmtJ(totAlloc) || '0j'}
                              </span>
                              {totReste !== null && (
                                <span className={cn('text-[10px] font-bold', resteClass(totReste))}>
                                  {fmtReste(totReste)}
                                </span>
                              )}
                            </div>
                            <div className="h-1.5 rounded-full bg-white/50 overflow-hidden">
                              <div className={cn('h-full rounded-full transition-all',
                                totAlloc > totBudget ? 'bg-red' : totAlloc === totBudget ? 'bg-green' : 'bg-blue'
                              )} style={{ width: `${pctFt}%` }} />
                            </div>
                            <div className="text-[9px] text-navy/40 tabular-nums text-right">/ {fmtJ(totBudget)}</div>
                          </div>
                        ) : (
                          <span className={cn('text-[11px] font-bold', totAlloc > 0 ? 'text-blue' : 'text-subtle/30')}>
                            {totAlloc > 0 ? fmtJ(totAlloc) : '—'}
                          </span>
                        )}
                      </td>
                    )
                  })}
                  {/* Total année footer (1 colonne) */}
                  {(() => {
                    const totB = activeProduits.reduce((s, p) => s + quarters.reduce((qs, qt) => qs + budgetQ(p, qt.q), 0), 0)
                    const totA = activeProduits.reduce((s, p) => {
                      const m = membersByProduit.get(p.id) ?? []
                      return s + quarters.reduce((qs, qt) => qs + allocForWeeks(p.id, qt.weeks, m), 0)
                    }, 0)
                    const reste  = totB > 0 ? totB - totA : null
                    const pctAnn = totB > 0 ? Math.min(100, Math.round(totA / totB * 100)) : 0
                    return (
                      <td className="px-3 py-2 border-l border-border/30 align-middle" style={{ width: COL_Q }}>
                        {totB > 0 ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between tabular-nums">
                              <span className={cn('text-[11px] font-bold', totA > totB ? 'text-red' : 'text-blue')}>{fmtJ(totA) || '0j'}</span>
                              {reste !== null && <span className={cn('text-[10px] font-bold', resteClass(reste))}>{fmtReste(reste)}</span>}
                            </div>
                            <div className="h-1.5 rounded-full bg-white/50 overflow-hidden">
                              <div className={cn('h-full rounded-full', totA > totB ? 'bg-red' : totA === totB ? 'bg-green' : 'bg-blue')}
                                style={{ width: `${pctAnn}%` }} />
                            </div>
                            <div className="text-[9px] text-navy/40 tabular-nums text-right">/ {fmtJ(totB)}</div>
                          </div>
                        ) : (
                          <span className="text-[11px] font-bold text-blue tabular-nums">{totA > 0 ? fmtJ(totA) : '—'}</span>
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
        <span className="inline-block px-1.5 py-0.5 rounded bg-blue/10 text-blue font-semibold">3j</span>
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
