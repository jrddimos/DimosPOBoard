import { describe, it, expect } from 'vitest'
import { computeProduitMetrics, scopedMetrics, getQuarterStart, getQuarterEnd } from './produitMetrics'
import type { Produit, TrimObjectif } from '@/hooks/useProduits'
import type { FinanceConfig } from '@/hooks/useFinanceConfig'
import type { Tache } from '@/types'

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

function mkTache(overrides: Partial<Tache> = {}): Tache {
  return {
    id: 1, id_tache: 'US-001', produit_id: 1, epic: 'EPIC 1 — Test', titre: 'Tâche test',
    type_fonction: null, description: null, criteres: null, lien_dod: null, commentaire: null,
    jalon: null, sprint_debut: null, sprint_fin: null, sprint: null, iteration: 1,
    moscow: null, priorite: null, statut: 'À faire', effort_j: 1, effort_realise_j: null, effort_realise_split: null,
    equipe: null, metier: null, assigne_a: null, type_tache: null, parent_id: null, famille_id: null,
    ordre_kanban: null,
    ordre_backlog: null,
    critere_lie_id: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: null,
    ...overrides,
  }
}

const finConfig: FinanceConfig = {
  id: 1, jours_par_trim: 60, equipe_tjms: [{ equipe_id: 1, tjm: 500 }], trimestres: [], updated_at: '',
}

describe('getQuarterStart / getQuarterEnd', () => {
  it('parse un identifiant de trimestre valide', () => {
    expect(getQuarterStart('Q1-2026')).toEqual(new Date(2026, 0, 1))
    expect(getQuarterStart('Q3-2026')).toEqual(new Date(2026, 6, 1))
    expect(getQuarterEnd('Q1-2026')?.getDate()).toBe(31)
    expect(getQuarterEnd('Q1-2026')?.getMonth()).toBe(2) // mars
  })

  it('renvoie null pour un identifiant invalide', () => {
    expect(getQuarterStart('pas-un-trimestre')).toBeNull()
    expect(getQuarterEnd('')).toBeNull()
  })
})

describe('computeProduitMetrics', () => {
  it('renvoie des RAG null quand il n\'y a aucune tâche ni budget', () => {
    const m = computeProduitMetrics(mkProduit(), [], finConfig, new Date(2026, 5, 1))
    expect(m.totalUS).toBe(0)
    expect(m.ragAGlobal).toBeNull()
    expect(m.ragBGlobal).toBeNull()
  })

  it('calcule un backlogPct correct sur les tâches racines', () => {
    const taches = [
      mkTache({ id_tache: 'US-001', statut: 'Fait' }),
      mkTache({ id_tache: 'US-002', statut: 'Fait' }),
      mkTache({ id_tache: 'US-003', statut: 'En cours' }),
      mkTache({ id_tache: 'US-004', statut: 'À faire' }),
    ]
    const m = computeProduitMetrics(mkProduit(), taches, finConfig, new Date(2026, 5, 1))
    expect(m.totalUS).toBe(4)
    expect(m.faitUS).toBe(2)
    expect(m.backlogPct).toBe(50)
  })

  it('exclut les tâches Conteneur (regroupement) une fois filtrées par l\'appelant', () => {
    const taches = [
      mkTache({ id_tache: 'US-001', statut: 'Fait' }),
      mkTache({ id_tache: 'US-002', statut: 'À faire', type_tache: 'Conteneur' }),
    ]
    const racines = taches.filter(t => t.type_tache !== 'Conteneur')
    const m = computeProduitMetrics(mkProduit(), racines, finConfig, new Date(2026, 5, 1))
    expect(m.totalUS).toBe(1)
    expect(m.faitUS).toBe(1)
    expect(m.backlogPct).toBe(100)
  })

  it('ragBlGlobal passe au rouge au-delà de 2 blocages/risques cumulés', () => {
    const taches = [
      mkTache({ id_tache: 'US-001', statut: 'Bloqué' }),
      mkTache({ id_tache: 'US-002', statut: 'Bloqué' }),
      mkTache({ id_tache: 'US-003', statut: 'Bloqué' }),
    ]
    const m = computeProduitMetrics(mkProduit(), taches, finConfig, new Date(2026, 5, 1))
    expect(m.ragBlGlobal).toBe('red')
  })

  it('ragBlGlobal reste vert sans blocage ni risque ouvert', () => {
    const m = computeProduitMetrics(mkProduit(), [mkTache({ statut: 'Fait' })], finConfig, new Date(2026, 5, 1))
    expect(m.ragBlGlobal).toBe('green')
  })

  it('ragD passe au rouge quand la date cible est dépassée', () => {
    const produit = mkProduit({ date_lancement_cible: '2026-01-01' })
    const m = computeProduitMetrics(produit, [mkTache({ statut: 'À faire' })], finConfig, new Date(2026, 5, 1))
    expect(m.ragD).toBe('red')
  })

  it('ragATrim est vert quand l\'avancement dépasse largement le curseur du trimestre', () => {
    const trim: TrimObjectif = {
      id: 't1', trimestre: 'Q1-2026', objectifs: [], budget_etp: 1, budget_invest: null, budget_achats: null,
      previsionnel_verrouille: undefined, sprints_ids: ['S1'], realise_etp: null, realise_invest: null,
      realise_achats: null, kpis: '', outcome_desc: '', outcome_euros: null, statut: null,
      lance: true, pause: false, cloture: false, jours_ouvres: undefined,
      budget_invest_details: undefined, realise_invest_details: undefined,
      budget_achats_details: undefined, realise_achats_details: undefined,
      budget_etp_detail: undefined, realise_etp_detail: undefined,
    }
    const produit = mkProduit({ objectifs_trimestriels: [trim] })
    const taches = [
      mkTache({ id_tache: 'US-001', sprint_debut: 'S1', statut: 'Fait' }),
      mkTache({ id_tache: 'US-002', sprint_debut: 'S1', statut: 'Fait' }),
    ]
    // Quelques jours après le début du trimestre : curseur bas, avancement déjà à 100 % → vert.
    const m = computeProduitMetrics(produit, taches, finConfig, new Date(2026, 0, 5))
    expect(m.backlogPctTrim).toBe(100)
    expect(m.ragATrim).toBe('green')
  })

  it('ignore le champ `sprint` legacy (défaut base "S01") pour le scope trimestre — seul sprint_debut compte', () => {
    const trim: TrimObjectif = {
      id: 't1', trimestre: 'Q1-2026', objectifs: [], budget_etp: 1, budget_invest: null, budget_achats: null,
      previsionnel_verrouille: undefined, sprints_ids: ['S1'], realise_etp: null, realise_invest: null,
      realise_achats: null, kpis: '', outcome_desc: '', outcome_euros: null, statut: null,
      lance: true, pause: false, cloture: false, jours_ouvres: undefined,
      budget_invest_details: undefined, realise_invest_details: undefined,
      budget_achats_details: undefined, realise_achats_details: undefined,
      budget_etp_detail: undefined, realise_etp_detail: undefined,
    }
    const produit = mkProduit({ objectifs_trimestriels: [trim] })
    // sprint='S1' mais sprint_debut=null : ne doit PAS compter dans le trimestre.
    const taches = [mkTache({ id_tache: 'US-001', sprint: 'S1', sprint_debut: null, statut: 'Fait' })]
    const m = computeProduitMetrics(produit, taches, finConfig, new Date(2026, 0, 5))
    expect(m.totalUSTrim).toBe(0)
  })
})

describe('ragAvancement (via ragAGlobal) — formule proportionnelle recalibrée cette session', () => {
  // Trimestre Q1-2026 (début 2026-01-01) lancé, cible à 40 jours calendaires
  // du début (2026-02-10) : curseur temps = 20/40 = 50 % au jour 21.
  const trim: TrimObjectif = {
    id: 't1', trimestre: 'Q1-2026', objectifs: [], budget_etp: 1, budget_invest: null, budget_achats: null,
    previsionnel_verrouille: undefined, sprints_ids: ['S1'], realise_etp: null, realise_invest: null,
    realise_achats: null, kpis: '', outcome_desc: '', outcome_euros: null, statut: null,
    lance: true, pause: false, cloture: false, jours_ouvres: undefined,
    budget_invest_details: undefined, realise_invest_details: undefined,
    budget_achats_details: undefined, realise_achats_details: undefined,
    budget_etp_detail: undefined, realise_etp_detail: undefined,
  }
  const produit = mkProduit({ date_lancement_cible: '2026-02-10', objectifs_trimestriels: [trim] })
  const today = new Date(2026, 0, 21) // 20 jours après le début du trimestre → curseur 50 %

  function tachesAvecBacklogPct(pct: number) {
    // 10 tâches, `pct` % marquées Fait → backlogPct exact (multiples de 10).
    const nbFait = pct / 10
    return Array.from({ length: 10 }, (_, i) =>
      mkTache({ id_tache: `US-${i}`, statut: i < nbFait ? 'Fait' : 'À faire' }))
  }

  it('pace >= 0.8 (80% du rythme attendu) → vert', () => {
    // backlogPct=40, curseur=50 → pace = 0.8 (limite incluse)
    const m = computeProduitMetrics(produit, tachesAvecBacklogPct(40), finConfig, today)
    expect(m.globalCursorPct).toBe(50)
    expect(m.ragAGlobal).toBe('green')
  })

  it('pace entre 0.5 et 0.8 → orange', () => {
    // backlogPct=30, curseur=50 → pace = 0.6
    const m = computeProduitMetrics(produit, tachesAvecBacklogPct(30), finConfig, today)
    expect(m.ragAGlobal).toBe('amber')
  })

  it('pace < 0.5 → rouge (et pas juste "loin en valeur absolue")', () => {
    // backlogPct=20, curseur=50 → pace = 0.4
    const m = computeProduitMetrics(produit, tachesAvecBacklogPct(20), finConfig, today)
    expect(m.ragAGlobal).toBe('red')
  })

  it('sans repère temporel (pas de date cible) → vert par défaut, quel que soit l\'avancement', () => {
    const produitSansCible = mkProduit({ objectifs_trimestriels: [trim] })
    const m = computeProduitMetrics(produitSansCible, tachesAvecBacklogPct(10), finConfig, today)
    expect(m.globalCursorPct).toBeNull()
    expect(m.ragAGlobal).toBe('green')
  })
})

describe('curseur temporel — le jour en cours ne compte pas comme "écoulé"', () => {
  it('joursEcoules vaut 0 le jour même du début du trimestre (pas 1)', () => {
    const trim: TrimObjectif = {
      id: 't1', trimestre: 'Q1-2026', objectifs: [], budget_etp: 1, budget_invest: null, budget_achats: null,
      previsionnel_verrouille: undefined, sprints_ids: ['S1'], realise_etp: null, realise_invest: null,
      realise_achats: null, kpis: '', outcome_desc: '', outcome_euros: null, statut: null,
      lance: true, pause: false, cloture: false, jours_ouvres: undefined,
      budget_invest_details: undefined, realise_invest_details: undefined,
      budget_achats_details: undefined, realise_achats_details: undefined,
      budget_etp_detail: undefined, realise_etp_detail: undefined,
    }
    const produit = mkProduit({ objectifs_trimestriels: [trim] })
    const today = new Date(2026, 0, 1) // jour exact du début du trimestre
    const m = computeProduitMetrics(produit, [], finConfig, today)
    expect(m.joursEcoules).toBe(0)
    expect(m.cursorPct).toBe(0)
  })
})

describe('ragD Global — marge en jours (livraison estimée vs cible), pas une moyenne de vélocité séparée', () => {
  const trim: TrimObjectif = {
    id: 't1', trimestre: 'Q1-2026', objectifs: [], budget_etp: 1, budget_invest: null, budget_achats: null,
    previsionnel_verrouille: undefined, sprints_ids: ['S1'], realise_etp: null, realise_invest: null,
    realise_achats: null, kpis: '', outcome_desc: '', outcome_euros: null, statut: null,
    lance: true, pause: false, cloture: false, jours_ouvres: undefined,
    budget_invest_details: undefined, realise_invest_details: undefined,
    budget_achats_details: undefined, realise_achats_details: undefined,
    budget_etp_detail: undefined, realise_etp_detail: undefined,
  }

  it('100% déjà fait tôt dans le trimestre + cible lointaine → livraison quasi immédiate → vert', () => {
    const produit = mkProduit({ date_lancement_cible: '2026-12-31', objectifs_trimestriels: [trim] })
    const taches = [
      mkTache({ id_tache: 'US-1', sprint_debut: 'S1', statut: 'Fait' }),
      mkTache({ id_tache: 'US-2', sprint_debut: 'S1', statut: 'Fait' }),
    ]
    // Quelques jours après le début du trimestre : le calcul (100-backlogPctTrim)=0
    // donne une livraison estimée ~immédiate, quel que soit le rythme exact.
    const m = computeProduitMetrics(produit, taches, finConfig, new Date(2026, 0, 8))
    expect(m.estimatedDeliveryDate).not.toBeNull()
    expect(m.ragD).toBe('green')
  })

  it('avancement très en retard + cible proche → livraison estimée bien après la cible → rouge', () => {
    const produit = mkProduit({ date_lancement_cible: '2026-03-01', objectifs_trimestriels: [trim] })
    const taches = [
      mkTache({ id_tache: 'US-1', sprint_debut: 'S1', statut: 'Fait' }),
      ...Array.from({ length: 9 }, (_, i) => mkTache({ id_tache: `US-${i + 2}`, sprint_debut: 'S1', statut: 'À faire' })),
    ]
    // 10% fait, mi-trimestre passé : rythme bien trop lent pour finir dans les
    // temps avant la cible, qui elle est toute proche.
    const m = computeProduitMetrics(produit, taches, finConfig, new Date(2026, 1, 15))
    expect(m.estimatedDeliveryDate).not.toBeNull()
    expect(m.ragD).toBe('red')
  })

  it('date cible déjà dépassée → rouge, sans même calculer de projection', () => {
    const produit = mkProduit({ date_lancement_cible: '2026-01-01', objectifs_trimestriels: [trim] })
    const m = computeProduitMetrics(produit, [mkTache({ statut: 'À faire' })], finConfig, new Date(2026, 5, 1))
    expect(m.ragD).toBe('red')
  })
})

describe('scopedMetrics', () => {
  it('bascule correctement entre les champs globaux et trimestriels', () => {
    const m = computeProduitMetrics(
      mkProduit(),
      [mkTache({ statut: 'Fait' }), mkTache({ id_tache: 'US-002', statut: 'À faire' })],
      finConfig,
      new Date(2026, 5, 1),
    )
    const global = scopedMetrics(m, 'global')
    const trim = scopedMetrics(m, 'trim')
    expect(global.total).toBe(m.totalUS)
    expect(trim.total).toBe(m.totalUSTrim)
  })

  it('la trajectoire retombe sur ragA quand ragD est absent', () => {
    const m = computeProduitMetrics(mkProduit(), [mkTache({ statut: 'Fait' })], finConfig, new Date(2026, 5, 1))
    const s = scopedMetrics(m, 'global')
    expect(s.trajectoire).toBe(s.ragD ?? s.ragA)
  })
})
