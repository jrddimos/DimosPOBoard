import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

export function CellInput({ initVal, maxJours, onSave, onCancel, onTab }: {
  initVal:  number
  maxJours: number
  onSave:   (v: number) => void
  onCancel: () => void
  onTab?:   () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [val, setVal] = useState(initVal === 0 ? '' : String(initVal))
  useEffect(() => { ref.current?.select() }, [])

  const numVal  = parseFloat(val.replace(',', '.'))
  const tooHigh = !isNaN(numVal) && numVal > maxJours

  function commit() {
    const n = parseFloat(val.replace(',', '.'))
    if (isNaN(n) || n < 0) { onSave(0); return }
    onSave(Math.min(n, maxJours))
  }

  return (
    <div className="relative">
      <input ref={ref} type="text" inputMode="decimal" value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter')  { e.preventDefault(); commit() }
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          if (e.key === 'Tab')    { e.preventDefault(); commit(); onTab?.() }
        }}
        className={cn(
          'w-full text-center text-xs font-semibold rounded outline-none py-0.5 tabular-nums border',
          tooHigh
            ? 'bg-rose-50 border-rose-300 text-rose-700'
            : 'bg-indigo-50 border-indigo-300 text-indigo-700'
        )}
      />
      {tooHigh && (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] bg-rose-500 text-white px-1.5 py-0.5 rounded z-10">
          max {maxJours}j
        </div>
      )}
    </div>
  )
}
