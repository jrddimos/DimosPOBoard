import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { Search, Package, FileText } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProduit } from '@/contexts/ProduitContext'
import { useProduits } from '@/hooks/useProduits'
import { useAllTaches } from '@/hooks/useTaches'
import { GLOBAL_NAV, PRODUCT_NAV } from '@/components/layout/Sidebar'
import { StatutBadge } from '@/components/ui/Badge'

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { isAdmin, getRoleForProduit, canWrite } = useAuth()
  const { produitActif, setProduitActif } = useProduit()
  const { data: produits = [] } = useProduits()
  const { data: taches = [] } = useAllTaches()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(v => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    function onOpenRequest() { setOpen(true) }
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('open-global-search', onOpenRequest)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('open-global-search', onOpenRequest)
    }
  }, [])

  const accessibles = produits.filter(p => p.actif && (isAdmin || getRoleForProduit(p.id) !== null))
  const accessibleIds = new Set(accessibles.map(p => p.id))
  const produitById = new Map(accessibles.map(p => [p.id, p]))

  function goto(href: string, produitId?: number) {
    if (produitId) {
      const p = produitById.get(produitId)
      if (p) setProduitActif({ id: p.id, nom: p.nom, couleur: p.couleur })
    }
    navigate(href)
    setOpen(false)
  }

  if (!open) return null

  return createPortal((
    <div className="fixed inset-0 z-[10100] flex items-start justify-center pt-[12vh] px-4" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/40" />
      <Command
        className="relative w-full max-w-xl bg-card rounded-2xl shadow-2xl border border-border overflow-hidden"
        onClick={e => e.stopPropagation()}
        loop
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
          <Search size={15} className="text-subtle shrink-0" />
          <Command.Input autoFocus placeholder="Rechercher une tâche, un produit, une page…"
            className="flex-1 text-sm text-navy placeholder:text-subtle/50 outline-none bg-transparent" />
          <kbd className="text-[11px] font-mono text-subtle/60 bg-bg border border-border rounded px-1.5 py-0.5">Échap</kbd>
        </div>

        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="py-10 text-center text-sm text-subtle">Aucun résultat</Command.Empty>

          <Command.Group heading="Pages" className="text-[11px] font-bold text-subtle/60 uppercase tracking-wider px-2 py-1.5">
            {GLOBAL_NAV.filter(i => !i.adminOnly || isAdmin).map(item => (
              <Command.Item key={item.id} value={`page ${item.label}`} onSelect={() => goto(item.href)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-navy cursor-pointer data-[selected=true]:bg-indigo-50 data-[selected=true]:text-indigo-700">
                <span className="text-subtle">{item.icon}</span>{item.label}
              </Command.Item>
            ))}
            {PRODUCT_NAV.filter(i => !i.writeOnly || isAdmin || (produitActif && canWrite(produitActif.id))).map(item => (
              <Command.Item key={item.id} value={`page ${item.label}`} onSelect={() => goto(item.href)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-navy cursor-pointer data-[selected=true]:bg-indigo-50 data-[selected=true]:text-indigo-700">
                <span className="text-subtle">{item.icon}</span>{item.label}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="Produits" className="text-[11px] font-bold text-subtle/60 uppercase tracking-wider px-2 py-1.5 mt-1">
            {accessibles.map(p => (
              <Command.Item key={p.id} value={`produit ${p.nom}`} onSelect={() => goto('/produit-dashboard', p.id)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-navy cursor-pointer data-[selected=true]:bg-indigo-50 data-[selected=true]:text-indigo-700">
                <Package size={14} className="text-subtle shrink-0" />
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />
                {p.nom}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="Tâches" className="text-[11px] font-bold text-subtle/60 uppercase tracking-wider px-2 py-1.5 mt-1">
            {taches.filter(t => t.produit_id && accessibleIds.has(t.produit_id)).slice(0, 300).map(t => (
              <Command.Item key={t.id_tache} value={`tache ${t.id_tache} ${t.titre}`} onSelect={() => goto('/taches', t.produit_id ?? undefined)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-navy cursor-pointer data-[selected=true]:bg-indigo-50 data-[selected=true]:text-indigo-700">
                <FileText size={14} className="text-subtle shrink-0" />
                <span className="font-mono text-xs font-semibold text-indigo-600 shrink-0">{t.id_tache}</span>
                <span className="flex-1 truncate">{t.titre}</span>
                <StatutBadge value={t.statut} />
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  ), document.body)
}
