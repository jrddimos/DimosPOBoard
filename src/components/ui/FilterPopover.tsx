import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Filter } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FilterPopoverProps {
  /** Nombre de filtres actuellement actifs (affiché dans le badge) */
  activeCount: number
  /** Remet tous les filtres à zéro ; le lien n'apparaît que si activeCount > 0 */
  onReset?: () => void
  /** Champs de filtre (labels + selects/inputs) affichés dans le panneau */
  children: React.ReactNode
  className?: string
}

// Le panneau est rendu en portal : les topbars ont overflow-x auto
// et rogneraient un dropdown positionné en absolute.
export function FilterPopover({ activeCount, onReset, children, className }: FilterPopoverProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos]   = useState<{ top: number; left: number } | null>(null)
  const btnRef   = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const width = 264
    setPos({
      top: r.bottom + 6,
      left: Math.min(r.left, window.innerWidth - width - 12),
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  return (
    <>
      <button ref={btnRef} onClick={() => setOpen(o => !o)}
        className={cn('flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all shrink-0',
          activeCount > 0 || open
            ? 'border-indigo-300 text-indigo-600 bg-indigo-50'
            : 'border-border bg-card text-subtle hover:border-navy/30 hover:text-navy',
          className)}>
        <Filter size={12} />
        Filtres
        {activeCount > 0 && (
          <span className="bg-indigo-500 text-white rounded-full px-1.5 py-0 text-[11px] font-bold leading-4">
            {activeCount}
          </span>
        )}
      </button>

      {open && pos && createPortal(
        <div ref={panelRef}
          className="fixed z-[10050] w-[264px] bg-card border border-border rounded-xl shadow-modal p-3 flex flex-col gap-2.5 animate-in"
          style={{ top: pos.top, left: pos.left }}>
          {children}
          {onReset && activeCount > 0 && (
            <button onClick={() => { onReset(); setOpen(false) }}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 text-left mt-0.5">
              Réinitialiser les filtres
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  )
}

export function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-subtle uppercase tracking-wide">{label}</span>
      {children}
    </div>
  )
}
