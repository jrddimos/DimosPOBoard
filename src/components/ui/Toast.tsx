import { useEffect, useState } from 'react'
import { useToastStore } from '@/hooks/useToast'
import { CheckCircle, XCircle, Info, X, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ToastContainer() {
  const { toasts, remove } = useToastStore()
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const on  = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  return (
    <>
      {/* Bandeau hors-ligne */}
      {offline && (
        <div className="fixed top-0 left-0 right-0 z-[200] flex items-center justify-center gap-2 py-2 px-4 bg-red text-white text-xs font-semibold">
          <WifiOff size={14}/>
          Hors ligne — les modifications seront perdues
        </div>
      )}

      {/* Toasts */}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl shadow-modal text-xs font-medium',
              'min-w-[280px] max-w-sm animate-in',
              t.type === 'success' && 'bg-green  text-white',
              t.type === 'error'   && 'bg-red    text-white',
              t.type === 'info'    && 'bg-brand   text-white',
            )}
          >
            {t.type === 'success' && <CheckCircle size={15} className="shrink-0"/>}
            {t.type === 'error'   && <XCircle     size={15} className="shrink-0"/>}
            {t.type === 'info'    && <Info        size={15} className="shrink-0"/>}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => remove(t.id)} className="opacity-70 hover:opacity-100 shrink-0">
              <X size={13}/>
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
