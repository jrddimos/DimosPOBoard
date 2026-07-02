import type { Produit, TrimObjectif } from '@/hooks/useProduits'

export type PlanMode = 'previsionnel' | 'realise' | 'comparaison'

export interface WeekInfo { semaine: number; lundi: Date }

// ── Constants ─────────────────────────────────────────────────
export const DEFAULT_JOURS_TRIM = 65
export const COL_PRODUIT = 220
export const COL_Q       = 140   // colonne trimestre repliée (unique)
export const COL_Q_ALLOC = 64    // sous-colonne "Saisi" (trimestre déplié uniquement)
export const COL_Q_RESTE = 72    // sous-colonne "Reste" (trimestre déplié uniquement)
export const COL_WK      = 52

export const Q_RANGE: Record<number, [number, number]> = { 1:[1,13], 2:[14,26], 3:[27,39], 4:[40,52] }

// ── ISO week helpers ──────────────────────────────────────────
export function getWeeksForYear(year: number): WeekInfo[] {
  const jan4 = new Date(year, 0, 4)
  const dow   = jan4.getDay() || 7
  const first = new Date(jan4)
  first.setDate(jan4.getDate() - dow + 1)
  const weeks: WeekInfo[] = []
  const cur = new Date(first)
  for (let w = 1; w <= 53; w++) {
    const thu = new Date(cur); thu.setDate(cur.getDate() + 3)
    if (thu.getFullYear() === year) weeks.push({ semaine: w, lundi: new Date(cur) })
    cur.setDate(cur.getDate() + 7)
  }
  return weeks
}

export function fmtDayMonth(d: Date): string {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
}

// ── Quarter helpers ───────────────────────────────────────────
export function parseTrimestre(t: string): { q: number; year: number } | null {
  const m = t.match(/Q([1-4])[^\d]*(\d{4})/i)
  if (!m) return null
  return { q: parseInt(m[1]), year: parseInt(m[2]) }
}

export function getTrimForQ(p: Produit, q: number, year: number): TrimObjectif | undefined {
  return (p.objectifs_trimestriels ?? []).find(t => {
    const parsed = parseTrimestre(t.trimestre)
    return parsed?.q === q && parsed?.year === year
  })
}

// ── Format helpers ────────────────────────────────────────────
export function fmtJ(v: number, dec = 1): string {
  if (!v) return ''
  return v % 1 === 0 ? `${v}j` : `${v.toFixed(dec)}j`
}

export function fmtReste(reste: number): string {
  if (reste === 0) return '✓'
  const abs = Math.abs(reste)
  const s   = reste > 0 ? '−' : '+'
  return `${s}${abs % 1 === 0 ? abs : abs.toFixed(1)}j`
}

export function resteClass(reste: number | null): string {
  if (reste === null) return 'text-subtle/30'
  if (reste < 0)  return 'text-rose-600 font-bold'
  if (reste === 0) return 'text-emerald-600 font-semibold'
  return 'text-amber-600 font-semibold'
}
