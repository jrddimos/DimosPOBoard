import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useSprintActif } from '@/hooks/useSprints'
import { useAuth } from '@/contexts/AuthContext'
import { useProduit } from '@/contexts/ProduitContext'
import { useProduits } from '@/hooks/useProduits'
import {
  LayoutDashboard, List, Kanban, FilePlus, Settings,
  ChevronDown, LogOut, Zap, ClipboardCheck, User, Clock, X,
  Users, Package, Briefcase,
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

// ── Types ─────────────────────────────────────────────────────
interface NavChild { label: string; href: string }
interface NavItem  { id: string; label: string; href: string; icon: React.ReactNode; adminOnly?: boolean; children?: NavChild[] }

// ── Navigation globale (toujours visible) ─────────────────────
const GLOBAL_NAV: NavItem[] = [
  { id:'dashboard', label:'Dashboard',    href:'/',                  icon:<LayoutDashboard size={17}/> },
  { id:'produits',  label:'Produits',     href:'/produits',          icon:<Package size={17}/> },
  { id:'equipes',   label:'Équipes',      href:'/setup?tab=equipes', icon:<Users size={17}/> },
  { id:'metiers',   label:'Thèmes',       href:'/setup?tab=metiers', icon:<Briefcase size={17}/> },
  { id:'users',     label:'Utilisateurs', href:'/admin/users',       icon:<User size={17}/>, adminOnly: true },
]

// ── Navigation produit (visible seulement si produit actif) ───
const PRODUCT_NAV: NavItem[] = [
  { id:'sprint',     label:'Sprint Board', href:'/sprint',     icon:<Kanban size={17}/>,
    children:[
      { label:'Sprint en cours',  href:'/sprint'         },
      { label:'Tous les sprints', href:'/sprint?tab=all' },
    ]
  },
  { id:'taches', label:'Tâches', href:'/taches', icon:<FilePlus size={17}/>,
    children:[
      { label:'Ajouter',   href:'/taches'          },
      { label:'Modifier',  href:'/taches?tab=edit' },
      { label:'Dupliquer', href:'/taches?tab=dup'  },
      { label:'Supprimer', href:'/taches?tab=del'  },
    ]
  },
  { id:'backlog',  label:'Backlog',   href:'/backlog',   icon:<List size={17}/> },
  { id:'dod',      label:'DoD',       href:'/dod',       icon:<ClipboardCheck size={17}/> },
  { id:'activite', label:'Activité',  href:'/activite',  icon:<Clock size={17}/> },
  { id:'setup',    label:'Setup',     href:'/setup',     icon:<Settings size={17}/>,
    children:[
      { label:'Sprints', href:'/setup?tab=sprints' },
      { label:'Epics',   href:'/setup?tab=epics'   },
      { label:'Jalons',  href:'/setup?tab=jalons'  },
      { label:'Export',  href:'/setup?tab=export'  },
    ]
  },
]

function matchesHref(href: string, pathname: string, search: string): boolean {
  const [p, q] = href.split('?')
  if (q) return pathname === p && search === '?' + q
  return pathname === p && (!search || search === '')
}

function getActiveId(items: NavItem[], pathname: string, search: string): string | null {
  for (const item of items) {
    if (item.children) {
      if (item.children.some(c => matchesHref(c.href, pathname, search))) return item.id
      if (pathname.startsWith(item.href) && item.href !== '/') return item.id
    } else {
      if (matchesHref(item.href, pathname, search)) return item.id
      if (item.href !== '/' && pathname.startsWith(item.href)) return item.id
    }
  }
  return null
}

// ── Dropdown sélecteur produit ────────────────────────────────
function ProductDropdown({ onClose }: { onClose: () => void }) {
  const { data: produits = [] }           = useProduits()
  const { isAdmin, getRoleForProduit }    = useAuth()
  const { produitActif, setProduitActif } = useProduit()
  const [open, setOpen]                   = useState(false)
  const ref                               = useRef<HTMLDivElement>(null)

  const accessibles = produits.filter(p =>
    p.actif && (isAdmin || getRoleForProduit(p.id) !== null)
  )

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function select(p: typeof produits[0]) {
    setProduitActif({ id: p.id, nom: p.nom, couleur: p.couleur })
    setOpen(false)
    onClose()
  }

  function deselect() {
    setProduitActif(null)
    setOpen(false)
    onClose()
  }

  return (
    <div ref={ref} className="relative mx-3 mt-3">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors text-left',
          produitActif ? 'bg-white/10 hover:bg-white/15' : 'bg-white/5 hover:bg-white/10 border border-dashed border-white/20'
        )}
      >
        {produitActif ? (
          <>
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: produitActif.couleur ?? '#4A4CC8' }} />
            <span className="flex-1 text-white text-xs font-semibold truncate">{produitActif.nom}</span>
          </>
        ) : (
          <>
            <Package size={13} className="text-white/40 shrink-0" />
            <span className="flex-1 text-white/40 text-xs italic">Aucun produit actif</span>
          </>
        )}
        <ChevronDown size={12} className={cn('text-white/40 transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-[#1a2340] border border-white/10 rounded-xl shadow-xl overflow-hidden">
          {produitActif && (
            <>
              <button onClick={deselect}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-white/50 hover:text-white hover:bg-white/10 transition-colors">
                <LayoutDashboard size={12} />
                Désélectionner le produit
              </button>
              <div className="border-t border-white/10" />
            </>
          )}
          {accessibles.length === 0 ? (
            <div className="px-3 py-3 text-xs text-white/30 text-center">Aucun produit disponible</div>
          ) : (
            accessibles.map(p => (
              <button key={p.id} onClick={() => select(p)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-colors',
                  produitActif?.id === p.id
                    ? 'bg-white/15 text-white font-semibold'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                )}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />
                <span className="flex-1 truncate">{p.nom}</span>
                {p.is_template && <span className="text-amber-400 text-[10px]">★</span>}
                {produitActif?.id === p.id && <span className="text-purple text-xs">✓</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Composant NavItems réutilisable ───────────────────────────
function NavItems({ items, expanded, onToggle }: {
  items: NavItem[]
  expanded: string | null
  onToggle: (id: string, href: string) => void
}) {
  const location  = useLocation()
  const allItems  = [...GLOBAL_NAV, ...PRODUCT_NAV]
  const activeId  = getActiveId(allItems, location.pathname, location.search)

  return (
    <>
      {items.map(item => {
        const isOpen   = expanded === item.id
        const isActive = activeId === item.id

        if (!item.children) {
          return (
            <NavLink key={item.id} to={item.href}
              className={() => cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                activeId === item.id ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
              )}>
              <span className="shrink-0">{item.icon}</span>{item.label}
            </NavLink>
          )
        }

        return (
          <div key={item.id}>
            <button onClick={() => onToggle(item.id, item.href)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left',
                isActive ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
              )}>
              <span className="shrink-0">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              <ChevronDown size={14} className={cn('transition-transform duration-200', isOpen && 'rotate-180')} />
            </button>
            {isOpen && (
              <div className="ml-6 mt-0.5 flex flex-col gap-0.5 border-l border-white/10 pl-3">
                {item.children.map(child => {
                  const active = matchesHref(child.href, location.pathname, location.search)
                  return (
                    <NavLink key={child.href} to={child.href}
                      className={cn(
                        'text-xs py-1.5 px-2 rounded-md transition-colors',
                        active ? 'text-white font-semibold bg-white/15' : 'text-white/50 hover:text-white hover:bg-white/5'
                      )}>
                      {child.label}
                    </NavLink>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

// ── Sidebar principal ─────────────────────────────────────────
interface SidebarProps { open: boolean; onClose: () => void }

export function Sidebar({ open, onClose }: SidebarProps) {
  const { data: sprintActif }      = useSprintActif()
  const { user, profile, isAdmin } = useAuth()
  const { produitActif }           = useProduit()
  const location                   = useLocation()
  const navigate                   = useNavigate()

  const allItems = [...GLOBAL_NAV, ...PRODUCT_NAV]
  const activeId = getActiveId(allItems, location.pathname, location.search)
  const [expanded,    setExpanded]    = useState<string | null>(activeId)
  const [openGlobal,  setOpenGlobal]  = useState(true)
  const [openProduit, setOpenProduit] = useState(true)

  useEffect(() => {
    const id = getActiveId(allItems, location.pathname, location.search)
    if (id) setExpanded(id)
  }, [location.pathname, location.search])

  useEffect(() => { onClose() }, [location.pathname, location.search])

  function toggle(id: string, href: string) {
    if (expanded === id) setExpanded(null)
    else { setExpanded(id); navigate(href) }
  }

  const globalItems = GLOBAL_NAV.filter(i => !i.adminOnly || isAdmin)

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onClose} />}

      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-56 bg-navy flex flex-col shrink-0',
        'transition-transform duration-300 ease-in-out',
        'md:relative md:inset-auto md:z-auto md:translate-x-0 md:transition-none',
        open ? 'translate-x-0' : '-translate-x-full'
      )}>

        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-purple rounded-lg flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <div>
              <div className="text-white font-bold text-sm leading-tight">Dimos D3X+</div>
              <div className="text-white/40 text-xs">PO Board</div>
            </div>
          </div>
          <button onClick={onClose} className="md:hidden p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Sélecteur produit */}
        <ProductDropdown onClose={onClose} />

        {/* Nav scrollable */}
        <nav className="flex-1 px-3 pt-3 pb-4 flex flex-col gap-0.5 overflow-y-auto">

          {/* Mon Travail — toujours en haut, hors sections */}
          <NavLink to="/montravail" end
            className={({ isActive }) => cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-2',
              isActive ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
            )}>
            <span className="shrink-0"><User size={17} /></span>Mon Travail
          </NavLink>

          {/* Section globale */}
          <button onClick={() => setOpenGlobal(v => !v)}
            className="mb-1 w-full flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors group">
            <div className="flex-1 h-px bg-white/15" />
            <span className="text-white/70 text-[10px] uppercase tracking-widest font-bold shrink-0 group-hover:text-white/90 transition-colors">
              Global
            </span>
            <div className="flex-1 h-px bg-white/15" />
            <ChevronDown size={11} className={cn('text-white/50 transition-transform duration-200 shrink-0', !openGlobal && '-rotate-90')} />
          </button>
          {openGlobal && <NavItems items={globalItems} expanded={expanded} onToggle={toggle} />}

          {/* Section produit (si un produit est actif) */}
          {produitActif && (
            <>
              <button onClick={() => setOpenProduit(v => !v)}
                className="mt-4 mb-1 w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors group">
                <span className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white/20"
                  style={{ background: produitActif.couleur ?? '#4A4CC8' }} />
                <span className="flex-1 text-left text-white font-bold text-xs truncate group-hover:text-white transition-colors">
                  {produitActif.nom}
                </span>
                <ChevronDown size={11} className={cn('text-white/50 transition-transform duration-200 shrink-0', !openProduit && '-rotate-90')} />
              </button>
              {openProduit && (
                <>
                  {sprintActif && (
                    <div className="mx-1 mb-1.5 px-3 py-1.5 bg-white/10 rounded-lg flex items-center gap-2">
                      <span className="text-white/50 text-xs">Sprint actif</span>
                      <span className="text-white font-bold text-xs">{sprintActif.numero}</span>
                    </div>
                  )}
                  <NavItems items={PRODUCT_NAV} expanded={expanded} onToggle={toggle} />
                </>
              )}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-white/10 shrink-0">
          <div className="px-3 py-1.5 mb-1 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-white/80 text-xs font-semibold truncate">{profile?.display_name ?? user?.email}</div>
              {isAdmin && <div className="text-purple/70 text-xs">Admin</div>}
            </div>
          </div>
          <button onClick={async () => {
            const { supabase } = await import('@/lib/supabase')
            await supabase.auth.signOut()
          }} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 text-xs transition-colors">
            <LogOut size={13} /> Se déconnecter
          </button>
        </div>
      </aside>
    </>
  )
}
