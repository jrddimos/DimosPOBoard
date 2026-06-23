import { cn } from '@/lib/utils'
import {
  STATUT_STYLE, MOSCOW_STYLE, TYPE_FONCTION_STYLE, PRIO_STYLE,
  EPIC_COLORS, EPIC_BG, JALON_COLORS,
} from '@/constants'

interface BadgeProps {
  value: string
  className?: string
}

function makeBadge(bg: string, text: string, value: string, className?: string) {
  return (
    <span
      className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold', className)}
      style={{ background: bg, color: text }}
    >
      {value}
    </span>
  )
}

export function StatutBadge({ value, className }: BadgeProps) {
  const s = STATUT_STYLE[value] ?? { bg: '#F1F5F9', text: '#475569' }
  return makeBadge(s.bg, s.text, value, className)
}

export function MoscowBadge({ value, className }: BadgeProps) {
  const s = MOSCOW_STYLE[value] ?? { bg: '#F1F5F9', text: '#475569' }
  return makeBadge(s.bg, s.text, value, className)
}

export function TypeFonctionBadge({ value, className }: BadgeProps) {
  const s = TYPE_FONCTION_STYLE[value] ?? { bg: '#F1F5F9', text: '#475569' }
  return makeBadge(s.bg, s.text, value, className)
}

export function PrioBadge({ value, className }: BadgeProps) {
  const s = PRIO_STYLE[value] ?? { bg: '#F1F5F9', text: '#475569' }
  return makeBadge(s.bg, s.text, value, className)
}

export function EpicBadge({ value, className }: BadgeProps) {
  const code = value.split(' — ')[0] ?? value
  const bg   = EPIC_BG[value]     ?? '#EDE9FE'
  const text = EPIC_COLORS[value] ?? '#5B21B6'
  return makeBadge(bg, text, code, className)
}

export function JalonBadge({ value, className }: BadgeProps) {
  const color = JALON_COLORS[value] ?? '#4A4CC8'
  return (
    <span
      className={cn('inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white', className)}
      style={{ background: color }}
    >
      {value}
    </span>
  )
}

export function SprintStatutBadge({ value, className }: BadgeProps) {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    planifie: { bg: '#F1F5F9', text: '#64748B', label: 'planifié' },
    en_cours: { bg: '#FEF3C7', text: '#92600A', label: 'en cours' },
    pause:    { bg: '#FFF7ED', text: '#C2410C', label: 'en pause' },
    cloture:  { bg: '#D1FAE5', text: '#065F46', label: 'clôturé'  },
  }
  const s = styles[value] ?? styles.planifie
  return makeBadge(s.bg, s.text, s.label, className)
}
