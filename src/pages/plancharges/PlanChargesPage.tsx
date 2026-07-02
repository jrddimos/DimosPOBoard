import { useState, useMemo, useEffect, useRef } from 'react'
import { Layout } from '@/components/layout/Layout'
import { Spinner } from '@/components/ui/Spinner'
import { useProduits } from '@/hooks/useProduits'
import type { Produit } from '@/hooks/useProduits'
import { usePlanCharges, useUpsertPlanCharge, useRealiseFromTasks } from '@/hooks/usePlanCharges'
import { useAllProfiles, useAllRoles } from '@/hooks/useUserManagement'
import { usePeriodesFermeture } from '@/hooks/usePeriodesFermeture'
import { usePendingProfiles } from '@/hooks/useUserManagement'
import { getJoursFeries, joursOuvresSemaine } from '@/utils/joursFeries'
import { PlanChargesSettings } from './PlanChargesSettings'
import type { UserProfile } from '@/contexts/AuthContext'
import { Users } from 'lucide-react'
import {
  getWeeksForYear, getTrimForQ,
  DEFAULT_JOURS_TRIM, COL_PRODUIT, COL_Q, COL_Q_ALLOC, COL_Q_RESTE, COL_WK, Q_RANGE,
} from './utils'
import type { PlanMode, WeekInfo } from './utils'
import { MemberView } from './MemberView'
import { ProduitView } from './ProduitView'
import { PlanChargesTopbar } from './PlanChargesTopbar'
import { useAuth } from '@/contexts/AuthContext'

// ── Page ─────────────────────────────────────────────────────
export default function PlanChargesPage() {
  const today   = new Date()
  const curYear = today.getFullYear()

  const [annee,          setAnnee]          = useState(curYear)
  const [mode,           setMode]           = useState<PlanMode>('previsionnel')
  const [viewMode,       setViewMode]       = useState<'produit' | 'membre'>('produit')
  const [memberSearch,   setMemberSearch]   = useState('')
  const [showTip,        setShowTip]        = useState(() => localStorage.getItem('pc-hideTip') !== '1')
  const [expandedProduit,setExpandedProduit]= useState<Set<number>>(() => {
    try { const s = localStorage.getItem('pc-expandedProduit'); if (s) return new Set(JSON.parse(s)) } catch {}
    return new Set()
  })
  const [shouldScrollToday, setShouldScrollToday] = useState(false)
  const { canWrite: canWriteProduit } = useAuth()

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

  // Totaux d'en-tête (tous produits confondus) par trimestre — évite de resommer à chaque render
  const headerTotalsByQuarter = useMemo(() => {
    const m = new Map<number, { totAlloc: number; totBudget: number }>()
    quarters.forEach(qt => {
      const totAlloc  = activeProduits.reduce((s, p) => s + allocForWeeks(p.id, qt.weeks, membersByProduit.get(p.id) ?? []), 0)
      const totBudget = activeProduits.reduce((s, p) => s + budgetQ(p, qt.q), 0)
      m.set(qt.q, { totAlloc, totBudget })
    })
    return m
  }, [quarters, activeProduits, membersByProduit, planMap, annee])

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
  }, [shouldScrollToday])

  function scrollToToday() {
    if (annee !== curYear) return
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

  function toggleProduit(id: number) {
    setExpandedProduit(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  if (loadP || loadPl || loadPr || loadR) return <Layout><Spinner /></Layout>

  const totalWidth = COL_PRODUIT + quarters.reduce((s, qt) => {
    return s + qt.weeks.length * COL_WK + COL_Q_ALLOC + COL_Q_RESTE
  }, 0) + COL_Q   // colonne Total année

  return (
    <Layout>
      <PlanChargesTopbar
        annee={annee} setAnnee={setAnnee} curYear={curYear} scrollToToday={scrollToToday}
        viewMode={viewMode} setViewMode={setViewMode} memberSearch={memberSearch} setMemberSearch={setMemberSearch}
        mode={mode} setMode={setMode}
        setShowSettings={setShowSettings}
        showTip={showTip} setShowTip={setShowTip}
      />

      {activeProduits.length === 0 ? (
        <div className="text-center py-16 text-subtle text-sm">Aucun produit actif.</div>
      ) : viewMode === 'membre' ? (
        /* ══════════════════ VUE PAR MEMBRE ══════════════════ */
        <MemberView
          annee={annee}
          curYear={curYear}
          mode={mode}
          quarters={quarters}
          profiles={profiles}
          allRoles={allRoles}
          activeProduits={activeProduits}
          planMap={planMap}
          planMapR={planMapR}
          joursOuvresMap={joursOuvresMap}
          currentISOWeek={currentISOWeek}
          feriesMap={feriesMap}
          fermeturesDayMap={fermeturesDayMap}
          search={memberSearch}
        />
      ) : (
        <ProduitView
          today={today} annee={annee} curYear={curYear} mode={mode} currentISOWeek={currentISOWeek}
          quarters={quarters} activeProduits={activeProduits}
          expandedProduit={expandedProduit} toggleProduit={toggleProduit}
          membersByProduit={membersByProduit} headerTotalsByQuarter={headerTotalsByQuarter}
          getMaxJours={getMaxJours} feriesMap={feriesMap} fermeturesDayMap={fermeturesDayMap}
          cellVal={cellVal} cellValR={cellValR} produitWkTotal={produitWkTotal} produitWkTotalR={produitWkTotalR}
          allocForWeeks={allocForWeeks} realiseForWeeks={realiseForWeeks} budgetQ={budgetQ}
          editCell={editCell} setEditCell={setEditCell} dragRange={dragRange} setDragRange={setDragRange}
          dragRef={dragRef} hasDragged={hasDragged}
          saveCell={saveCell} totalWidth={totalWidth}
          canWriteProduit={canWriteProduit}
        />
      )}

      <div className="flex items-center flex-wrap gap-4 mt-3 text-[10px] text-subtle">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-3 rounded-t-sm bg-indigo-500" />
          hauteur de barre = % de charge de la semaine
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-3 rounded-t-sm bg-rose-500" />
          dépassement de capacité
        </span>
        <span className="mx-1 h-3 w-px bg-border" />
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
