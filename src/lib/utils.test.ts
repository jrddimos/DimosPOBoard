import { describe, it, expect } from 'vitest'
import { buildTacheIndex, isUS, isSousTache, effortEffectif, computeTacheNumbers, sprintInRange } from './utils'
import type { Tache } from '@/types'

function mkTache(overrides: Partial<Tache> = {}): Tache {
  return {
    id: 1, id_tache: 'US-001', produit_id: 1, epic: 'EPIC 1 — Test', titre: 'Tâche test',
    type_fonction: null, description: null, criteres: null, lien_dod: null, commentaire: null,
    jalon: null, sprint_debut: null, sprint_fin: null, sprint: null, iteration: 1,
    moscow: null, priorite: null, statut: 'À faire', effort_j: 1, effort_realise_j: null,
    equipe: null, metier: null, assigne_a: null, type_tache: null, parent_id: null, famille_id: null,
    ordre_kanban: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: null,
    ...overrides,
  }
}

describe('sprintInRange', () => {
  it('sprint_debut correspond à la cible → dedans', () => {
    expect(sprintInRange('S02', null, 'S02')).toBe(true)
  })
  it('cible dans l\'intervalle [debut, fin] → dedans', () => {
    expect(sprintInRange('S02', 'S04', 'S03')).toBe(true)
  })
  it('aucun sprint_debut → jamais dedans, quelle que soit la cible', () => {
    expect(sprintInRange(null, null, 'S01')).toBe(false)
  })
})

describe('isUS / isSousTache — hiérarchie Conteneur > US > Sous-tâche', () => {
  const conteneur = mkTache({ id_tache: 'C-1', type_tache: 'Conteneur' })
  const usRacine = mkTache({ id_tache: 'US-1' })
  const usRattachee = mkTache({ id_tache: 'US-2', parent_id: 'C-1' })
  const sousTacheDeRacine = mkTache({ id_tache: 'SS-1', parent_id: 'US-1' })
  const sousTacheDeRattachee = mkTache({ id_tache: 'SS-2', parent_id: 'US-2' })
  const taches = [conteneur, usRacine, usRattachee, sousTacheDeRacine, sousTacheDeRattachee]
  const byId = buildTacheIndex(taches)

  it('un Conteneur n\'est jamais une US', () => {
    expect(isUS(conteneur, byId)).toBe(false)
  })

  it('une US racine (sans parent) est une US', () => {
    expect(isUS(usRacine, byId)).toBe(true)
  })

  it('une US rattachée à un Conteneur reste une US', () => {
    expect(isUS(usRattachee, byId)).toBe(true)
  })

  it('une sous-tâche d\'une US racine n\'est pas une US', () => {
    expect(isUS(sousTacheDeRacine, byId)).toBe(false)
  })

  it('une sous-tâche d\'une US rattachée à un Conteneur n\'est pas une US', () => {
    expect(isUS(sousTacheDeRattachee, byId)).toBe(false)
  })

  it('une sous-tâche (parent = une US, pas un Conteneur) est bien détectée', () => {
    expect(isSousTache(sousTacheDeRacine, byId)).toBe(true)
    expect(isSousTache(sousTacheDeRattachee, byId)).toBe(true)
  })

  it('un Conteneur et une US ne sont pas des sous-tâches', () => {
    expect(isSousTache(conteneur, byId)).toBe(false)
    expect(isSousTache(usRacine, byId)).toBe(false)
    expect(isSousTache(usRattachee, byId)).toBe(false)
  })
})

describe('effortEffectif', () => {
  it('renvoie l\'effort propre quand la tâche n\'a pas de sous-tâches', () => {
    const t = mkTache({ id_tache: 'US-1', effort_j: 5 })
    expect(effortEffectif(t, {})).toBe(5)
  })

  it('remonte la somme des sous-tâches sur un niveau', () => {
    const parent = mkTache({ id_tache: 'US-1', effort_j: 0 })
    const childMap = { 'US-1': [mkTache({ id_tache: 'SS-1', effort_j: 2 }), mkTache({ id_tache: 'SS-2', effort_j: 3 })] }
    expect(effortEffectif(parent, childMap)).toBe(5)
  })

  it('remonte récursivement sur 2 niveaux (Conteneur > US > sous-tâche)', () => {
    const conteneur = mkTache({ id_tache: 'C-1', type_tache: 'Conteneur' })
    const us = mkTache({ id_tache: 'US-1', parent_id: 'C-1', effort_j: 0 })
    const childMap = {
      'C-1': [us],
      'US-1': [mkTache({ id_tache: 'SS-1', parent_id: 'US-1', effort_j: 4 })],
    }
    expect(effortEffectif(conteneur, childMap)).toBe(4)
  })
})

describe('computeTacheNumbers', () => {
  it('numérote les US à plat par Epic, ignore les Conteneurs, garde le vrai rang des Epics', () => {
    const epicLabels = ['EPIC 1 — A', 'EPIC 2 — B (vide)', 'EPIC 3 — C']
    const usRacine     = mkTache({ id_tache: 'US-1', epic: 'EPIC 1 — A' })
    const conteneur    = mkTache({ id_tache: 'CONT-1', type_tache: 'Conteneur', epic: 'EPIC 1 — A' })
    const usRattachee  = mkTache({ id_tache: 'US-2', epic: 'EPIC 1 — A', parent_id: 'CONT-1' })
    const sousTache    = mkTache({ id_tache: 'SS-1', epic: 'EPIC 1 — A', parent_id: 'US-1' })
    const usEpic3      = mkTache({ id_tache: 'US-3', epic: 'EPIC 3 — C' })
    const allTaches = [usRacine, conteneur, usRattachee, sousTache, usEpic3]
    const byId = buildTacheIndex(allTaches)
    const childMap: Record<string, Tache[]> = { 'CONT-1': [usRattachee], 'US-1': [sousTache] }
    const tasksByEpicLabel = (label: string) => allTaches.filter(t => t.epic === label && !t.parent_id)

    const numbers = computeTacheNumbers(epicLabels, tasksByEpicLabel, childMap, byId)

    expect(numbers.get('epic::EPIC 1 — A')).toBe('1')
    expect(numbers.get('epic::EPIC 2 — B (vide)')).toBeUndefined()
    expect(numbers.get('epic::EPIC 3 — C')).toBe('3')
    expect(numbers.get('CONT-1')).toBeUndefined()
    expect(numbers.get('US-1')).toBe('1.1')
    expect(numbers.get('SS-1')).toBe('1.1.1')
    expect(numbers.get('US-2')).toBe('1.2')
    expect(numbers.get('US-3')).toBe('3.1')
  })
})
