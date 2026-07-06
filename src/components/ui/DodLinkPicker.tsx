import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Search, Plus, X } from 'lucide-react'
import type { DodItem } from '@/hooks/useDod'
import { codeMajor } from '@/lib/utils'

function parseCodes(v: string): string[] {
  return v.split(/[,;]/).map(s => s.trim()).filter(Boolean)
}

export function DodLinkPicker({ value, onChange, items }: {
  value: string
  onChange: (v: string) => void
  items: DodItem[]
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ]       = useState('')
  const [pos, setPos]   = useState({ left: 0, top: 0, width: 0 })
  const ref     = useRef<HTMLDivElement>(null)
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

  const codes      = parseCodes(value)
  const selected   = codes.map(c => ({ code: c, item: items.find(i => i.code === c) }))
  const available  = items.filter(i => !codes.includes(i.code))
  const filtered   = available.filter(i =>
    !q || i.code.toLowerCase().includes(q.toLowerCase()) || i.titre.toLowerCase().includes(q.toLowerCase()))

  function toggleOpen() {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect()
      setPos({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 260) })
    }
    setOpen(v => !v)
    setQ('')
  }

  function add(code: string) {
    onChange([...codes, code].join(', '))
  }

  function remove(code: string) {
    onChange(codes.filter(c => c !== code).join(', '))
  }

  return (
    <div ref={ref} className="relative">
      <div className="ds-input min-h-[38px] flex flex-wrap items-center gap-1 py-1.5 cursor-text" onClick={toggleOpen}>
        {selected.map(({ code, item }) => (
          <span key={code} title={item?.titre ?? code}
            className="inline-flex items-center gap-1 text-xs pl-2 pr-1 py-0.5 rounded-full bg-brand/10 text-brand font-mono font-medium">
            {code}
            <button type="button" onClick={e => { e.stopPropagation(); remove(code) }}
              className="hover:bg-brand/20 rounded-full p-0.5 transition-colors">
              <X size={10} />
            </button>
          </span>
        ))}
        <button type="button"
          className="inline-flex items-center gap-1 text-xs text-subtle hover:text-navy px-1.5 py-0.5 transition-colors pointer-events-none">
          <Plus size={12} /> {selected.length === 0 ? 'Lier un critère DoD' : 'Ajouter'}
        </button>
      </div>

      {open && createPortal(
        <div ref={menuRef} className="fixed z-[10050] bg-card border border-border rounded-xl shadow-lg overflow-hidden"
          style={{ left: pos.left, top: pos.top, width: pos.width }}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search size={12} className="text-subtle shrink-0" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un critère…"
              className="flex-1 text-xs outline-none text-navy placeholder:text-subtle/50 bg-transparent" />
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
            {items.length === 0 ? (
              <p className="px-3 py-3 text-xs text-subtle italic">
                Aucun critère DoD défini pour ce produit — créez-les dans DoD → Référentiel.
              </p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-subtle italic">
                {available.length === 0 ? 'Tous les critères sont déjà liés.' : 'Aucun résultat.'}
              </p>
            ) : filtered.map((i, idx) => {
              const major = codeMajor(i.code)
              const showMajorHeader = major !== i.code && major !== codeMajor(filtered[idx - 1]?.code ?? '')
              return (
                <div key={i.id}>
                  {showMajorHeader && (
                    <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-subtle uppercase tracking-wide select-none">
                      {i.categorie ? `${major} — ${i.categorie}` : major}
                    </div>
                  )}
                  <button type="button" onClick={() => add(i.code)}
                    className="w-full text-left px-3 py-2 text-xs transition-colors hover:bg-brand/5 flex items-start gap-2">
                    <span className="font-mono font-bold text-brand shrink-0">{i.code}</span>
                    <span className="text-navy truncate">{i.titre}</span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
