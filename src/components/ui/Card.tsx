import { cn } from '@/lib/utils'
import type { HTMLAttributes } from 'react'

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('bg-card rounded-xl shadow-card p-5 border border-border/40', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-sm font-bold text-navy uppercase tracking-wide mb-3', className)} {...props}>
      {children}
    </h3>
  )
}

export function KpiCard({
  label, value, sub, color = 'text-purple',
}: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs text-subtle font-medium">{label}</span>
      <span className={cn('text-3xl font-bold', color)}>{value}</span>
      {sub && <span className="text-xs text-subtle">{sub}</span>}
    </Card>
  )
}
