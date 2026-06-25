import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { ToastContainer } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmModal'
import { Menu } from 'lucide-react'
import { Zap } from 'lucide-react'

interface LayoutProps {
  children: React.ReactNode
  title?: string
  actions?: React.ReactNode
}

export function Layout({ children, title, actions }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen" style={{background:'#F4F5F9'}}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Barre mobile — visible uniquement sur petit écran */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-navy shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-purple rounded-md flex items-center justify-center">
              <Zap size={12} className="text-white" />
            </div>
            <span className="text-white font-bold text-sm">PO Board</span>
          </div>
        </div>

        {(title || actions) && (
          <header className="page-topbar">
            {title && <h1 className="text-sm font-semibold text-navy">{title}</h1>}
            {actions && <div className="flex items-center gap-2 ml-auto">{actions}</div>}
          </header>
        )}

        <main className="page-content">
          {children}
        </main>
      </div>

      <ToastContainer />
      <ConfirmProvider />
    </div>
  )
}
