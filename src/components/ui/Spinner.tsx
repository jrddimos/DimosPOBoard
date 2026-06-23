import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-16', className)}>
      <div className="w-8 h-8 border-4 border-purple/20 border-t-purple rounded-full animate-spin" />
    </div>
  )
}

export function EmptyState({ message = 'Aucune donnée', icon }: { message?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-subtle gap-3">
      {icon && <div className="text-4xl opacity-30">{icon}</div>}
      <p className="text-sm font-medium">{message}</p>
    </div>
  )
}
