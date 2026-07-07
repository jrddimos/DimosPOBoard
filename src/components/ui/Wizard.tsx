import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface WizardStep {
  key:          string
  label:        string
  content:      React.ReactNode
  // Appelé au clic sur "Suivant"/"Terminer" — retourne false pour bloquer
  // l'avancée (validation, ou persistance de l'étape avant de continuer).
  onNext?:      () => Promise<boolean> | boolean
  nextDisabled?: boolean
  nextLabel?:   string
}

// Wizard modal générique (étapes + barre de progression + navigation) —
// première introduction de ce pattern dans l'app, pensé pour être réutilisé
// par de futurs assistants multi-étapes.
export function Wizard({ title, steps, onClose, onFinish, initialStep = 0 }: {
  title: string
  steps: WizardStep[]
  onClose: () => void
  onFinish?: () => void
  initialStep?: number
}) {
  const [stepIndex, setStepIndex] = useState(initialStep)
  const [busy, setBusy] = useState(false)
  const step    = steps[stepIndex]
  const isFirst = stepIndex === 0
  const isLast  = stepIndex === steps.length - 1

  async function handleNext() {
    if (step.onNext) {
      setBusy(true)
      try {
        const ok = await step.onNext()
        if (!ok) return
      } finally {
        setBusy(false)
      }
    }
    if (isLast) { onFinish?.(); return }
    setStepIndex(i => i + 1)
  }

  return createPortal((
    <div className="fixed inset-0 z-[10060] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-bold text-navy">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg text-subtle hover:text-navy transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Barre d'étapes */}
        <div className="flex items-center px-6 py-3 border-b border-border shrink-0 overflow-x-auto">
          {steps.map((s, i) => (
            <div key={s.key} className={cn('flex items-center', i < steps.length - 1 && 'flex-1')}>
              <button onClick={() => i < stepIndex && setStepIndex(i)} disabled={i >= stepIndex}
                title={s.label}
                className={cn('flex items-center gap-1.5 shrink-0', i < stepIndex && 'cursor-pointer')}>
                <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-colors',
                  i < stepIndex ? 'bg-brand text-white' : i === stepIndex ? 'bg-brand/15 text-brand ring-2 ring-brand' : 'bg-bg text-subtle')}>
                  {i < stepIndex ? <Check size={12} /> : i + 1}
                </span>
                <span className={cn('text-[11px] font-semibold whitespace-nowrap hidden sm:inline', i === stepIndex ? 'text-navy' : 'text-subtle')}>
                  {s.label}
                </span>
              </button>
              {i < steps.length - 1 && <span className="flex-1 h-px bg-border mx-2 min-w-[8px]" />}
            </div>
          ))}
        </div>

        {/* Contenu de l'étape */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step.content}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0 bg-bg/50">
          <button onClick={() => setStepIndex(i => i - 1)} disabled={isFirst || busy}
            className={cn('ds-btn ds-btn-sm flex items-center gap-1', isFirst && 'invisible')}>
            <ChevronLeft size={13} /> Précédent
          </button>
          <button onClick={handleNext} disabled={busy || step.nextDisabled}
            className="ds-btn-primary ds-btn-sm flex items-center gap-1.5 disabled:opacity-40">
            {isLast ? (
              <>{busy ? 'Finalisation…' : (step.nextLabel ?? 'Terminer')} <Check size={13} /></>
            ) : (
              <>{busy ? 'Enregistrement…' : (step.nextLabel ?? 'Suivant')} <ChevronRight size={13} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  ), document.body)
}
