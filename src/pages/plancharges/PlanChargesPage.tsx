import { useState, useMemo, useEffect, useRef } from 'react'
import { Layout } from '@/components/layout/Layout'
import { Spinner } from '@/components/ui/Spinner'
import { useProduits } from '@/hooks/useProduits'
import type { Produit } from '@/hooks/useProduits'
import { usePlanCharges, useUpsertPlanCharge, useRealiseFromTasks } from '@/hooks/usePlanCharges'
import { useAllProfiles, useAllRoles } from '@/hooks/useUserManagement'
import { usePeriodesFermeture } from '@/hooks/usePeriodesFermeture'
import { useAbsencesCapacite } from '@/hooks/useAbsences'
import { getISOWeek } from '@/lib/utils'
import { usePendingProfiles } from '@/hooks/useUserManagement'
import { getJoursFeries, joursOuvresSemaine } from '@/utils/joursFeries'
import { PlanChargesSettings } from './PlanChargesSettings'
import type { UserProfile } from '@/contexts/AuthContext'
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
  // Vue par défaut = Par membre : c'est là que la saisie du temps se fait le
  // plus souvent (un membre, produit par produit), cf. toggle inversé aussi.
  const [viewMode,       setViewMode]       = useState<'produit' | 'membre'>('membre')
  const [memberSearch,   setMemberSearch]   = useState('')
  // Vue Membre : n'affiche par défaut que les membres ayant un rôle sur un
  // produit actif — ce toggle étend la liste à tous les profils identifiables
  // (trigramme renseigné), y compris ceux pas encore rattachés à un produit.
  const [showAllUsers,   setShowAllUsers]   = useState(false)
  const [showTip,        setShowTip]        = useState(() => localStorage.getItem('pc-hideTip') !== '1')
  const [expandedProduit,setExpandedProduit]= useState<Set<number>>(() => {
    try { const s = localStorage.getItem('pc-expandedProduit'); if (s) return new Set(JSON.parse(s)) } catch {}
    return new Set()
  })
  // Symétrique d'expandedProduit, pour la vue Membre : membre → produits.
  const [expandedMember, setExpandedMember] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem('pc-expandedMember'); if (s) return new Set(JSON.parse(s)) } catch {}
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

  // ── Absences individuelles : jours d'absence ouvrés par (trigramme, semaine) ──
  const { data: absences = [] } = useAbsencesCapacite(annee)
  const absWkMap = useMemo(() => {
    const m = new Map<string, number>()
    absences.forEach(a => {
      const d = new Date(a.date_debut + 'T00:00:00')
      const end = new Date(a.date_fin + 'T00:00:00')
      while (d <= end) {
        const dow = d.getDay()
        const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        if (dow !== 0 && dow !== 6 && !feriesSet.has(iso) && !fermeturesDayMap.has(iso)) {
          const k = `${a.trigramme}|${getISOWeek(d).semaine}`
          m.set(k, (m.get(k) ?? 0) + 1)
        }
        d.setDate(d.getDate() + 1)
      }
    })
    return m
  }, [absences, feriesSet, fermeturesDayMap])

  // Capacité individuelle : jours ouvrés de la semaine − absences du membre
  function memberMaxJours(tri: string, semaine: number): number {
    if (!tri) return getMaxJours(semaine)
    return Math.max(0, getMaxJours(semaine) - (absWkMap.get(`${tri}|${semaine}`) ?? 0))
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

  // Tous les users identifiables (trigramme requis, sinon aucune case
  // plan_charges possible) — actifs + en attente de validation, sans
  // condition de rôle sur un produit. Sert au toggle « Voir tous les users »
  // de la vue Membre : un profil sans rôle n'est pas invisible pour autant,
  // juste pas encore rattaché formellement à un produit.
  const allProfilesExt = useMemo(() => {
    const list: UserProfile[] = profiles.filter(p => p.actif !== false)
    const seen = new Set(list.map(p => p.user_id))
    for (const pp of pendingProfiles) {
      if (!pp.trigramme) continue
      const user_id = `pending_${pp.id}`
      if (seen.has(user_id)) continue
      list.push({
        user_id, display_name: pp.display_name, trigramme: pp.trigramme,
        prenom: pp.prenom, nom: pp.nom, couleur: pp.couleur ?? '#4A4CC8', actif: true,
        equipe_id: pp.equipe_ids?.[0] ?? null, equipe_ids: pp.equipe_ids ?? [],
        role_global: pp.role_global, avatar_url: null,
      } as UserProfile)
      seen.add(user_id)
    }
    return list
  }, [profiles, pendingProfiles])

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

  // ── KPIs de synthèse (bandeau) ────────────────────────────────
  const kpis = useMemo(() => {
    const activeIds = new Set(activeProduits.map(p => p.id))
    const membres = profiles.filter(pr => pr.actif !== false && pr.trigramme
      && allRoles.some(r => r.user_id === pr.user_id && activeIds.has(r.produit_id)))
    const tris = membres.map(m => m.trigramme!)

    const allocTri = (tri: string, semaine: number) =>
      activeProduits.reduce((s, p) => s + (planMap.get(`${p.id}|${semaine}|${tri}`) ?? 0), 0)

    // Surcharges : 4 prochaines semaines (année courante) ou toute l'année sinon
    const isCur = annee === curYear
    const scanWeeks = isCur
      ? allWeeks.filter(w => w.semaine >= currentISOWeek && w.semaine < currentISOWeek + 4)
      : allWeeks
    const overTris = new Set<string>()
    let overCount = 0
    tris.forEach(tri => scanWeeks.forEach(w => {
      const capa = memberMaxJours(tri, w.semaine)
      if (allocTri(tri, w.semaine) > capa) { overCount++; overTris.add(tri) }
    }))

    // Capacité libre : semaines restantes du trimestre courant (ou année complète)
    const qCur = quarters.find(qt => qt.weeks.some(w => w.semaine === currentISOWeek))
    const libreWeeks = isCur
      ? (qCur?.weeks.filter(w => w.semaine >= currentISOWeek) ?? [])
      : allWeeks
    let libre = 0
    tris.forEach(tri => libreWeeks.forEach(w => {
      libre += Math.max(0, memberMaxJours(tri, w.semaine) - allocTri(tri, w.semaine))
    }))

    // Réalisé vs prévisionnel sur les semaines écoulées
    let prevPast = 0, realPast = 0
    const pastMax = isCur ? currentISOWeek : 54
    planMap.forEach((v, k) => { if (Number(k.split('|')[1]) < pastMax) prevPast += v })
    planMapR.forEach((v, k) => { if (Number(k.split('|')[1]) < pastMax) realPast += v })
    const tauxRealise = prevPast > 0 ? Math.round(realPast / prevPast * 100) : null

    // Budget du trimestre courant
    const qBudget = qCur ? headerTotalsByQuarter.get(qCur.q) : undefined

    return { isCur, overCount, overTris: [...overTris], libre: Math.round(libre * 10) / 10, qCurLabel: qCur?.label ?? '', tauxRealise, prevPast: Math.round(prevPast), realPast: Math.round(realPast), qBudget }
  }, [activeProduits, profiles, allRoles, planMap, planMapR, allWeeks, quarters, annee, curYear, currentISOWeek, absWkMap, headerTotalsByQuarter])

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
  useEffect(() => { localStorage.setItem('pc-expandedMember', JSON.stringify(Array.from(expandedMember))) }, [expandedMember])

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
        const { produit_id, assigne_a } = dragRef.current
        // Semaines fermées (férié/fermeture, ou absence individuelle qui vide
        // toute la capacité de la semaine) exclues du remplissage groupé — un
        // congé au milieu de la plage glissée ne doit jamais recevoir la
        // valeur commune.
        const semaines: number[] = []
        for (let s = dragRange.min; s <= dragRange.max; s++) {
          const maxJours = assigne_a ? memberMaxJours(assigne_a, s) : getMaxJours(s)
          if (maxJours > 0) semaines.push(s)
        }
        if (semaines.length) {
          setFillModal({ produit_id, assigne_a, semaines })
          setFillVal('')
        }
      }
      dragRef.current  = null
      hasDragged.current = false
      setDragRange(null)
    }
    window.addEventListener('mouseup', onGlobalMouseUp)
    return () => window.removeEventListener('mouseup', onGlobalMouseUp)
  }, [dragRange])

  // Annulation temporaire après un remplissage multiple
  const [undoFill, setUndoFill] = useState<{ produit_id: number; assigne_a: string; prev: { semaine: number; jours: number }[] } | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function applyFill() {
    if (!fillModal) return
    const jours = parseFloat(fillVal.replace(',', '.'))
    if (!isNaN(jours) && jours >= 0) {
      // Capture des valeurs actuelles pour pouvoir annuler
      const prev = fillModal.semaines.map(semaine => ({
        semaine, jours: cellVal(fillModal.produit_id, semaine, fillModal.assigne_a),
      }))
      fillModal.semaines.forEach(semaine =>
        upsert.mutate({ produit_id: fillModal.produit_id, epic: '', assigne_a: fillModal.assigne_a, semaine, annee, jours })
      )
      setUndoFill({ produit_id: fillModal.produit_id, assigne_a: fillModal.assigne_a, prev })
      if (undoTimer.current) clearTimeout(undoTimer.current)
      undoTimer.current = setTimeout(() => setUndoFill(null), 10_000)
    }
    setFillModal(null)
  }

  function undoLastFill() {
    if (!undoFill) return
    undoFill.prev.forEach(e =>
      upsert.mutate({ produit_id: undoFill.produit_id, epic: '', assigne_a: undoFill.assigne_a, semaine: e.semaine, annee, jours: e.jours })
    )
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndoFill(null)
  }

  function toggleProduit(id: number) {
    setExpandedProduit(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleMember(user_id: string) {
    setExpandedMember(prev => { const n = new Set(prev); n.has(user_id) ? n.delete(user_id) : n.add(user_id); return n })
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
        showAllUsers={showAllUsers} setShowAllUsers={setShowAllUsers}
      />

      {/* ── Bandeau KPI ─────────────────────────────────────── */}
      {activeProduits.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div className="bg-card border border-border rounded-2xl px-4 py-3 shadow-sm">
            <div className="text-[11px] font-semibold text-subtle uppercase tracking-wide mb-1">
              Surcharges {kpis.isCur ? '· 4 prochaines sem.' : `· ${annee}`}
            </div>
            {kpis.overCount === 0 ? (
              <span className="text-xl font-extrabold text-emerald-600">0 <span className="text-xs font-semibold">tout va bien</span></span>
            ) : (
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-xl font-extrabold text-rose-600 tabular-nums">{kpis.overCount}</span>
                <span className="text-xs text-subtle truncate">sem. × membre · {kpis.overTris.slice(0, 4).join(', ')}{kpis.overTris.length > 4 ? '…' : ''}</span>
              </div>
            )}
          </div>
          <div className="bg-card border border-border rounded-2xl px-4 py-3 shadow-sm">
            <div className="text-[11px] font-semibold text-subtle uppercase tracking-wide mb-1">
              Capacité libre {kpis.isCur && kpis.qCurLabel ? `· reste ${kpis.qCurLabel}` : `· ${annee}`}
            </div>
            <span className="text-xl font-extrabold text-navy tabular-nums">{kpis.libre}<span className="text-xs font-semibold text-subtle"> jours</span></span>
          </div>
          <div className="bg-card border border-border rounded-2xl px-4 py-3 shadow-sm">
            <div className="text-[11px] font-semibold text-subtle uppercase tracking-wide mb-1">Réalisé vs prévu · sem. écoulées</div>
            {kpis.tauxRealise === null ? (
              <span className="text-xs text-subtle italic">Rien de planifié</span>
            ) : (
              <div className="flex items-baseline gap-2">
                <span className={`text-xl font-extrabold tabular-nums ${kpis.tauxRealise > 115 ? 'text-rose-600' : kpis.tauxRealise < 70 ? 'text-amber-600' : 'text-emerald-600'}`}>{kpis.tauxRealise}%</span>
                <span className="text-xs text-subtle tabular-nums">{kpis.realPast}j / {kpis.prevPast}j</span>
              </div>
            )}
          </div>
          <div className="bg-card border border-border rounded-2xl px-4 py-3 shadow-sm">
            <div className="text-[11px] font-semibold text-subtle uppercase tracking-wide mb-1">Budget {kpis.qCurLabel && kpis.isCur ? `· ${kpis.qCurLabel}` : ''}</div>
            {kpis.qBudget && kpis.qBudget.totBudget > 0 ? (
              <div className="flex items-baseline gap-2">
                <span className={`text-xl font-extrabold tabular-nums ${kpis.qBudget.totAlloc > kpis.qBudget.totBudget ? 'text-rose-600' : 'text-navy'}`}>
                  {Math.round(kpis.qBudget.totAlloc)}j
                </span>
                <span className="text-xs text-subtle tabular-nums">/ {Math.round(kpis.qBudget.totBudget)}j alloués</span>
              </div>
            ) : (
              <span className="text-xs text-subtle italic">Pas de budget trimestriel</span>
            )}
          </div>
        </div>
      )}

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
          allProfilesExt={allProfilesExt}
          showAllUsers={showAllUsers}
          activeProduits={activeProduits}
          planMap={planMap}
          planMapR={planMapR}
          joursOuvresMap={joursOuvresMap}
          memberMaxJours={memberMaxJours}
          currentISOWeek={currentISOWeek}
          feriesMap={feriesMap}
          fermeturesDayMap={fermeturesDayMap}
          search={memberSearch}
          expandedMember={expandedMember}
          toggleMember={toggleMember}
          cellVal={cellVal}
          cellValR={cellValR}
          editCell={editCell}
          setEditCell={setEditCell}
          dragRange={dragRange}
          setDragRange={setDragRange}
          dragRef={dragRef}
          hasDragged={hasDragged}
          saveCell={saveCell}
          canWriteProduit={canWriteProduit}
        />
      ) : (
        <ProduitView
          today={today} annee={annee} curYear={curYear} mode={mode} currentISOWeek={currentISOWeek}
          quarters={quarters} activeProduits={activeProduits}
          expandedProduit={expandedProduit} toggleProduit={toggleProduit}
          membersByProduit={membersByProduit} headerTotalsByQuarter={headerTotalsByQuarter}
          getMaxJours={getMaxJours} memberMaxJours={memberMaxJours} feriesMap={feriesMap} fermeturesDayMap={fermeturesDayMap}
          cellVal={cellVal} cellValR={cellValR} produitWkTotal={produitWkTotal} produitWkTotalR={produitWkTotalR}
          allocForWeeks={allocForWeeks} realiseForWeeks={realiseForWeeks} budgetQ={budgetQ}
          editCell={editCell} setEditCell={setEditCell} dragRange={dragRange} setDragRange={setDragRange}
          dragRef={dragRef} hasDragged={hasDragged}
          saveCell={saveCell} totalWidth={totalWidth}
          canWriteProduit={canWriteProduit}
        />
      )}

      {/* ── Bouton Annuler après remplissage multiple ─────────── */}
      {undoFill && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[10055] flex items-center gap-3 bg-brand text-white rounded-full pl-4 pr-2 py-2 shadow-modal animate-in">
          <span className="text-xs font-medium">
            {undoFill.prev.length} semaine{undoFill.prev.length > 1 ? 's' : ''} remplie{undoFill.prev.length > 1 ? 's' : ''} pour {undoFill.assigne_a || 'le produit'}
          </span>
          <button onClick={undoLastFill}
            className="text-xs font-bold bg-white/15 hover:bg-white/25 rounded-full px-3 py-1 transition-colors">
            Annuler
          </button>
        </div>
      )}

      {/* ── Panneau Paramètres ───────────────────────────────── */}
      {showSettings && (
        <PlanChargesSettings annee={annee} onClose={() => setShowSettings(false)} />
      )}

      {/* ── Modale drag-to-fill ───────────────────────────────── */}
      {fillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          onClick={e => { if (e.target === e.currentTarget) setFillModal(null) }}>
          <div className="bg-card rounded-xl shadow-xl border border-border w-72 p-4">
            <div className="mb-3">
              <div className="text-xs font-bold text-navy mb-0.5">
                Remplir {fillModal.semaines.length} semaine{fillModal.semaines.length > 1 ? 's' : ''}
              </div>
              <div className="text-[11px] text-subtle">
                S{String(fillModal.semaines[0]).padStart(2,'0')}
                {fillModal.semaines.length > 1 && ` → S${String(fillModal.semaines[fillModal.semaines.length-1]).padStart(2,'0')}`}
              </div>
              {fillModal.semaines.length < fillModal.semaines[fillModal.semaines.length-1] - fillModal.semaines[0] + 1 && (
                <div className="text-[11px] text-amber-600 mt-0.5">Semaine(s) fermée(s) exclues (congés/fériés)</div>
              )}
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
