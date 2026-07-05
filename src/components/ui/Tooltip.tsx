import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Tooltip({ children, content, className }: {
  children: ReactNode
  content: ReactNode
  className?: string
}) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos]         = useState({ x: 0, y: 0 })
  const ref = useRef<HTMLDivElement>(null)

  if (!content) return <>{children}</>

  function handleMouseEnter() {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({ x: r.left + r.width / 2, y: r.top + window.scrollY })
    setVisible(true)
  }

  return (
    <div ref={ref} className={cn('relative', className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && createPortal(
        <div className="fixed z-[9999] pointer-events-none"
          style={{ left: pos.x, top: pos.y - 8, transform: 'translate(-50%, -100%)' }}>
          <div className="bg-brand text-white text-[11px] rounded-xl px-3 py-2 shadow-2xl
                          whitespace-pre-line min-w-[140px] max-w-[220px] leading-relaxed text-center">
            {content}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2
                          border-[5px] border-transparent border-t-navy" />
        </div>,
        document.body
      )}
    </div>
  )
}
