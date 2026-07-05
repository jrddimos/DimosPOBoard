import { cn } from '@/lib/utils'
import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full px-3 py-2 text-sm border border-border rounded-lg bg-card text-navy placeholder:text-subtle/60',
        'focus:outline-none focus:ring-2 focus:ring-purple/30 focus:border-purple transition-colors',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'w-full px-3 py-2 text-sm border border-border rounded-lg bg-card text-navy',
        'focus:outline-none focus:ring-2 focus:ring-purple/30 focus:border-purple transition-colors',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
)
Select.displayName = 'Select'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full px-3 py-2 text-sm border border-border rounded-lg bg-card text-navy placeholder:text-subtle/60',
        'focus:outline-none focus:ring-2 focus:ring-purple/30 focus:border-purple transition-colors resize-vertical',
        className
      )}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'

export function FormGroup({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-navy uppercase tracking-wide">
        {label}{required && <span className="text-red ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
