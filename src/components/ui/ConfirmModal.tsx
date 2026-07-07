import { useState } from 'react'
import { X } from 'lucide-react'

interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  variant?: 'danger' | 'default'
}

interface ConfirmModalState extends ConfirmOptions {
  resolve: (v: boolean) => void
}

let _setModal: ((s: ConfirmModalState | null) => void) | null = null

export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    if (_setModal) _setModal({ ...options, resolve })
    else resolve(false)
  })
}

export function ConfirmProvider() {
  const [modal, setModal] = useState<ConfirmModalState | null>(null)
  _setModal = setModal

  if (!modal) return null

  function answer(v: boolean) {
    if (!modal) return
    modal.resolve(v)
    setModal(null)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={() => answer(false)}>
      <div className="bg-card rounded-2xl shadow-modal w-full max-w-sm p-6 animate-in"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-sm font-bold text-navy">{modal.title}</h3>
          <button onClick={() => answer(false)} className="text-subtle hover:text-navy p-1">
            <X size={14}/>
          </button>
        </div>
        <p className="text-xs text-subtle leading-relaxed mb-5 whitespace-pre-line">{modal.message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={() => answer(false)} className="ds-btn ds-btn-sm">Annuler</button>
          <button onClick={() => answer(true)}
            className={modal.variant === 'danger' ? 'ds-btn-danger ds-btn-sm' : 'ds-btn-primary ds-btn-sm'}>
            {modal.confirmLabel ?? 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  )
}
