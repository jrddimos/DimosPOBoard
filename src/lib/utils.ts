import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function sprintInRange(sprint: string, debut: string | null, fin: string | null, target: string): boolean {
  if (sprint === target) return true
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
