import { useState, useRef } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useClickOutside } from '@/hooks/useClickOutside'
import type { UserProfile } from '@/contexts/AuthContext'

export function AssignPicker({ value, membres, onAssign, disabled }: {
  value: string | null; membres: UserProfile[]
  onAssign: (tri: string) => void; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)
  const actifs = membres.filter(m => m.actif && m.trigramme)

  if (disabled) return value
    ? <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">{value}</span>
    : null

  return (
    <div className="relative inline-block" ref={ref} onClick={e => e.stopPropagation()}>
      {value ? (
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setOpen(o => !o)}
            className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium hover:bg-indigo-100 transition-colors">
            {value}
          </button>
          <button type="button" onClick={() => onAssign('')}
            className="w-3.5 h-3.5 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-colors">
            <X size={8} />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
          <Plus size={10} /> Assigner
        </button>
      )}
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-slate-200 rounded-xl shadow-lg py-1 min-w-[160px]">
          {actifs.map(m => (
            <button type="button" key={m.user_id} onClick={() => { onAssign(m.trigramme!); setOpen(false) }}
              className={cn('w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50 text-navy text-left transition-colors',
                value === m.trigramme && 'font-semibold text-indigo-600')}>
              <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                {m.trigramme}
              </span>
              {m.prenom ?? ''} {m.nom ?? ''}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
