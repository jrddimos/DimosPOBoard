import type { Tache } from '@/types'
import type { Produit } from '@/hooks/useProduits'
import type { FinanceConfig } from '@/hooks/useFinanceConfig'

export type Rag = 'green' | 'amber' | 'red' | null
export type MultiScope = 'global' | 'trim'

export interface ProduitMetrics {
  totalUS: number; faitUS: number; enCoursUS: number; bloqueUS: number; backlogPct: number
  ragAGlobal: Rag; ragBGlobal: Rag; globalCursorPct: number | null
  totalUSTrim: number; faitUSTrim: number; backlogPctTrim: number; bloqueTrim: number
  cursorPct: number | null; joursEcoules: number | null; joursTotaux: number
  ragATrim: Rag; ragBTrim: Rag
  ragD: Rag; ragBlGlobal: Rag; ragBlTrim: Rag
  openRisques: number; openActions: number
  projectedPct: number | null
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
): ProduitMetrics {
  const joursTotaux = finConfig?.jours_par_trim ?? 65
  const tjmMoyen    = (finConfig?.equipe_tjms?.length ?? 0) > 0
    ? Math.round(finConfig!.equipe_tjms.reduce((s, e) => s + e.tjm, 0) / finConfig!.equipe_tjms.length)
    : 500

  const trims       = produit.objectifs_trimestriels ?? []
  const currentTrim = [...trims].reverse().find(t => !!t.lance && !t.pause && !t.cloture) ?? null

  const totalUS    = racines.length
  const faitUS     = racines.filter(t => t.statut === 'Fait').length
  const enCoursUS  = racines.filter(t => t.statut === 'En cours').length
  const bloqueUS   = racines.filter(t => t.statut === 'Bloqué').length
  const backlogPct = totalUS > 0 ? Math.round(faitUS / totalUS * 100) : 0
  const effortFaitGlobal = racines.filter(t => t.statut === 'Fait').reduce((s, t) => s + (t.effort_j ?? 0), 0)

  const totalEtp        = trims.reduce((s, t) => s + (t.budget_etp ?? 0), 0)
  const globalBudgetEtp = totalEtp * tjmMoyen * joursTotaux
  const globalRealiseEur = effortFaitGlobal * tjmMoyen

  const firstTrimStart = trims
    .filter(t => !!t.lance)
    .map(t => getQuarterStart(t.trimestre))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null
  const globalTargetDate = produit.date_lancement_cible ? new Date(produit.date_lancement_cible) : null
  const globalCursorPct = firstTrimStart && globalTargetDate && globalTargetDate > firstTrimStart
    ? Math.min(100, Math.round(
        (today.getTime() - firstTrimStart.getTime()) /
        (globalTargetDate.getTime() - firstTrimStart.getTime()) * 100
      ))
    : null

  const ragAGlobal = totalUS > 0         ? ragAvancement(backlogPct, globalCursorPct) : null
  const ragBGlobal = globalBudgetEtp > 0 ? ragBudget(globalRealiseEur, globalBudgetEtp, globalCursorPct) : null

  const trimSprintSet  = new Set<string>(currentTrim?.sprints_ids ?? [])
  const racinesTrim    = racines.filter(t => t.sprint && trimSprintSet.has(t.sprint))
  const totalUSTrim    = racinesTrim.length
  const faitUSTrim     = racinesTrim.filter(t => t.statut === 'Fait').length
  const backlogPctTrim = totalUSTrim > 0 ? Math.round(faitUSTrim / totalUSTrim * 100) : 0
  const effortFaitTrim = racinesTrim.filter(t => t.statut === 'Fait').reduce((s, t) => s + (t.effort_j ?? 0), 0)

  const quarterStart = currentTrim ? getQuarterStart(currentTrim.trimestre) : null
  const joursEcoules = quarterStart ? Math.min(countWorkingDays(quarterStart, today), joursTotaux) : null
  const cursorPct    = joursEcoules !== null ? Math.round(joursEcoules / joursTotaux * 100) : null

  const trimBudgetEtp     = (currentTrim?.budget_etp ?? 0) * tjmMoyen * joursTotaux
  const trimRealiseEtpEur = effortFaitTrim * tjmMoyen

  const ragATrim = totalUSTrim > 0   ? ragAvancement(backlogPctTrim, cursorPct) : null
  const ragBTrim = trimBudgetEtp > 0 ? ragBudget(trimRealiseEtpEur, trimBudgetEtp, cursorPct) : null

  const openRisques = (produit.risques ?? []).filter(r => !r.cloture).length
  const openActions = (produit.actions_lop ?? []).filter(a => !a.cloture).length
  const bloqueTrim  = racinesTrim.filter(t => t.statut === 'Bloqué').length
  const ragBlGlobal = ragBlocages(bloqueUS,   openRisques)
  const ragBlTrim   = ragBlocages(bloqueTrim, openRisques)

  let ragD: Rag = null
  let projectedPct: number | null = null
  let estimatedDeliveryDate: Date | null = null

  if (cursorPct !== null && cursorPct > 0 && totalUSTrim > 0 && backlogPctTrim > 0) {
    const pace = backlogPctTrim / cursorPct
    estimatedDeliveryDate = addWorkingDays(today, Math.round(((100 - backlogPctTrim) / pace) * joursTotaux / 100))
  }

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

  return {
    totalUS, faitUS, enCoursUS, bloqueUS, backlogPct, ragAGlobal, ragBGlobal, globalCursorPct,
    totalUSTrim, faitUSTrim, backlogPctTrim, bloqueTrim, cursorPct, joursEcoules, joursTotaux,
    ragATrim, ragBTrim,
    ragD, ragBlGlobal, ragBlTrim, openRisques, openActions,
    projectedPct, estimatedDeliveryDate, trimLabel: currentTrim?.trimestre ?? null,
    dateLancementCible: produit.date_lancement_cible,
  }
}

export function scopedMetrics(m: ProduitMetrics, scope: MultiScope) {
  const isGlobal   = scope === 'global'
  const ragA       = isGlobal ? m.ragAGlobal : m.ragATrim
  const ragB       = isGlobal ? m.ragBGlobal : m.ragBTrim
  const ragBl      = isGlobal ? m.ragBlGlobal : m.ragBlTrim
  const trajectoire: Rag = m.ragD ?? ragA
  const total      = isGlobal ? m.totalUS    : m.totalUSTrim
  const fait       = isGlobal ? m.faitUS     : m.faitUSTrim
  const backlogPct = isGlobal ? m.backlogPct : m.backlogPctTrim
  const cursor     = isGlobal ? m.globalCursorPct : m.cursorPct
  const ecart      = cursor !== null ? backlogPct - cursor : backlogPct - 50

  const fmtD = (d: Date) => d.toLocaleDateString('fr-FR')

  const tipA = total > 0
    ? `${fait}/${total} US ${isGlobal ? 'réalisées' : '(trim)'}\n${backlogPct}% fait · curseur ${cursor ?? '?'}%\nÉcart : ${ecart >= 0 ? '+' : ''}${ecart} pts`
    : undefined

  const tipD = (() => {
    if (m.projectedPct !== null && m.dateLancementCible) {
      const lines = [`Projection : ${m.projectedPct}% à date cible`]
      lines.push(`Date cible : ${fmtD(new Date(m.dateLancementCible))}`)
      if (m.estimatedDeliveryDate) lines.push(`Livraison est. : ${fmtD(m.estimatedDeliveryDate)}`)
      return lines.join('\n')
    }
    if (m.estimatedDeliveryDate) return `Livraison estimée :\n${fmtD(m.estimatedDeliveryDate)}`
    if (m.dateLancementCible)    return `Date cible :\n${fmtD(new Date(m.dateLancementCible))}`
    return undefined
  })()

  const tipTraj = m.projectedPct !== null
    ? `Vélocité : ${backlogPct}% · curseur ${cursor ?? '?'}%\nProjection : ${m.projectedPct}%`
    : tipA

  const tipBl = m.openRisques > 0 || m.openActions > 0
    ? `${m.openRisques} risque${m.openRisques !== 1 ? 's' : ''} ouvert${m.openRisques !== 1 ? 's' : ''}\n${m.openActions} action${m.openActions !== 1 ? 's' : ''} LOP`
    : `Aucun risque ni blocage`

  const tipB = m.cursorPct !== null
    ? `Curseur trim : ${m.cursorPct}% (j${m.joursEcoules}/${m.joursTotaux})`
    : isGlobal && m.globalCursorPct !== null
      ? `Curseur global : ${m.globalCursorPct}%`
      : undefined

  return { ragA, ragB, ragD: m.ragD, ragBl, trajectoire, total, fait, backlogPct, tipA, tipB, tipD, tipTraj, tipBl }
}
