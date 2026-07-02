import { useState, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STATUT_PICKER_CONFIG } from '@/constants'
import { useClickOutside } from '@/hooks/useClickOutside'
import type { Statut } from '@/types'

export function StatusPicker({ value, onChange, disabled }: {
  value: Statut; onChange: (s: Statut) => void; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const cfg = STATUT_PICKER_CONFIG[value] ?? STATUT_PICKER_CONFIG['À faire']
  useClickOutside(ref, () => setOpen(false), open)

  if (disabled) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-semibold', cfg.bg, cfg.text, cfg.border)}>
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cfg.dot)} />
        {value}
      </span>
    )
  }

  return (
    <div className="relative" ref={ref} onClick={e => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all hover:brightness-95',
          cfg.bg, cfg.text, cfg.border
        )}>
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cfg.dot)} />
        {value}
        <ChevronDown size={11} className={cn('ml-auto transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[140px] overflow-hidden">
          {(Object.entries(STATUT_PICKER_CONFIG) as [Statut, typeof cfg][]).map(([statut, c]) => (
            <button key={statut} type="button"
              onClick={() => { onChange(statut); setOpen(false) }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold transition-colors text-left',
                value === statut ? cn(c.bg, c.text) : 'text-slate-600 hover:bg-slate-50'
              )}>
              <span className={cn('w-2 h-2 rounded-full shrink-0', c.dot)} />
              {statut}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
