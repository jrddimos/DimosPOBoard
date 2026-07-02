import type { ReactNode } from 'react'

export function PageTitle({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-navy">{icon}</span>
        <h1 className="text-sm font-semibold text-navy whitespace-nowrap">{label}</h1>
      </div>
      <div className="w-px h-4 bg-border shrink-0" />
    </>
  )
}
