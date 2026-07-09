// ── Constantes Dimos D3X+ ─────────────────────────────────────
import type { ExigenceType, ExigenceCriticite } from '@/hooks/useDod'

export const EXIGENCE_TYPE_CFG: Record<ExigenceType, { label: string; className: string }> = {
  fonctionnelle: { label: 'Fonctionnelle', className: 'bg-brand/10 text-brand' },
  performance:   { label: 'Performance',   className: 'bg-blue/10 text-blue' },
  securite:      { label: 'Sécurité',      className: 'bg-red/10 text-red' },
  cout:          { label: 'Coût',          className: 'bg-orange/10 text-orange' },
}
export const CRITICITE_CFG: Record<ExigenceCriticite, { label: string; dot: string }> = {
  haute:   { label: 'Criticité haute',   dot: 'bg-red' },
  moyenne: { label: 'Criticité moyenne', dot: 'bg-orange' },
  basse:   { label: 'Criticité basse',   dot: 'bg-border' },
}

export const EPIC_LIST = [
  'EPIC 1 — Architecture & CDC',
  'EPIC 2 — Avaloir',
  'EPIC 3 — Train de Galets',
  'EPIC 4 — Refendage',
  'EPIC 5 — Coupe / Cisaille',
  'EPIC 6 — Châssis & Structure',
  'EPIC 7 — Motorisation',
  'EPIC 8 — Interface Opérateur',
  'EPIC 9 — Sécurité & CE',
  'EPIC 10 — Maintenance & SAV',
  'EPIC 11 — Prototype & Essais',
  'EPIC 12 — Validation & Industrialisation',
  'EPIC 13 — Commerce & Marketing',
] as const

export const EPIC_COLORS: Record<string, string> = {
  'EPIC 1 — Architecture & CDC':              '#5B21B6',
  'EPIC 2 — Avaloir':                         '#065F46',
  'EPIC 3 — Train de Galets':                 '#92600A',
  'EPIC 4 — Refendage':                       '#991B1B',
  'EPIC 5 — Coupe / Cisaille':                '#C2410C',
  'EPIC 6 — Châssis & Structure':             '#1E40AF',
  'EPIC 7 — Motorisation':                    '#6B21A8',
  'EPIC 8 — Interface Opérateur':             '#9D174D',
  'EPIC 9 — Sécurité & CE':                   '#134E4A',
  'EPIC 10 — Maintenance & SAV':              '#713F12',
  'EPIC 11 — Prototype & Essais':             '#0C4A6E',
  'EPIC 12 — Validation & Industrialisation': '#14532D',
  'EPIC 13 — Commerce & Marketing':           '#9A3412',
}

export const EPIC_BG: Record<string, string> = {
  'EPIC 1 — Architecture & CDC':              '#EDE9FE',
  'EPIC 2 — Avaloir':                         '#D1FAE5',
  'EPIC 3 — Train de Galets':                 '#FEF3C7',
  'EPIC 4 — Refendage':                       '#FEE2E2',
  'EPIC 5 — Coupe / Cisaille':                '#FFEDD5',
  'EPIC 6 — Châssis & Structure':             '#DBEAFE',
  'EPIC 7 — Motorisation':                    '#F3E8FF',
  'EPIC 8 — Interface Opérateur':             '#FCE7F3',
  'EPIC 9 — Sécurité & CE':                   '#CCFBF1',
  'EPIC 10 — Maintenance & SAV':              '#FEF9C3',
  'EPIC 11 — Prototype & Essais':             '#E0F2FE',
  'EPIC 12 — Validation & Industrialisation': '#F0FDF4',
  'EPIC 13 — Commerce & Marketing':           '#FFF7ED',
}

export const JALON_LIST = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6'] as const

export const JALON_COLORS: Record<string, string> = {
  I1: '#5B21B6', I2: '#065F46', I3: '#92600A',
  I4: '#991B1B', I5: '#1E40AF', I6: '#14532D',
}

export const MOSCOW_LIST = ['Must Have', 'Should Have', 'Could Have', "Won't Have"] as const

export const MOSCOW_STYLE: Record<string, { bg: string; text: string }> = {
  'Must Have':    { bg: '#EDE9FE', text: '#5B21B6' },
  'Should Have':  { bg: '#DBEAFE', text: '#1E40AF' },
  'Could Have':   { bg: '#D1FAE5', text: '#065F46' },
  "Won't Have":   { bg: '#FEE2E2', text: '#991B1B' },
}

export const STATUT_STYLE: Record<string, { bg: string; text: string }> = {
  'À faire':  { bg: '#F1F5F9', text: '#475569' },
  'En cours': { bg: '#FEF3C7', text: '#92600A' },
  'Fait':     { bg: '#D1FAE5', text: '#065F46' },
  'Bloqué':   { bg: '#FEE2E2', text: '#991B1B' },
}

// Config Tailwind pour StatusPicker (dropdown de statut éditable) — distincte de STATUT_STYLE (hex, pour badges statiques)
export const STATUT_PICKER_CONFIG: Record<string, { dot: string; bg: string; text: string; border: string }> = {
  'À faire':  { dot: 'bg-slate-400',   bg: 'bg-slate-50',   text: 'text-slate-600',   border: 'border-slate-200' },
  'En cours': { dot: 'bg-amber-400',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  'Fait':     { dot: 'bg-emerald-400', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  'Bloqué':   { dot: 'bg-rose-400',    bg: 'bg-rose-50',    text: 'text-rose-600',    border: 'border-rose-200' },
}

export const TYPE_FONCTION_STYLE: Record<string, { bg: string; text: string }> = {
  'Fonction principale':  { bg: '#EDE9FE', text: '#5B21B6' },
  'Fonction secondaire':  { bg: '#FEF3C7', text: '#92600A' },
  'Fonction support':     { bg: '#F1F5F9', text: '#475569' },
  'Fonction exclue':      { bg: '#FEE2E2', text: '#991B1B' },
}

export const PRIO_STYLE: Record<string, { bg: string; text: string }> = {
  P1: { bg: '#FEE2E2', text: '#991B1B' },
  P2: { bg: '#FFEDD5', text: '#C2410C' },
  P3: { bg: '#FEF9C3', text: '#713F12' },
  P4: { bg: '#F1F5F9', text: '#475569' },
}

export const METIERS_DEFAULT = [
  'Cadrage & Analyse marché',
  'Conception R&D',
  'Prototypage & Tests',
  'Industrialisation & Formation',
  'Mkt & Commerce',
]

export const SPRINTS_LIST: string[] = Array.from(
  { length: 16 },
  (_, i) => `S${String(i + 1).padStart(2, '0')}`
)

export const BRAND_COLORS = [
  // Bleus / violets
  '#4A4CC8','#6B6BF0','#0055CC','#2563EB','#1E3A5F','#8B5CF6','#7C3AED','#A855F7',
  // Verts / teals
  '#00C896','#10B981','#14B8A6','#059669','#16A34A','#84CC16',
  // Oranges / jaunes / rouges
  '#F0A500','#F59E0B','#F97316','#EF4444','#DC2626','#E11D48',
  // Roses / magentas
  '#EC4899','#DB2777','#C026D3',
  // Neutres
  '#6B7280','#475569','#334155','#0F172A',
]
