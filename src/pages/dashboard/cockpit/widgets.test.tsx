import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { getISOWeek } from '@/lib/utils'
import { getJoursFeries, joursOuvresSemaine } from '@/utils/joursFeries'
import type { UserProfile } from '@/contexts/AuthContext'
import type { Produit } from '@/hooks/useProduits'
import type { WidgetCtx } from './widgets'

// ── Mocks des hooks de données (pas de vrai Supabase dans ce test) ────────
vi.mock('@/hooks/usePlanCharges', () => ({ usePlanCharges: vi.fn() }))
vi.mock('@/hooks/usePeriodesFermeture', () => ({ usePeriodesFermeture: vi.fn() }))
vi.mock('@/hooks/useAbsences', () => ({ useAbsencesCapacite: vi.fn() }))

import { usePlanCharges } from '@/hooks/usePlanCharges'
import { usePeriodesFermeture } from '@/hooks/usePeriodesFermeture'
import { useAbsencesCapacite } from '@/hooks/useAbsences'
import { WIDGET_BY_KEY } from './widgets'

function pad(n: number) { return String(n).padStart(2, '0') }
function toISO(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

function mkMembre(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    user_id: 'u1', display_name: 'Test User', role_global: null, trigramme: 'FRU',
    prenom: null, nom: null, role_metier: null, couleur: null, actif: true,
    equipe_id: null, equipe_ids: [], avatar_url: null, must_change_password: false,
    ...overrides,
  }
}

function mkProduit(overrides: Partial<Produit> = {}): Produit {
  return {
    id: 1, nom: 'Produit test', description: null, couleur: null, actif: true, is_template: false,
    created_at: '2026-01-01T00:00:00Z',
    vision: null, objectifs_q1: null, objectifs_q2: null, objectifs_q3: null, objectifs_q4: null,
    budget_etp: null, budget_invest: null, budget_achats: null,
    date_lancement_cible: null, priorite_strategique: null, niveau_risque: null,
    kpis_cibles: null, outcome_estime: null, theme: null, gamme_id: null,
    objectifs_trimestriels: null, risques: null, actions_lop: null, rag_config: null,
    discussion_bg_url: null, discussion_bg_opacity: 0.15,
    ...overrides,
  }
}

function mkCtx(overrides: Partial<WidgetCtx> = {}): WidgetCtx {
  const produit = mkProduit()
  return {
    // Le widget Charge équipe filtre plan_charges aux produits accessibles
    // (actifs, non-template) — il en faut au moins un ici, sinon toute
    // allocation mockée est silencieusement exclue et le test passe "pour
    // rien" (aucune donnée n'atteint jamais le composant).
    produits: [produit], accessibles: [produit], metricsMap: new Map(), scope: 'trim', allTaches: [],
    childMapByProduit: new Map(), faitDoneMap: new Map(), membres: [mkMembre()],
    userTrigramme: null, navigate: () => {}, openProduct: () => {}, fmtDate: d => d.toLocaleDateString('fr-FR'),
    ...overrides,
  }
}

describe('ChargeEquipeWidget — regression sur les bugs corrigés cette session', () => {
  // 1er juillet 2026 : semaine ordinaire, loin de tout jour férié fixe
  // (14 juillet compris) — évite toute interférence avec getJoursFeries.
  const today = new Date(2026, 6, 1)
  const monday = new Date(today)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const { semaine, annee } = getISOWeek(monday)
  const mondayIso = toISO(monday)
  const feriesSet = new Set(getJoursFeries(annee).map(f => f.iso))
  // Capacité réelle de la semaine si le lundi est fermé (fermeture entreprise) :
  // c'est CETTE valeur, et pas jo+1, qui doit faire foi.
  const joAvecFermeture = joursOuvresSemaine(monday, feriesSet, [{ debut: mondayIso, fin: mondayIso }])

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(today)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('n\'affiche pas de fausse surcharge quand l\'absence d\'un membre tombe sur un jour déjà fermé (double décompte corrigé)', () => {
    vi.mocked(usePeriodesFermeture).mockReturnValue({
      data: [{ id: 1, annee, label: 'Fermeture test', date_debut: mondayIso, date_fin: mondayIso }],
    } as ReturnType<typeof usePeriodesFermeture>)
    vi.mocked(useAbsencesCapacite).mockReturnValue({
      data: [{ id: 1, trigramme: 'FRU', annee, date_debut: mondayIso, date_fin: mondayIso }],
    } as ReturnType<typeof useAbsencesCapacite>)
    // FRU alloué exactement à hauteur de sa capacité réelle (fermeture déjà
    // exclue) : ne doit PAS être signalé en surcharge.
    vi.mocked(usePlanCharges).mockReturnValue({
      data: [{ id: '1', produit_id: 1, epic: '', assigne_a: 'FRU', semaine, annee, jours: joAvecFermeture, jours_realises: 0 }],
    } as ReturnType<typeof usePlanCharges>)

    const ctx = mkCtx()
    render(<>{WIDGET_BY_KEY.get('charge')!.render(ctx)}</>)

    expect(screen.queryByText(/surcharge/i)).not.toBeInTheDocument()
  })

  it('affiche bien une surcharge quand un membre est réellement alloué au-delà de sa capacité', () => {
    vi.mocked(usePeriodesFermeture).mockReturnValue({ data: [] } as unknown as ReturnType<typeof usePeriodesFermeture>)
    vi.mocked(useAbsencesCapacite).mockReturnValue({ data: [] } as unknown as ReturnType<typeof useAbsencesCapacite>)
    const joSansFermeture = joursOuvresSemaine(monday, feriesSet, [])
    vi.mocked(usePlanCharges).mockReturnValue({
      data: [{ id: '1', produit_id: 1, epic: '', assigne_a: 'FRU', semaine, annee, jours: joSansFermeture + 2, jours_realises: 0 }],
    } as ReturnType<typeof usePlanCharges>)

    const ctx = mkCtx()
    render(<>{WIDGET_BY_KEY.get('charge')!.render(ctx)}</>)

    expect(screen.queryByText(/surcharge/i)).toBeInTheDocument()
  })
})
