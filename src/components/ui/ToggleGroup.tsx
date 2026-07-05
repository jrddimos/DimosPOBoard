import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface ToggleOption<T extends string> {
  key: T
  label: string
  icon?: ReactNode
}

export function ToggleGroup<T extends string>({ options, value, onChange, activeClassName, className }: {
  options: ToggleOption<T>[]
  value: T
  onChange: (key: T) => void
  activeClassName?: string
  className?: string
}) {
  return (
    <div className={cn('flex gap-0.5 bg-bg border border-border rounded-lg p-0.5', className)}>
      {options.map(opt => (
        <button key={opt.key} type="button" onClick={() => onChange(opt.key)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all',
            value === opt.key ? (activeClassName ?? 'bg-card shadow-sm text-navy') : 'text-subtle hover:text-navy'
          )}>
          {opt.icon}{opt.label}
        </button>
      ))}
    </div>
  )
}
