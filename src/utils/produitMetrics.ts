import type { Tache } from '@/types'
import type { Produit, TrimObjectif } from '@/hooks/useProduits'
import type { FinanceConfig } from '@/hooks/useFinanceConfig'
import { effortEffectif } from '@/lib/utils'

function tjmMoyenOf(finConfig: FinanceConfig | undefined): number {
  return (finConfig?.equipe_tjms?.length ?? 0) > 0
    ? Math.round(finConfig!.equipe_tjms.reduce((s, e) => s + e.tjm, 0) / finConfig!.equipe_tjms.length)
    : 500
}

// Total ETP d'un trimestre : somme du détail par équipe s'il existe, sinon
// le champ simple (rétro-compatibilité avec les trimestres existants).
export function trimEtpTotal(t: TrimObjectif): number {
  const d = t.budget_etp_detail
  return d && d.length > 0 ? d.reduce((s, x) => s + (x.etp || 0), 0) : (t.budget_etp ?? 0)
}

// Coût € d'un trimestre : valorise chaque ligne du détail au TJM de son
// équipe (fallback TJM moyen si l'équipe n'a pas de TJM ou si aucun détail
// n'a été saisi) — au lieu d'un TJM moyen appliqué à tout l'ETP.
export function trimEtpCostEur(t: TrimObjectif, finConfig: FinanceConfig | undefined, jours: number): number {
  const tjmMoyen = tjmMoyenOf(finConfig)
  const d = t.budget_etp_detail
  if (d && d.length > 0) {
    const tjmByEquipe = new Map((finConfig?.equipe_tjms ?? []).map(e => [e.equipe_id, e.tjm]))
    return d.reduce((s, x) => s + (x.etp || 0) * (x.equipe_id != null ? (tjmByEquipe.get(x.equipe_id) ?? tjmMoyen) : tjmMoyen) * jours, 0)
  }
  return (t.budget_etp ?? 0) * tjmMoyen * jours
}

export type Rag = 'green' | 'amber' | 'red' | null
export type MultiScope = 'global' | 'trim'

export interface ProduitMetrics {
  totalUS: number; faitUS: number; enCoursUS: number; bloqueUS: number; backlogPct: number
  ragAGlobal: Rag; ragBGlobal: Rag; globalCursorPct: number | null
  totalUSTrim: number; faitUSTrim: number; backlogPctTrim: number; bloqueTrim: number
  cursorPct: number | null; joursEcoules: number | null; joursTotaux: number
  ragATrim: Rag; ragBTrim: Rag
  // ragD = scope global (date_lancement_cible) ; ragDTrim = scope trim (fin trimestre)
  ragD: Rag; ragDTrim: Rag
  ragBlGlobal: Rag; ragBlTrim: Rag
  openRisques: number; openActions: number
  projectedPct: number | null        // projection globale
  projectedPctTrim: number | null    // projection trim
  estimatedDeliveryDate: Date | null; trimLabel: string | null
  dateLancementCible: string | null
}

export function getQuarterStart(trimId: string): Date | null {
  const m = trimId.match(/Q([1-4])[- ](\d{4})/i)
  if (!m) return null
  return new Date(parseInt(m[2]), [0,3,6,9][parseInt(m[1])-1], 1)
}
export function getQuarterEnd(trimId: string): Date | null {
  const m = trimId.match(/Q([1-4])[- ](\d{4})/i)
  if (!m) return null
  const year = parseInt(m[2])
  const ends: [number, number][] = [[2,31],[5,30],[8,30],[11,31]]
  const [month, day] = ends[parseInt(m[1])-1]
  return new Date(year, month, day, 23, 59, 59)
}
function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from); let added = 0
  while (added < days) { d.setDate(d.getDate()+1); if (d.getDay()!==0&&d.getDay()!==6) added++ }
  return d
}
function countWorkingDays(from: Date, to: Date): number {
  let count = 0; const d = new Date(from); d.setHours(0,0,0,0)
  const end = new Date(to); end.setHours(0,0,0,0)
  while (d <= end) { if (d.getDay()!==0&&d.getDay()!==6) count++; d.setDate(d.getDate()+1) }
  return count
}
function ragAvancement(actualPct: number, cursorPct: number | null): Rag {
  const delta = actualPct - (cursorPct ?? 50)
  return delta >= -10 ? 'green' : delta >= -20 ? 'amber' : 'red'
}
function ragBudget(realise: number, budget: number, cursorPct: number | null): Rag {
  if (budget === 0) return null
  const delta = (realise / budget * 100) - (cursorPct ?? 50)
  return delta <= 10 ? 'green' : delta <= 20 ? 'amber' : 'red'
}
function ragBlocages(bloque: number, risques: number): Rag {
  const t = bloque + risques
  return t === 0 ? 'green' : t <= 2 ? 'amber' : 'red'
}

export function computeProduitMetrics(
  produit: Produit,
  racines: Tache[],
  finConfig: FinanceConfig | undefined,
  today: Date,
  // parent_id → sous-tâches (buildChildMap sur TOUTES les tâches, pas les
  // seules racines) : l'effort d'une US = effort propre + sous-tâches.
  // Optionnel pour les appelants sans sous-tâches (tests) — sans lui, seul
  // l'effort propre compte.
  childMap: Record<string, Tache[]> = {},
): ProduitMetrics {
  const joursTotaux = finConfig?.jours_par_trim ?? 65

  const trims       = produit.objectifs_trimestriels ?? []
  const currentTrim = [...trims].reverse().find(t => !!t.lance && !t.pause && !t.cloture) ?? null

  const totalUS    = racines.length
  const faitUS     = racines.filter(t => t.statut === 'Fait').length
  const enCoursUS  = racines.filter(t => t.statut === 'En cours').length
  const bloqueUS   = racines.filter(t => t.statut === 'Bloqué').length
  const backlogPct = totalUS > 0 ? Math.round(faitUS / totalUS * 100) : 0
  const effortFaitGlobal = racines.filter(t => t.statut === 'Fait').reduce((s, t) => s + effortEffectif(t, childMap), 0)

  const globalBudgetEtp = trims.reduce((s, t) => s + trimEtpCostEur(t, finConfig, joursTotaux), 0)
  const globalRealiseEur = effortFaitGlobal * tjmMoyenOf(finConfig)

  const firstTrimStart = trims
    .filter(t => !!t.lance)
    .map(t => getQuarterStart(t.trimestre))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null
  const globalTargetDate = produit.date_lancement_cible ? new Date(produit.date_lancement_cible) : null
  const globalCursorPct = firstTrimStart && globalTargetDate && globalTargetDate > firstTrimStart
    ? Math.min(100, Math.max(0, Math.round(
        (today.getTime() - firstTrimStart.getTime()) /
        (globalTargetDate.getTime() - firstTrimStart.getTime()) * 100
      )))
    : null

  const ragAGlobal = totalUS > 0         ? ragAvancement(backlogPct, globalCursorPct) : null
  const ragBGlobal = globalBudgetEtp > 0 ? ragBudget(globalRealiseEur, globalBudgetEtp, globalCursorPct) : null

  // `t.sprint` (l'ancien champ, avant sprint_debut/sprint_fin) porte une
  // valeur par défaut ('S01' constaté en base) sur la quasi-totalité des
  // tâches, y compris jamais planifiées — seul sprint_debut est fiable ici.
  const trimSprintSet  = new Set<string>(currentTrim?.sprints_ids ?? [])
  const racinesTrim    = racines.filter(t => t.sprint_debut && trimSprintSet.has(t.sprint_debut))
  const totalUSTrim    = racinesTrim.length
  const faitUSTrim     = racinesTrim.filter(t => t.statut === 'Fait').length
  const backlogPctTrim = totalUSTrim > 0 ? Math.round(faitUSTrim / totalUSTrim * 100) : 0
  const effortFaitTrim = racinesTrim.filter(t => t.statut === 'Fait').reduce((s, t) => s + effortEffectif(t, childMap), 0)

  const quarterStart = currentTrim ? getQuarterStart(currentTrim.trimestre) : null
  const joursEcoules = quarterStart ? Math.min(countWorkingDays(quarterStart, today), joursTotaux) : null
  const cursorPct    = joursEcoules !== null ? Math.round(joursEcoules / joursTotaux * 100) : null

  const trimEnd = currentTrim ? getQuarterEnd(currentTrim.trimestre) : null

  const trimBudgetEtp     = currentTrim ? trimEtpCostEur(currentTrim, finConfig, joursTotaux) : 0
  const trimRealiseEtpEur = effortFaitTrim * tjmMoyenOf(finConfig)

  const ragATrim = totalUSTrim > 0   ? ragAvancement(backlogPctTrim, cursorPct) : null
  const ragBTrim = trimBudgetEtp > 0 ? ragBudget(trimRealiseEtpEur, trimBudgetEtp, cursorPct) : null

  const openRisques = (produit.risques ?? []).filter(r => !r.cloture).length
  const openActions = (produit.actions_lop ?? []).filter(a => !a.cloture).length
  const bloqueTrim  = racinesTrim.filter(t => t.statut === 'Bloqué').length
  const ragBlGlobal = ragBlocages(bloqueUS,   openRisques)
  const ragBlTrim   = ragBlocages(bloqueTrim, openRisques)

  // ── Livraison estimée (trim cursor) ─────────────────────────
  let estimatedDeliveryDate: Date | null = null
  if (cursorPct !== null && cursorPct > 0 && totalUSTrim > 0 && backlogPctTrim > 0) {
    const pace = backlogPctTrim / cursorPct
    estimatedDeliveryDate = addWorkingDays(today, Math.round(((100 - backlogPctTrim) / pace) * joursTotaux / 100))
  }

  // ── ragD global (date_lancement_cible) ──────────────────────
  let ragD: Rag = null
  let projectedPct: number | null = null

  if (produit.date_lancement_cible) {
    const targetDate = new Date(produit.date_lancement_cible)
    if (targetDate < today) {
      ragD = 'red'
    } else if (globalCursorPct !== null && globalCursorPct > 0 && totalUS > 0) {
      const pace = backlogPct / globalCursorPct
      projectedPct = Math.min(100, Math.round(backlogPct + pace * (100 - globalCursorPct)))
      ragD = projectedPct >= 90 ? 'green' : projectedPct >= 70 ? 'amber' : 'red'
    } else if (cursorPct !== null && cursorPct > 0 && backlogPctTrim > 0) {
      const pace = backlogPctTrim / cursorPct
      const joursVersTarget = Math.min(countWorkingDays(today, targetDate), joursTotaux - (joursEcoules ?? 0))
      projectedPct = Math.min(100, Math.round(backlogPctTrim + pace * (joursVersTarget / joursTotaux * 100)))
      ragD = projectedPct >= 90 ? 'green' : projectedPct >= 70 ? 'amber' : 'red'
    } else {
      const diff = Math.floor((targetDate.getTime() - today.getTime()) / 86400000)
      ragD = diff < 0 ? 'red' : diff < 14 ? 'amber' : 'green'
    }
  }

  // ── ragDTrim (fin trimestre courant) ─────────────────────────
  let ragDTrim: Rag = null
  let projectedPctTrim: number | null = null

  if (trimEnd && cursorPct !== null && cursorPct > 0 && totalUSTrim > 0) {
    const joursRestantsTrim = Math.max(0, joursTotaux - (joursEcoules ?? 0))
    const pace = backlogPctTrim / cursorPct
    projectedPctTrim = Math.min(100, Math.round(backlogPctTrim + pace * (joursRestantsTrim / joursTotaux * 100)))
    ragDTrim = projectedPctTrim >= 90 ? 'green' : projectedPctTrim >= 70 ? 'amber' : 'red'
  } else if (trimEnd && trimEnd < today) {
    ragDTrim = 'red'
  }

  return {
    totalUS, faitUS, enCoursUS, bloqueUS, backlogPct, ragAGlobal, ragBGlobal, globalCursorPct,
    totalUSTrim, faitUSTrim, backlogPctTrim, bloqueTrim, cursorPct, joursEcoules, joursTotaux,
    ragATrim, ragBTrim,
    ragD, ragDTrim, ragBlGlobal, ragBlTrim, openRisques, openActions,
    projectedPct, projectedPctTrim, estimatedDeliveryDate,
    trimLabel: currentTrim?.trimestre ?? null,
    dateLancementCible: produit.date_lancement_cible,
  }
}

// ── Burndown trimestriel (reste à faire théorique vs réel, semaine par semaine) ──
// "Objectif" (pointillé) : pente idéale linéaire du total d'US à 0, sur toute la
// durée du trimestre (semaines passées ET à venir).
// "Réalisé" (plein) : US restantes réellement, jusqu'à aujourd'hui seulement
// (null au-delà — la ligne s'arrête au lieu de continuer à plat).
export interface BurndownPoint { label: string; objectif: number; realise: number | null }

export function computeBurndownWeeks(quarterStart: Date, quarterEnd: Date, objectif: number, doneDates: Date[]): BurndownPoint[] {
  if (quarterStart > quarterEnd) return []
  const today = new Date()
  const totalWeeks = Math.max(1, Math.ceil((quarterEnd.getTime() - quarterStart.getTime()) / (7 * 86400000)))
  const points: BurndownPoint[] = []
  for (let w = 0; w <= totalWeeks; w++) {
    const weekDate = new Date(Math.min(quarterStart.getTime() + w * 7 * 86400000, quarterEnd.getTime()))
    const idealRestant = Math.round(objectif * (1 - w / totalWeeks))
    let realiseRestant: number | null = null
    if (weekDate <= today) {
      const doneCount = doneDates.filter(d => d.getTime() <= weekDate.getTime()).length
      realiseRestant = Math.max(0, objectif - doneCount)
    }
    points.push({ label: w === 0 ? 'Début' : w === totalWeeks ? 'Fin' : `S${w}`, objectif: idealRestant, realise: realiseRestant })
  }
  return points
}

export function scopedMetrics(m: ProduitMetrics, scope: MultiScope) {
  const isGlobal    = scope === 'global'
  const ragA        = isGlobal ? m.ragAGlobal : m.ragATrim
  const ragB        = isGlobal ? m.ragBGlobal : m.ragBTrim
  const ragBl       = isGlobal ? m.ragBlGlobal : m.ragBlTrim
  const ragD        = isGlobal ? m.ragD : m.ragDTrim
  const projPct     = isGlobal ? m.projectedPct : m.projectedPctTrim
  const trajectoire: Rag = ragD ?? ragA
  const total       = isGlobal ? m.totalUS    : m.totalUSTrim
  const fait        = isGlobal ? m.faitUS     : m.faitUSTrim
  const backlogPct  = isGlobal ? m.backlogPct : m.backlogPctTrim
  const cursor      = isGlobal ? m.globalCursorPct : m.cursorPct
  const ecart       = cursor !== null ? backlogPct - cursor : backlogPct - 50

  const fmtD = (d: Date) => d.toLocaleDateString('fr-FR')

  const tipA = total > 0
    ? `${fait}/${total} US ${isGlobal ? 'réalisées' : '(trim)'}\n${backlogPct}% fait · curseur ${cursor ?? '?'}%\nÉcart : ${ecart >= 0 ? '+' : ''}${ecart} pts`
    : undefined

  const tipD = (() => {
    if (projPct !== null) {
      const lines = [`Projection : ${projPct}%`]
      if (isGlobal && m.dateLancementCible) lines.push(`Date cible : ${fmtD(new Date(m.dateLancementCible))}`)
      if (m.estimatedDeliveryDate) lines.push(`Livraison est. : ${fmtD(m.estimatedDeliveryDate)}`)
      return lines.join('\n')
    }
    if (m.estimatedDeliveryDate) return `Livraison estimée :\n${fmtD(m.estimatedDeliveryDate)}`
    if (m.dateLancementCible)    return `Date cible :\n${fmtD(new Date(m.dateLancementCible))}`
    return undefined
  })()

  const tipTraj = projPct !== null
    ? `Vélocité : ${backlogPct}% · curseur ${cursor ?? '?'}%\nProjection : ${projPct}%`
    : tipA

  const tipBl = m.openRisques > 0 || m.openActions > 0
    ? `${m.openRisques} risque${m.openRisques !== 1 ? 's' : ''} ouvert${m.openRisques !== 1 ? 's' : ''}\n${m.openActions} action${m.openActions !== 1 ? 's' : ''} LOP`
    : `Aucun risque ni blocage`

  const tipB = m.cursorPct !== null
    ? `Curseur trim : ${m.cursorPct}% (j${m.joursEcoules}/${m.joursTotaux})`
    : isGlobal && m.globalCursorPct !== null
      ? `Curseur global : ${m.globalCursorPct}%`
      : undefined

  return { ragA, ragB, ragD, ragBl, trajectoire, total, fait, backlogPct, projPct, tipA, tipB, tipD, tipTraj, tipBl }
}
