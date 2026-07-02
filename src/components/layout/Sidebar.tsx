import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useSprintActif } from '@/hooks/useSprints'
import { useAuth } from '@/contexts/AuthContext'
import { useProduit } from '@/contexts/ProduitContext'
import { useProduits, useUpdateProduit } from '@/hooks/useProduits'
import type { ActionLop } from '@/hooks/useProduits'
import { useUploadAvatar, useUpdateProfile } from '@/hooks/useUserManagement'
import { useQuickNotes, useCreateQuickNote, useToggleQuickNote, useDeleteQuickNote, useMigrateLegacyQuickNotes } from '@/hooks/useQuickNotes'
import { BRAND_COLORS } from '@/constants'
import {
  LayoutDashboard, List, Kanban, FilePlus, Settings,
  ChevronDown, LogOut, ClipboardCheck, User, Clock, X,
  Users, Package, Briefcase, CalendarClock, BarChart3, Euro, Camera, TrendingUp,
  StickyNote, Plus, Check, ArrowRight, ChevronRight, ChevronLeft, Sun, Moon, Layers,
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// ── Thèmes ────────────────────────────────────────────────────
type ThemeKey = 'nuit' | 'ardoise' | 'clair'

interface SidebarTheme {
  id:              ThemeKey
  label:           string
  previewBg:       string
  previewText:     string
  aside:           string
  divider:         string
  logoText:        string
  navInactive:     string
  navActive:       string
  navIconInactive: string
  navIconActive:   string
  navDot:          string
  navHoverBg:      string
  sectionLabel:    string
  selectorBtn:     string
  selectorDropBg:  string
  selectorItemCls: string
  selectorItemActiveCls: string
  sprintChip:      string
  sprintText:      string
  sprintBadge:     string
  footerBorder:    string
  profileText:     string
  profileSub:      string
  notesBtn:        string
  logoutBtn:       string
  editPanelBg:     string
  editPanelBorder: string
}

const THEMES: Record<ThemeKey, SidebarTheme> = {
  nuit: {
    id: 'nuit', label: 'Nuit', previewBg: '#0f1829', previewText: '#fff',
    aside:           'bg-navy',
    divider:         'border-white/8',
    logoText:        'text-white',
    navInactive:     'text-white/75 hover:text-white',
    navActive:       'bg-indigo-500/20 border border-indigo-500/30 text-white font-semibold',
    navIconInactive: 'text-slate-400',
    navIconActive:   'text-indigo-300',
    navDot:          'bg-indigo-400',
    navHoverBg:      'hover:bg-white/8',
    sectionLabel:    'text-slate-400',
    selectorBtn:     'text-white/80 hover:bg-white/8',
    selectorDropBg:  'bg-[#1a2340] border-white/10',
    selectorItemCls: 'text-white/65 hover:text-white hover:bg-white/8',
    selectorItemActiveCls: 'text-white font-semibold bg-white/12',
    sprintChip:      'bg-white/6',
    sprintText:      'text-slate-300',
    sprintBadge:     'text-emerald-400',
    footerBorder:    'border-white/8',
    profileText:     'text-white/75',
    profileSub:      'text-indigo-400',
    notesBtn:        'text-slate-300 hover:text-white hover:bg-white/8',
    logoutBtn:       'text-slate-400 hover:text-rose-400 hover:bg-white/6',
    editPanelBg:     'bg-[#111c35]',
    editPanelBorder: 'border-white/10',
  },
  ardoise: {
    id: 'ardoise', label: 'Ardoise', previewBg: '#1e293b', previewText: '#cbd5e1',
    aside:           'bg-slate-900',
    divider:         'border-slate-700/50',
    logoText:        'text-white',
    navInactive:     'text-slate-300 hover:text-white',
    navActive:       'bg-indigo-500/20 border border-indigo-500/30 text-white font-semibold',
    navIconInactive: 'text-slate-400',
    navIconActive:   'text-indigo-300',
    navDot:          'bg-indigo-400',
    navHoverBg:      'hover:bg-slate-800',
    sectionLabel:    'text-slate-400',
    selectorBtn:     'text-slate-200 hover:bg-slate-800',
    selectorDropBg:  'bg-slate-800 border-slate-700',
    selectorItemCls: 'text-slate-300 hover:text-white hover:bg-slate-700',
    selectorItemActiveCls: 'text-white font-semibold bg-slate-700',
    sprintChip:      'bg-slate-800',
    sprintText:      'text-slate-300',
    sprintBadge:     'text-emerald-400',
    footerBorder:    'border-slate-700/50',
    profileText:     'text-slate-200',
    profileSub:      'text-indigo-400',
    notesBtn:        'text-slate-300 hover:text-white hover:bg-slate-800',
    logoutBtn:       'text-slate-400 hover:text-rose-400 hover:bg-slate-800',
    editPanelBg:     'bg-slate-800',
    editPanelBorder: 'border-slate-700',
  },
  clair: {
    id: 'clair', label: 'Clair', previewBg: '#f8fafc', previewText: '#1e293b',
    aside:           'bg-white border-r border-slate-200',
    divider:         'border-slate-200',
    logoText:        'text-slate-900',
    navInactive:     'text-slate-600 hover:text-slate-900',
    navActive:       'bg-indigo-50 border border-indigo-100 text-indigo-700 font-semibold',
    navIconInactive: 'text-slate-400',
    navIconActive:   'text-indigo-600',
    navDot:          'bg-indigo-500',
    navHoverBg:      'hover:bg-slate-100',
    sectionLabel:    'text-slate-400',
    selectorBtn:     'text-slate-700 hover:bg-slate-100',
    selectorDropBg:  'bg-white border-slate-200 shadow-lg',
    selectorItemCls: 'text-slate-500 hover:text-slate-900 hover:bg-slate-50',
    selectorItemActiveCls: 'text-slate-900 font-semibold bg-slate-100',
    sprintChip:      'bg-slate-100 border border-slate-200',
    sprintText:      'text-slate-500',
    sprintBadge:     'text-emerald-600',
    footerBorder:    'border-slate-200',
    profileText:     'text-slate-700',
    profileSub:      'text-indigo-500',
    notesBtn:        'text-slate-500 hover:text-slate-800 hover:bg-slate-100',
    logoutBtn:       'text-slate-400 hover:text-rose-500 hover:bg-rose-50',
    editPanelBg:     'bg-white',
    editPanelBorder: 'border-slate-200',
  },
}

const THEME_ICONS: Record<ThemeKey, React.ReactNode> = {
  nuit:    <Moon size={11} />,
  ardoise: <Layers size={11} />,
  clair:   <Sun size={11} />,
}

function getTheme(): ThemeKey {
  const stored = localStorage.getItem('sidebar-theme')
  if (stored === 'ardoise' || stored === 'clair') return stored
  return 'nuit'
}

// ── Quick Notes Panel ─────────────────────────────────────────
function QuickNotesPanel({ userId, userName, onClose, leftOffset }: {
  userId: string; userName: string; onClose: () => void; leftOffset: string
}) {
  const { data: produits = [] } = useProduits()
  const updateProduit           = useUpdateProduit()
  const { isAdmin, getRoleForProduit } = useAuth()
  const inputRef                = useRef<HTMLInputElement>(null)

  const { data: notes = [] } = useQuickNotes(userId)
  const createNote = useCreateQuickNote()
  const toggleNote  = useToggleQuickNote()
  const deleteNote  = useDeleteQuickNote()

  const [input, setInput]       = useState('')
  const [sendingId, setSendingId] = useState<string | null>(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80) }, [])

  function add() {
    const text = input.trim(); if (!text) return
    createNote.mutate({ user_id: userId, text })
    setInput('')
    inputRef.current?.focus()
  }
  function toggle(id: string, done: boolean) { toggleNote.mutate({ id, user_id: userId, done: !done }) }
  function remove(id: string) { deleteNote.mutate({ id, user_id: userId }) }

  async function sendToLop(note: { id: string; text: string }, produitId: number) {
    const produit = produits.find(p => p.id === produitId)
    if (!produit) return
    const action: ActionLop = {
      id: Date.now().toString(), titre: note.text,
      created_at: new Date().toISOString(),
      date_cloture_estimee: null, report_1: null, report_2: null,
      assigne_id: userId, assigne_nom: userName,
      cloture: false, cloture_at: null,
    }
    await updateProduit.mutateAsync({ id: produitId, updates: { actions_lop: [...(produit.actions_lop ?? []), action] } })
    setSendingId(null)
    remove(note.id)
  }

  const openNotes = notes.filter(n => !n.done)
  const doneNotes = notes.filter(n => n.done)
  const produitsActifs = produits.filter(p => p.actif && (isAdmin || getRoleForProduit(p.id) !== null))

  return createPortal((
    <>
      <div className="fixed inset-0 z-[10049]" onClick={onClose} />
      <div className="fixed bottom-4 z-[10050] w-[360px] max-h-[70vh] bg-white shadow-2xl flex flex-col rounded-2xl border border-border overflow-hidden"
        style={{ left: leftOffset }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <StickyNote size={15} className="text-indigo-400" />
            <div>
              <h2 className="text-sm font-bold text-navy">Points à traiter</h2>
              <p className="text-[10px] text-subtle">{openNotes.length} en attente · {doneNotes.length} traité{doneNotes.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg text-subtle hover:text-navy transition-colors"><X size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {openNotes.length === 0 && doneNotes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-subtle/30">
              <StickyNote size={36} className="mb-3" />
              <p className="text-xs italic">Aucun point à traiter</p>
            </div>
          )}
          <div className="divide-y divide-border/30">
            {openNotes.map(note => (
              <div key={note.id} className="px-4 py-3 group/row hover:bg-bg/40 transition-colors">
                <div className="flex items-start gap-2.5">
                  <button onClick={() => toggle(note.id, note.done)} className="mt-0.5 w-4 h-4 rounded border border-border hover:border-emerald-400/50 hover:bg-emerald-50/50 shrink-0 transition-colors" />
                  <p className="flex-1 text-sm text-navy/85 leading-snug">{note.text}</p>
                  <button onClick={() => remove(note.id)} className="opacity-0 group-hover/row:opacity-100 p-1 rounded hover:bg-rose-50 text-subtle hover:text-rose-600 transition-all shrink-0 mt-0.5"><X size={12} /></button>
                </div>
                {sendingId === note.id ? (
                  <div className="mt-2 ml-6 flex flex-wrap gap-1.5">
                    <span className="text-[10px] text-subtle/60 w-full mb-0.5">Choisir le produit :</span>
                    {produitsActifs.map(p => (
                      <button key={p.id} onClick={() => sendToLop(note, p.id)} disabled={updateProduit.isPending}
                        className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full text-white hover:opacity-80 transition-opacity disabled:opacity-50"
                        style={{ background: p.couleur ?? '#4A4CC8' }}>{p.nom}</button>
                    ))}
                    <button onClick={() => setSendingId(null)} className="text-[11px] px-2.5 py-1 rounded-full border border-border text-subtle hover:text-rose-600 transition-colors">Annuler</button>
                  </div>
                ) : (
                  <button onClick={() => setSendingId(note.id)} className="mt-1.5 ml-6 flex items-center gap-1 text-[10px] text-subtle/40 hover:text-indigo-600 opacity-0 group-hover/row:opacity-100 transition-all">
                    <ArrowRight size={10} /> Envoyer vers LOP produit
                  </button>
                )}
              </div>
            ))}
          </div>
          {doneNotes.length > 0 && (
            <details className="group/done border-t border-border/40">
              <summary className="flex items-center gap-2 px-4 py-2 text-[10px] text-subtle/50 uppercase tracking-wider font-semibold cursor-pointer hover:text-subtle list-none select-none">
                <ChevronDown size={11} className="transition-transform group-open/done:rotate-0 -rotate-90" /> Traités ({doneNotes.length})
              </summary>
              <div className="divide-y divide-border/20">
                {doneNotes.map(note => (
                  <div key={note.id} className="flex items-start gap-2.5 px-4 py-2.5 group/d hover:bg-bg/30">
                    <button onClick={() => toggle(note.id, note.done)} className="mt-0.5 w-4 h-4 rounded border border-emerald-300 bg-emerald-50 shrink-0 flex items-center justify-center"><Check size={9} className="text-emerald-600" /></button>
                    <span className="flex-1 text-xs text-subtle/40 line-through leading-snug">{note.text}</span>
                    <button onClick={() => remove(note.id)} className="opacity-0 group-hover/d:opacity-100 p-1 rounded hover:bg-rose-50 text-subtle hover:text-rose-600 transition-all shrink-0 mt-0.5"><X size={11} /></button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border bg-bg/50 shrink-0">
          <div className="flex items-center gap-2 bg-white rounded-xl border border-border px-3 py-2.5 focus-within:border-indigo-300 transition-colors">
            <Plus size={13} className="text-subtle/40 shrink-0" />
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') onClose() }}
              placeholder="Ajouter un point à traiter…"
              className="flex-1 text-sm text-navy placeholder:text-subtle/40 outline-none bg-transparent" />
            {input.trim() && (
              <button onClick={add} className="text-[11px] font-semibold text-white bg-indigo-600 px-2.5 py-1 rounded-lg hover:bg-indigo-700 transition-colors shrink-0">↵</button>
            )}
          </div>
          <p className="text-[10px] text-subtle/30 mt-1.5 text-center">Entrée pour ajouter · Hover pour actions · Échap pour fermer</p>
        </div>
      </div>
    </>
  ), document.body)
}

// ── Nav data ──────────────────────────────────────────────────
interface NavItem { id: string; label: string; href: string; icon: React.ReactNode; adminOnly?: boolean }

const GLOBAL_NAV: NavItem[] = [
  { id: 'dashboard',    label: 'Dashboard',              href: '/',                  icon: <LayoutDashboard size={15} /> },
  { id: 'reunion',      label: 'Réunion PO',             href: '/reunion',           icon: <CalendarClock size={15} />   },
  { id: 'plan-charges', label: 'Plan de charges',        href: '/plan-charges',      icon: <TrendingUp size={15} />      },
  { id: 'produits',     label: 'Produits',               href: '/produits',          icon: <Package size={15} />         },
  { id: 'metiers',      label: 'Thèmes',                 href: '/setup?tab=metiers', icon: <Briefcase size={15} />       },
  { id: 'equipes',      label: 'Équipes & Utilisateurs', href: '/admin/equipes',     icon: <Users size={15} />, adminOnly: true },
  { id: 'finance',      label: 'Finance',                href: '/admin/finance',     icon: <Euro size={15} />,  adminOnly: true },
]

const PRODUCT_NAV: NavItem[] = [
  { id: 'produit-dashboard', label: 'Dashboard',    href: '/produit-dashboard',  icon: <BarChart3 size={15} />      },
  { id: 'sprint',            label: 'Sprint Board', href: '/sprint',             icon: <Kanban size={15} />         },
  { id: 'taches',            label: 'Tâches',       href: '/taches',             icon: <FilePlus size={15} />       },
  { id: 'backlog',           label: 'Backlog',       href: '/backlog',            icon: <List size={15} />           },
  { id: 'dod',               label: 'DoD',          href: '/dod',                icon: <ClipboardCheck size={15} /> },
  { id: 'activite',          label: 'Activité',     href: '/activite',           icon: <Clock size={15} />          },
  { id: 'setup',             label: 'Setup',        href: '/setup?tab=sprints',  icon: <Settings size={15} />       },
]

function isActive(href: string, pathname: string, search: string) {
  const [p, q] = href.split('?')
  if (q) return pathname === p && search === '?' + q
  return pathname === p
}

function getActiveId(items: NavItem[], pathname: string, search: string): string | null {
  for (const item of items) {
    if (isActive(item.href, pathname, search)) return item.id
    const [p] = item.href.split('?')
    if (p !== '/' && pathname.startsWith(p)) return item.id
  }
  return null
}

// ── Sélecteur produit ─────────────────────────────────────────
function ProductSelector({ t, onClose, collapsed }: { t: SidebarTheme; onClose: () => void; collapsed: boolean }) {
  const { data: produits = [] }           = useProduits()
  const { isAdmin, getRoleForProduit }    = useAuth()
  const { produitActif, setProduitActif } = useProduit()
  const [open, setOpen]                   = useState(false)
  const ref                               = useRef<HTMLDivElement>(null)

  const accessibles = produits.filter(p => p.actif && (isAdmin || getRoleForProduit(p.id) !== null))

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function select(p: typeof produits[0]) { setProduitActif({ id: p.id, nom: p.nom, couleur: p.couleur }); setOpen(false); onClose() }
  function deselect() { setProduitActif(null); setOpen(false); onClose() }

  return (
    <div ref={ref} className={cn('relative border-b', collapsed ? 'px-2 py-1.5' : 'px-3 py-1.5', t.divider)}>
      <button onClick={() => setOpen(o => !o)} title={collapsed ? (produitActif?.nom ?? 'Sélectionner un produit') : undefined}
        className={cn('w-full flex items-center rounded-lg transition-colors group',
          collapsed ? 'justify-center px-2 py-1.5' : 'gap-2.5 px-2.5 py-1.5', t.selectorBtn)}>
        {produitActif ? (
          <>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: produitActif.couleur ?? '#4A4CC8' }} />
            {!collapsed && <span className="flex-1 text-[13px] font-semibold truncate tracking-[-0.01em]">{produitActif.nom}</span>}
          </>
        ) : (
          <>
            <Package size={13} className="shrink-0 opacity-40" />
            {!collapsed && <span className="flex-1 text-[12px] italic opacity-40">Sélectionner un produit</span>}
          </>
        )}
        {!collapsed && <ChevronRight size={12} className={cn('text-amber-400 transition-transform shrink-0', open && 'rotate-90')} />}
      </button>

      {open && (
        <div className={cn('absolute top-full mt-1 z-50 rounded-xl overflow-hidden py-1 border',
          collapsed ? 'left-2 w-64' : 'left-3 right-3', t.selectorDropBg)}>
          {produitActif && (
            <>
              <button onClick={deselect} className={cn('w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors', t.selectorItemCls)}>
                <LayoutDashboard size={11} /> Vue globale
              </button>
              <div className={cn('my-1 border-t', t.divider)} />
            </>
          )}
          {accessibles.map(p => (
            <button key={p.id} onClick={() => select(p)}
              className={cn('w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-colors',
                produitActif?.id === p.id ? t.selectorItemActiveCls : t.selectorItemCls)}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />
              <span className="flex-1 truncate">{p.nom}</span>
              {produitActif?.id === p.id && <span className="text-indigo-400 text-[10px]">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── NavRow ────────────────────────────────────────────────────
function NavRow({ item, active, t, collapsed }: { item: NavItem; active: boolean; t: SidebarTheme; collapsed?: boolean }) {
  return (
    <NavLink to={item.href} title={collapsed ? item.label : undefined}
      className={cn(
        'group flex items-center rounded-lg text-[12.5px] font-medium tracking-[-0.01em] transition-all',
        collapsed ? 'justify-center px-2 py-[8px]' : 'gap-2.5 px-2.5 py-[6px]',
        active ? t.navActive : cn(t.navInactive, t.navHoverBg)
      )}>
      <span className={cn('shrink-0 transition-colors', active ? t.navIconActive : t.navIconInactive)}>
        {item.icon}
      </span>
      {!collapsed && item.label}
      {!collapsed && active && <span className={cn('ml-auto w-1.5 h-1.5 rounded-full shrink-0', t.navDot)} />}
    </NavLink>
  )
}

// ── Section label ─────────────────────────────────────────────
function SectionLabel({ children, t }: { children: React.ReactNode; t: SidebarTheme }) {
  return (
    <div className="px-2.5 pt-4 pb-1">
      <span className={cn('text-[10px] font-semibold uppercase tracking-[0.08em] select-none', t.sectionLabel)}>
        {children}
      </span>
    </div>
  )
}

// ── Footer profil ─────────────────────────────────────────────
function ProfileFooter({ t, onThemeChange, collapsed }: { t: SidebarTheme; onThemeChange: (k: ThemeKey) => void; collapsed: boolean }) {
  const { user, profile, isAdmin, refreshProfile } = useAuth()
  const uploadAvatar  = useUploadAvatar()
  const updateProfile = useUpdateProfile()
  const fileRef       = useRef<HTMLInputElement>(null)
  const panelRef      = useRef<HTMLDivElement>(null)
  const [open,      setOpen]      = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const { data: quickNotes = [] } = useQuickNotes(user?.id)
  const migrateLegacyNotes        = useMigrateLegacyQuickNotes()

  // Migration ponctuelle des anciennes notes localStorage → Supabase
  useEffect(() => {
    if (user?.id) migrateLegacyNotes.mutate(user.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const displayName = profile?.display_name ?? user?.email ?? '—'
  const initiale    = (profile?.trigramme ?? displayName[0] ?? '?').toUpperCase()

  async function pickColor(c: string) {
    if (!user) return
    await updateProfile.mutateAsync({ user_id: user.id, updates: { couleur: c } })
    await refreshProfile()
  }

  return (
    <div ref={panelRef} className={cn('py-3 border-t shrink-0 relative', collapsed ? 'px-2' : 'px-3', t.footerBorder)}>
      {/* Panel éditeur profil */}
      {open && (
        <div className={cn('absolute bottom-full rounded-t-2xl shadow-2xl p-4 border-x border-t',
          collapsed ? 'left-0 w-72' : 'left-0 right-0', t.editPanelBg, t.editPanelBorder)}>
          {/* Avatar + nom */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative w-11 h-11 rounded-full overflow-hidden shrink-0 cursor-pointer group" onClick={() => fileRef.current?.click()}>
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold" style={{ background: profile?.couleur ?? '#4A4CC8' }}>
                  {initiale}
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Camera size={14} className="text-white" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn('text-xs font-semibold truncate', t.profileText)}>{displayName}</div>
              {isAdmin && <div className={cn('text-[10px]', t.profileSub)}>Admin</div>}
            </div>
            <button onClick={() => setOpen(false)} className={cn('p-1 rounded transition-colors', t.notesBtn)}><X size={13} /></button>
          </div>

          {/* Photo */}
          <button onClick={() => fileRef.current?.click()} disabled={uploadAvatar.isPending}
            className={cn('w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors mb-3', t.notesBtn)}>
            <Camera size={12} />
            {uploadAvatar.isPending ? 'Upload en cours…' : 'Changer la photo'}
          </button>
          {profile?.avatar_url && (
            <button onClick={async () => {
              if (!user) return
              await uploadAvatar.mutateAsync({ user_id: user.id, file: null })
              await refreshProfile()
            }} className={cn('w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl text-xs transition-colors mb-3', t.logoutBtn)}>
              <X size={11} /> Supprimer la photo
            </button>
          )}

          {/* Couleur avatar */}
          <div className={cn('text-[10px] uppercase tracking-widest mb-1.5', t.sectionLabel)}>Couleur avatar</div>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {BRAND_COLORS.map(c => (
              <button key={c} type="button" onClick={() => pickColor(c)}
                className={cn('w-5 h-5 rounded-full transition-transform hover:scale-110',
                  profile?.couleur === c && 'ring-2 ring-white ring-offset-1')}
                style={{ background: c, boxShadow: profile?.couleur === c ? `0 0 0 2px ${c}40` : undefined }} />
            ))}
          </div>

          {/* Thème sidebar */}
          <div className={cn('text-[10px] uppercase tracking-widest mb-2', t.sectionLabel)}>Thème du menu</div>
          <div className="flex gap-2">
            {(Object.values(THEMES) as SidebarTheme[]).map(theme => (
              <button key={theme.id} onClick={() => onThemeChange(theme.id)}
                title={theme.label}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-xl border-2 transition-all text-[10px] font-semibold',
                  t.id === theme.id
                    ? 'border-indigo-400 scale-105'
                    : 'border-transparent hover:border-white/20 opacity-70 hover:opacity-100'
                )}
                style={{ background: theme.previewBg, color: theme.previewText }}>
                <span style={{ color: theme.previewText }}>{THEME_ICONS[theme.id]}</span>
                {theme.label}
              </button>
            ))}
          </div>

          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={async e => {
              const file = e.target.files?.[0]
              if (!file || !user) return
              await uploadAvatar.mutateAsync({ user_id: user.id, file })
              await refreshProfile()
              e.target.value = ''
            }} />
        </div>
      )}

      {/* Notes rapides */}
      {user && (
        <>
          <button onClick={() => setShowNotes(true)} title={collapsed ? 'Points à traiter' : undefined}
            className={cn('relative w-full flex items-center rounded-lg text-[12px] font-medium transition-colors mb-0.5',
              collapsed ? 'justify-center px-2 py-[8px]' : 'gap-2.5 px-2.5 py-[7px]', t.notesBtn)}>
            <StickyNote size={14} className="shrink-0" />
            {!collapsed && <span className="flex-1 text-left">Points à traiter</span>}
            {(() => {
              const n = quickNotes.filter(x => !x.done).length
              if (n === 0) return null
              return collapsed
                ? <span className="absolute top-0.5 right-1 w-2 h-2 rounded-full bg-amber-500" />
                : <span className="text-[9px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full">{n}</span>
            })()}
          </button>
          {showNotes && (
            <QuickNotesPanel userId={user.id} userName={profile?.display_name ?? user.email ?? ''}
              onClose={() => setShowNotes(false)} leftOffset={collapsed ? '4.5rem' : '14.5rem'} />
          )}
        </>
      )}

      {/* Bouton profil */}
      <button onClick={() => setOpen(v => !v)} title={collapsed ? displayName : undefined}
        className={cn('w-full flex items-center rounded-lg transition-colors',
          collapsed ? 'justify-center px-2 py-[7px]' : 'gap-2.5 px-2.5 py-[7px]', open ? t.navActive : cn(t.navHoverBg))}>
        <div className="w-6 h-6 rounded-full overflow-hidden shrink-0">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white text-[9px] font-bold" style={{ background: profile?.couleur ?? '#4A4CC8' }}>
              {initiale}
            </div>
          )}
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <div className={cn('text-[12px] font-medium truncate leading-tight', t.profileText)}>{displayName}</div>
              {isAdmin && <div className={cn('text-[10px] leading-tight', t.profileSub)}>Admin</div>}
            </div>
            <Camera size={11} className={cn('shrink-0 opacity-30')} />
          </>
        )}
      </button>

      {/* Déconnexion */}
      <button onClick={async () => {
        const { supabase } = await import('@/lib/supabase')
        await supabase.auth.signOut()
      }} title={collapsed ? 'Se déconnecter' : undefined}
        className={cn('w-full flex items-center rounded-lg text-[12px] font-medium transition-colors mt-0.5',
          collapsed ? 'justify-center px-2 py-[7px]' : 'gap-2.5 px-2.5 py-[7px]', t.logoutBtn)}>
        <LogOut size={13} className="shrink-0" /> {!collapsed && 'Se déconnecter'}
      </button>
    </div>
  )
}

// ── Sidebar principale ────────────────────────────────────────
interface SidebarProps { open: boolean; onClose: () => void }

function getCollapsed(): boolean {
  return localStorage.getItem('sidebar-collapsed') === '1'
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { data: sprintActif } = useSprintActif()
  const { isAdmin }           = useAuth()
  const { produitActif }      = useProduit()
  const location              = useLocation()

  const [themeKey, setThemeKey] = useState<ThemeKey>(getTheme)
  const t = THEMES[themeKey]

  const [collapsed, setCollapsed] = useState<boolean>(getCollapsed)
  function toggleCollapsed() {
    setCollapsed(v => {
      localStorage.setItem('sidebar-collapsed', v ? '0' : '1')
      return !v
    })
  }

  function handleThemeChange(k: ThemeKey) {
    setThemeKey(k)
    localStorage.setItem('sidebar-theme', k)
  }

  const allItems = [...GLOBAL_NAV, ...PRODUCT_NAV]
  const activeId = getActiveId(allItems, location.pathname, location.search)
  const globalItems = GLOBAL_NAV.filter(i => !i.adminOnly || isAdmin)

  useEffect(() => { onClose() }, [location.pathname, location.search])

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onClose} />}

      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 flex flex-col shrink-0',
        collapsed ? 'w-16' : 'w-56',
        'transition-[transform,width] duration-300 ease-in-out',
        'md:relative md:inset-auto md:z-auto md:translate-x-0 md:transition-[width]',
        open ? 'translate-x-0' : '-translate-x-full',
        t.aside,
      )}>

        {/* Logo */}
        <div style={{ minHeight: 52 }} className={cn('relative flex items-center shrink-0 border-b', collapsed ? 'justify-center px-2' : 'px-4', t.divider)}>
          <div className="flex items-center gap-2.5 z-10">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/30 bg-navy shrink-0">
              <img src="/logo.svg" alt="" className="w-[18px] h-[18px]" />
            </div>
          </div>
          {!collapsed && (
            <span className={cn('absolute inset-x-0 text-center text-[15px] font-bold tracking-[-0.02em] pointer-events-none', t.logoText)}>
              PO Board
            </span>
          )}
          {!collapsed && (
            <div className="ml-auto flex items-center gap-0.5 z-10">
              <button onClick={toggleCollapsed} title="Réduire le menu"
                className={cn('hidden md:inline-flex p-1.5 rounded-lg transition-colors', t.notesBtn)}><ChevronLeft size={15} /></button>
              <button onClick={onClose} className={cn('md:hidden p-1.5 rounded-lg transition-colors', t.notesBtn)}><X size={15} /></button>
            </div>
          )}
          {collapsed && (
            <button onClick={toggleCollapsed} title="Agrandir le menu"
              className={cn('absolute -right-3 top-1/2 -translate-y-1/2 p-1 rounded-full border shadow-md transition-colors', t.divider, t.notesBtn, t.aside)}>
              <ChevronRight size={13} />
            </button>
          )}
        </div>

        {/* Sélecteur produit */}
        <ProductSelector t={t} onClose={onClose} collapsed={collapsed} />

        {/* Nav */}
        <nav className="flex-1 px-3 pb-2 overflow-y-auto overflow-x-hidden">

          {/* Mon Travail — item épinglé, séparé */}
          <div className="pt-6 pb-2">
            <NavRow item={{ id: 'montravail', label: 'Mon Travail', href: '/montravail', icon: <User size={15} /> }}
              active={activeId === 'montravail'} t={t} collapsed={collapsed} />
          </div>
          <div className={cn('mx-2.5 mb-2 h-px', t.divider)} />

          {/* Section Global */}
          {!collapsed && <SectionLabel t={t}>Global</SectionLabel>}
          <div className={cn('flex flex-col gap-0.5', collapsed ? 'mt-2' : 'mt-1')}>
            {globalItems.map(item => <NavRow key={item.id} item={item} active={activeId === item.id} t={t} collapsed={collapsed} />)}
          </div>

          {/* Section Produit */}
          {produitActif && (
            <>
              <div className={cn('mx-2.5 mt-4 mb-3 h-px', t.divider)} />

              {!collapsed && (
                <div className="px-2.5 mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: produitActif.couleur ?? '#4A4CC8' }} />
                  <span className={cn('text-[10px] font-semibold uppercase tracking-[0.08em] truncate', t.sectionLabel)}>
                    {produitActif.nom}
                  </span>
                  {sprintActif && (
                    <span className={cn('ml-auto text-[10px] font-bold', t.sprintBadge)}>
                      {sprintActif.numero}
                    </span>
                  )}
                </div>
              )}
              {collapsed && (
                <div className="flex justify-center mb-2" title={produitActif.nom}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: produitActif.couleur ?? '#4A4CC8' }} />
                </div>
              )}

              <div className="flex flex-col gap-0.5">
                {PRODUCT_NAV.map(item => <NavRow key={item.id} item={item} active={activeId === item.id} t={t} collapsed={collapsed} />)}
              </div>
            </>
          )}
        </nav>

        <ProfileFooter t={t} onThemeChange={handleThemeChange} collapsed={collapsed} />
      </aside>
    </>
  )
}
