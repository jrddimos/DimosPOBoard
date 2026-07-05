import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search } from 'lucide-react'

export interface PickerOption { value: string; label: string }

export function SelectPicker({ value, onChange, options, placeholder = '--', searchable = false, className = '' }: {
  value: string; onChange: (v: string) => void; options: PickerOption[]
  placeholder?: string; searchable?: boolean; className?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState({ left: 0, top: 0, width: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      const target = e.target as Node
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const filtered = options.filter(o => !q || o.label.toLowerCase().includes(q.toLowerCase()))
  const selected = options.find(o => o.value === value)

  function toggleOpen() {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect()
      setPos({ left: r.left, top: r.bottom + 4, width: r.width })
    }
    setOpen(v => !v)
    setQ('')
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" onClick={toggleOpen}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border border-border rounded-lg bg-card text-navy focus:outline-none focus:ring-1 focus:ring-indigo-300/60 focus:border-indigo-400 transition-colors">
        <span className={selected ? 'text-navy' : 'text-subtle/50'}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={13} className="text-subtle shrink-0" />
      </button>
      {open && createPortal(
        <div ref={menuRef} className="fixed z-[10050] bg-card border border-border rounded-xl shadow-lg overflow-hidden"
          style={{ left: pos.left, top: pos.top, width: pos.width }}>
          {searchable && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <Search size={12} className="text-subtle shrink-0" />
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrer…"
                className="flex-1 text-xs outline-none text-navy placeholder:text-subtle/50" />
            </div>
          )}
          <div className="overflow-y-auto" style={{ maxHeight: 200 }}>
            <button type="button" onClick={() => { onChange(''); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-xs text-subtle hover:bg-bg transition-colors">
              {placeholder}
            </button>
            {filtered.map(o => (
              <button type="button" key={o.value} onClick={() => { onChange(o.value); setOpen(false) }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-indigo-50 ${o.value === value ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-navy'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
