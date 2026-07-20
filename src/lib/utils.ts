import { clsx, type ClassValue } from 'clsx'
import { SPRINTS_LIST } from '@/constants'
import type { Tache } from '@/types'
import type { Sprint } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

// Numéros des sprints RÉELLEMENT créés pour le produit, dans l'ordre
// chronologique de SPRINTS_LIST (S1 < S2 < … < S10, pas l'ordre alphabétique
// qui mettrait S10 avant S2) — pour que les sélecteurs de sprint ne proposent
// jamais un S07 fantôme jamais créé, contrairement à SPRINTS_LIST brut (qui
// reste la plage plafond S01-S16 utilisée pour créer/trier des sprints).
export function existingSprintNumeros(sprints: Pick<Sprint, 'numero'>[]): string[] {
  const set = new Set(sprints.map(s => s.numero))
  return SPRINTS_LIST.filter(s => set.has(s))
}

export function buildTacheIndex(taches: Tache[]): Map<string, Tache> {
  return new Map(taches.map(t => [t.id_tache, t]))
}

// Une US "réelle" (tâche principale) : pas un Conteneur, et si elle a un
// parent, ce parent est un Conteneur (regroupement pur). Une US peut donc
// être racine OU rattachée à un Conteneur — dans les deux cas elle compte
// comme un item de travail à part entière (effort, métriques, Kanban...).
export function isUS(t: Tache, byId: Map<string, Tache>): boolean {
  if (t.type_tache === 'Conteneur') return false
  if (!t.parent_id) return true
  return byId.get(t.parent_id)?.type_tache === 'Conteneur'
}

// Une vraie sous-tâche : elle a un parent, et ce parent n'est PAS un
// Conteneur (donc son parent est une US) — feuille de l'arbre à 3 niveaux.
export function isSousTache(t: Tache, byId: Map<string, Tache>): boolean {
  if (!t.parent_id) return false
  return byId.get(t.parent_id)?.type_tache !== 'Conteneur'
}

// ── Assignés multiples (US uniquement — une sous-tâche garde toujours un
// seul assigné) ──────────────────────────────────────────────────────
// `assigne_a` reste une simple colonne texte : plusieurs trigrammes y sont
// stockés séparés par des virgules ("ABC, DEF"). Une sous-tâche n'y stocke
// jamais qu'un seul trigramme, donc parseAssignees reste transparent pour
// elle (liste à un seul élément) — pas besoin de distinguer les deux cas
// dans le code qui lit/compte l'effort.
export function parseAssignees(s: string | null | undefined): string[] {
  if (!s) return []
  const seen = new Set<string>()
  for (const part of s.split(/[,;]+/)) {
    const tri = part.trim()
    if (tri) seen.add(tri)
  }
  return [...seen]
}

export function serializeAssignees(list: string[]): string {
  return list.join(', ')
}

// Effort effectif récursif : effort PROPRE de la tâche + somme de ses
// sous-tâches. `effort_j` d'une US porte donc uniquement le travail direct
// sur l'US (coordination, intégration…), jamais un total matérialisé —
// c'est ce calcul, partout, qui produit le total (migration 0057 : les
// anciennes sommes matérialisées ont été remises à zéro).
export function effortEffectif(t: Tache, childMap: Record<string, Tache[]>): number {
  const subs = childMap[t.id_tache] ?? []
  return (t.effort_j ?? 0) + subs.reduce((s, c) => s + effortEffectif(c, childMap), 0)
}

// childMap parent_id → enfants, sur l'ensemble des tâches passées — même
// structure que celles construites localement par TachesPage/TacheTree,
// centralisée pour les consommateurs d'effortEffectif (dashboards, stats).
export function buildChildMap(taches: Tache[]): Record<string, Tache[]> {
  const m: Record<string, Tache[]> = {}
  for (const t of taches) {
    if (!t.parent_id) continue
    ;(m[t.parent_id] = m[t.parent_id] ?? []).push(t)
  }
  return m
}

// Numérotation d'affichage recalculée à la volée — jamais persistée,
// jamais utilisée comme référence (id_tache/code restent les identifiants
// stables). Clé "epic::<label complet>" → "1", clé id_tache → "1.2"/"1.2.1".
// Un Conteneur ne consomme pas de numéro : ses enfants continuent la
// séquence de l'Epic comme s'il n'existait pas.
export function computeTacheNumbers(
  orderedEpicLabels: string[],
  tasksByEpicLabel: (label: string) => Tache[],
  childMap: Record<string, Tache[]>,
  byId: Map<string, Tache>,
): Map<string, string> {
  const numbers = new Map<string, string>()
  orderedEpicLabels.forEach((label, epicIdx) => {
    const tasks = tasksByEpicLabel(label)
    if (!tasks.length) return
    numbers.set(`epic::${label}`, String(epicIdx + 1))
    let usCounter = 0
    const walk = (list: Tache[]) => {
      for (const t of list) {
        if (t.type_tache === 'Conteneur') { walk(childMap[t.id_tache] ?? []); continue }
        if (!isUS(t, byId)) continue
        usCounter++
        const num = `${epicIdx + 1}.${usCounter}`
        numbers.set(t.id_tache, num)
        ;(childMap[t.id_tache] ?? []).forEach((s, i) => numbers.set(s.id_tache, `${num}.${i + 1}`))
      }
    }
    walk(tasks)
  })
  return numbers
}

// Tri "naturel" : F2 < F10 et F1 < F1.1 < F2, contrairement au tri
// alphabétique brut (F1, F1.1, F10, F2) utilisé par défaut par Postgres/JS.
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

// Regroupement visuel des critères DoD d'une même famille (F1.1, F1.2… → "F1")
export function codeMajor(code: string): string {
  const idx = code.indexOf('.')
  return idx === -1 ? code : code.slice(0, idx)
}

// `taches.sprint` (l'ancien champ, avant sprint_debut/sprint_fin) porte une
// valeur par défaut ('S01' constaté en base) sur la quasi-totalité des
// tâches, y compris jamais planifiées — ce n'est pas un signal fiable, on ne
// se base donc que sur sprint_debut/sprint_fin (systématiquement synchronisés
// ensemble par l'app à chaque planification réelle).
export function sprintInRange(debut: string | null, fin: string | null, target: string): boolean {
  if (debut === target) return true
  if (debut && fin && debut <= target && fin >= target) return true
  return false
}

export function epicShortName(epic: string): string {
  return epic.split(' — ')[1] ?? epic
}

export function epicCode(epic: string): string {
  return epic.split(' — ')[0] ?? epic
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Critères d'acceptation ────────────────────────────────────
// checked_at : horodatage de la dernière coche (posé/effacé au toggle, cf.
// CriteresEditor.tsx) — permet un burndown "par critères" (date de
// complétion propre à chaque item, indépendante de celle de sa tâche
// porteuse). Absent sur les items cochés avant l'ajout de ce champ.
export interface CritereItem { id: string; text: string; checked: boolean; checked_at?: string | null }

export function parseCriteres(raw: string | null | undefined): CritereItem[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as CritereItem[]
  } catch {}
  // Rétrocompatibilité : texte libre ligne par ligne
  return raw.split('\n').map(l => l.trim()).filter(Boolean).map(l => ({
    id: Math.random().toString(36).slice(2),
    text: l.replace(/^[•\-*]\s*/, ''),
    checked: false,
  }))
}

export function serializeCriteres(items: CritereItem[]): string {
  return JSON.stringify(items)
}

export function hasPendingCriteres(raw: string | null | undefined): boolean {
  const items = parseCriteres(raw)
  return items.length > 0 && items.some(i => !i.checked)
}

// Codes d'exigences (F1.1, F1.2…) référencés par `Tache.lien_dod`, un champ
// texte libre séparé par virgules/points-virgules — même parsing que
// CouvertureTree/DodPage/SetupPage/SprintBoardPage, centralisé ici pour les
// nouveaux usages (les call-sites existants gardent leur copie locale).
export function parseLienDodCodes(lien: string | null | undefined): string[] {
  return (lien ?? '').split(/[,;]/).map(s => s.trim()).filter(Boolean)
}

export function downloadCSV(data: Record<string, unknown>[], filename: string, headers: string[], cols: string[]) {
  const rows = [headers, ...data.map(row => cols.map(col => {
    const val = row[col]
    if (val === null || val === undefined) return '""'
    if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`
    return `"${String(val).replace(/"/g, '""')}"`
  }))]
  const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Semaine ISO (partagé Réunion PO / hub Réunions) ───────────────
export function getISOWeek(date: Date): { semaine: number; annee: number } {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const semaine = 1 + Math.round(
    ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
  )
  return { semaine, annee: d.getFullYear() }
}
