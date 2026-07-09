import type { Tache } from '@/types'
import type { TacheIteration } from '@/hooks/useTacheIterations'

// Une tâche sans itération suit son champ `sprint_debut` (seul fiable — voir
// note ci-dessous) ; une tâche avec itérations se planifie au niveau de
// l'itération (chacune a son propre `sprint`), indépendamment des autres
// itérations de la même tâche.
//
// IMPORTANT : `taches.sprint` (l'ancien champ, avant l'ajout de
// sprint_debut/sprint_fin) porte une valeur par défaut ('S01' constaté en
// base) sur la quasi-totalité des lignes, y compris des tâches jamais
// planifiées — ce n'est donc PAS un signal fiable de planification. Seul
// `sprint_debut` (rempli uniquement quand une tâche est explicitement
// ajoutée à un sprint via l'app) doit être utilisé ici.
export function isEligibleForBacklog(t: Tache, iters: TacheIteration[]): boolean {
  if (iters.length === 0) return !t.sprint_debut
  return iters.some(it => it.statut === 'À faire' && !it.sprint)
}

export function isInThisSprint(t: Tache, selected: string, iters: TacheIteration[]): boolean {
  if (!selected) return false
  if (iters.length === 0) return t.sprint_debut === selected
  return iters.some(it => it.sprint === selected)
}

// Reconstruit un arbre filtré compatible avec le contrat de TacheTree
// (racines `filtered` + `childMap`) à partir d'un prédicat d'éligibilité
// appliqué aux US. Un Conteneur n'est gardé que s'il lui reste au moins un
// enfant éligible ; les sous-tâches restent purement informatives (jamais
// filtrées elles-mêmes, un rework se planifie au niveau de l'US parente).
export function buildEligibleTree(allTaches: Tache[], predicate: (t: Tache) => boolean): {
  filtered: Tache[]
  childMap: Record<string, Tache[]>
} {
  const fullChildMap: Record<string, Tache[]> = {}
  allTaches.filter(t => t.parent_id).forEach(c => {
    const key = c.parent_id!
    if (!fullChildMap[key]) fullChildMap[key] = []
    fullChildMap[key].push(c)
  })

  const prunedChildMap: Record<string, Tache[]> = {}
  function keep(t: Tache): boolean {
    if (t.type_tache === 'Conteneur') {
      const kids = (fullChildMap[t.id_tache] ?? []).filter(keep)
      if (!kids.length) return false
      prunedChildMap[t.id_tache] = kids
      return true
    }
    if (!predicate(t)) return false
    const subs = fullChildMap[t.id_tache] ?? []
    if (subs.length) prunedChildMap[t.id_tache] = subs
    return true
  }

  const filtered = allTaches.filter(t => !t.parent_id).filter(keep)
  return { filtered, childMap: prunedChildMap }
}
