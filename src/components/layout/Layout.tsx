import { useState, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { GlobalSearch } from './GlobalSearch'
import { ToastContainer } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmModal'
import { useDarkModeStore } from '@/hooks/useDarkMode'
import { Menu } from 'lucide-react'

interface LayoutProps {
  children: React.ReactNode
  title?: string
  actions?: React.ReactNode
}

export function Layout({ children, title, actions }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const dark = useDarkModeStore(s => s.dark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  return (
    <div className="flex h-screen overflow-hidden bg-page transition-colors print:h-auto print:overflow-visible print:block">
      <div className="contents print:hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible print:block">
        {/* Barre mobile */}
        <div className="md:hidden print:hidden flex items-center gap-3 px-4 py-3 bg-brand shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#1E3A5F] rounded-md flex items-center justify-center">
              <img src="/logo.svg" alt="" className="w-4 h-4" />
            </div>
            <span className="text-white font-bold text-sm">PO Board</span>
          </div>
        </div>

        {(title || actions) && (
          <header className="page-topbar shrink-0 print:hidden">
            {title && <h1 className="text-sm font-semibold text-navy">{title}</h1>}
            {actions && <div className="flex items-center gap-2 ml-auto">{actions}</div>}
          </header>
        )}

        <main className="page-content flex-1 min-h-0 overflow-y-auto print:overflow-visible print:h-auto print:min-h-0 print:block">
          {children}
        </main>
      </div>

      <ToastContainer />
      <ConfirmProvider />
      <GlobalSearch />
    </div>
  )
}
