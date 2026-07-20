import { describe, it, expect } from 'vitest'
import { isEligibleForBacklog, isInThisSprint, buildEligibleTree } from './sprintEligibility'
import type { Tache } from '@/types'
import type { TacheIteration } from '@/hooks/useTacheIterations'

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

function mkIter(overrides: Partial<TacheIteration> = {}): TacheIteration {
  return {
    id: 1, produit_id: 1, id_tache: 'US-001', numero: 1, origine: 'rework', objectif: null, criteres: null,
    effort_j: null, assigne_a: null, sprint: null, statut: 'À faire', resultat: null,
    commentaire: null, effort_realise_j: null, created_at: '2026-01-01T00:00:00Z', closed_at: null,
    ...overrides,
  }
}

describe('isEligibleForBacklog', () => {
  it('tâche sans itération, sans sprint → éligible', () => {
    expect(isEligibleForBacklog(mkTache(), [])).toBe(true)
  })
  it('tâche sans itération, avec sprint_debut → non éligible', () => {
    expect(isEligibleForBacklog(mkTache({ sprint_debut: 'S03' }), [])).toBe(false)
  })
  it('tâche avec itération "À faire" sans sprint → éligible', () => {
    const it1 = mkIter({ statut: 'À faire', sprint: null })
    expect(isEligibleForBacklog(mkTache(), [it1])).toBe(true)
  })
  it('même itération une fois planifiée → non éligible', () => {
    const it1 = mkIter({ statut: 'À faire', sprint: 'S03' })
    expect(isEligibleForBacklog(mkTache(), [it1])).toBe(false)
  })
  it('itération "Fait" sans sprint → non éligible (pas de rework en attente)', () => {
    const it1 = mkIter({ statut: 'Fait', sprint: null })
    expect(isEligibleForBacklog(mkTache(), [it1])).toBe(false)
  })
  it('champ `sprint` legacy renseigné (défaut base "S01") mais sprint_debut vide → reste éligible', () => {
    // Bug réel constaté : `taches.sprint` porte une valeur par défaut sur la
    // quasi-totalité des lignes en base, y compris jamais planifiées — seul
    // `sprint_debut` doit compter.
    expect(isEligibleForBacklog(mkTache({ sprint: 'S01', sprint_debut: null }), [])).toBe(true)
  })
})

describe('isInThisSprint', () => {
  it('aucun sprint sélectionné (\'\') → jamais "dans le sprint", même pour une tâche non planifiée (sprint===\'\')', () => {
    expect(isInThisSprint(mkTache({ sprint: '' }), '', [])).toBe(false)
  })
  it('tâche sans itération planifiée sur ce sprint (sprint_debut)', () => {
    expect(isInThisSprint(mkTache({ sprint_debut: 'S02' }), 'S02', [])).toBe(true)
  })
  it('champ `sprint` legacy = "S01" mais sprint_debut vide → PAS dans le sprint S01', () => {
    expect(isInThisSprint(mkTache({ sprint: 'S01', sprint_debut: null }), 'S01', [])).toBe(false)
  })
  it('tâche avec itération 1 planifiée S02 et itération 3 libre → visible dans S02', () => {
    const it1 = mkIter({ numero: 1, statut: 'Fait', sprint: 'S02' })
    const it3 = mkIter({ numero: 3, statut: 'À faire', sprint: null })
    expect(isInThisSprint(mkTache(), 'S02', [it1, it3])).toBe(true)
    // et cette même tâche reste éligible au backlog grâce à l'itération 3
    expect(isEligibleForBacklog(mkTache(), [it1, it3])).toBe(true)
  })
  it('tâche avec itérations mais aucune sur ce sprint → non visible', () => {
    const it1 = mkIter({ numero: 1, statut: 'Fait', sprint: 'S02' })
    expect(isInThisSprint(mkTache(), 'S05', [it1])).toBe(false)
  })
})

describe('buildEligibleTree', () => {
  it('élague un Conteneur qui ne garde aucun enfant éligible', () => {
    const conteneur = mkTache({ id_tache: 'C-1', type_tache: 'Conteneur' })
    const us = mkTache({ id_tache: 'US-1', parent_id: 'C-1', sprint_debut: 'S01' }) // déjà planifiée
    const { filtered } = buildEligibleTree([conteneur, us], t => isEligibleForBacklog(t, []))
    expect(filtered).toEqual([])
  })
  it('garde un Conteneur avec au moins un enfant éligible, et attache ses enfants dans childMap', () => {
    const conteneur = mkTache({ id_tache: 'C-1', type_tache: 'Conteneur' })
    const usEligible = mkTache({ id_tache: 'US-1', parent_id: 'C-1' })
    const usPlanifiee = mkTache({ id_tache: 'US-2', parent_id: 'C-1', sprint_debut: 'S01' })
    const { filtered, childMap } = buildEligibleTree([conteneur, usEligible, usPlanifiee], t => isEligibleForBacklog(t, []))
    expect(filtered.map(t => t.id_tache)).toEqual(['C-1'])
    expect(childMap['C-1'].map(t => t.id_tache)).toEqual(['US-1'])
  })
  it('garde les sous-tâches de manière informative, sans les filtrer', () => {
    const us = mkTache({ id_tache: 'US-1' })
    const sousTache = mkTache({ id_tache: 'SS-1', parent_id: 'US-1', sprint_debut: 'S01' }) // "planifiée" mais non pertinent
    const { filtered, childMap } = buildEligibleTree([us, sousTache], t => isEligibleForBacklog(t, []))
    expect(filtered.map(t => t.id_tache)).toEqual(['US-1'])
    expect(childMap['US-1'].map(t => t.id_tache)).toEqual(['SS-1'])
  })
})
