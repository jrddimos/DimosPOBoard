import { clsx, type ClassValue } from 'clsx'
import type { Tache } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
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

// Effort effectif récursif : somme des sous-tâches si elles existent, sinon
// l'effort propre. Permet à un Conteneur de remonter le bon total même si
// une de ses US a elle-même des sous-tâches (2 niveaux de rollup).
export function effortEffectif(t: Tache, childMap: Record<string, Tache[]>): number {
  const subs = childMap[t.id_tache] ?? []
  if (subs.length === 0) return t.effort_j ?? 0
  return subs.reduce((s, c) => s + effortEffectif(c, childMap), 0)
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
export interface CritereItem { id: string; text: string; checked: boolean }

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
