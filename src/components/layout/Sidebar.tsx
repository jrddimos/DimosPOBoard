import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useSprintActif } from '@/hooks/useSprints'
import { useAuth } from '@/contexts/AuthContext'
import { useProduit } from '@/contexts/ProduitContext'
import { useProduits, useUploadDiscussionBg, useUpdateDiscussionBgOpacity } from '@/hooks/useProduits'
import type { ActionLop } from '@/hooks/useProduits'
import { useUploadAvatar, useUpdateProfile } from '@/hooks/useUserManagement'
import { useQuickNotes, useCreateQuickNote, useToggleQuickNote, useDeleteQuickNote, useMigrateLegacyQuickNotes } from '@/hooks/useQuickNotes'
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, useDeleteNotification } from '@/hooks/useNotifications'
import { useSuggestions, useCreateSuggestion, useUpdateSuggestion, useUpdateSuggestionStatut } from '@/hooks/useSuggestions'
import type { Suggestion, SuggestionStatut, SuggestionImportance } from '@/hooks/useSuggestions'
import { useProduitMessages, useAddProduitMessage, useDeleteProduitMessage } from '@/hooks/useProduitMessages'
import { useUtilisateurs } from '@/hooks/useEquipes'
import { MentionField } from '@/components/ui/MentionField'
import { useDarkModeStore } from '@/hooks/useDarkMode'
import { useTimerStore, elapsedMinutes, formatElapsed } from '@/hooks/useTimer'
import { useAddTemps } from '@/hooks/useTacheTemps'
import type { AppNotification } from '@/hooks/useNotifications'
import { useToast } from '@/hooks/useToast'
import { supabase } from '@/lib/supabase'
import { BRAND_COLORS } from '@/constants'
import {
  LayoutDashboard, Kanban, FilePlus, Settings,
  ChevronDown, LogOut, ClipboardCheck, User, Clock, X,
  Package, CalendarClock, BarChart3, Camera, TrendingUp,
  StickyNote, Plus, Check, ArrowRight, ChevronRight, ChevronLeft, Sun, Moon, Layers, Bell, Search, Square, Timer,
  SlidersHorizontal, MessageCircle, Send, Lightbulb, ThumbsUp, ThumbsDown, Archive, Milestone,
  Pencil, ArrowUpDown,
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'

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
    aside:           'bg-[#0F1829]',
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
    id: 'ardoise', label: 'Ardoise', previewBg: '#262B4A', previewText: '#C3C8EC',
    aside:           'bg-[#262B4A]',
    divider:         'border-white/10',
    logoText:        'text-white',
    navInactive:     'text-[#C3C8EC] hover:text-white',
    navActive:       'bg-indigo-400/25 border border-indigo-300/40 text-white font-semibold',
    navIconInactive: 'text-[#9BA3D6]',
    navIconActive:   'text-indigo-200',
    navDot:          'bg-indigo-300',
    navHoverBg:      'hover:bg-white/8',
    sectionLabel:    'text-[#8F97C9]',
    selectorBtn:     'text-[#C3C8EC] hover:bg-white/8',
    selectorDropBg:  'bg-[#303764] border-white/10',
    selectorItemCls: 'text-[#C3C8EC] hover:text-white hover:bg-white/8',
    selectorItemActiveCls: 'text-white font-semibold bg-white/12',
    sprintChip:      'bg-white/8',
    sprintText:      'text-[#C3C8EC]',
    sprintBadge:     'text-emerald-300',
    footerBorder:    'border-white/10',
    profileText:     'text-[#C3C8EC]',
    profileSub:      'text-indigo-300',
    notesBtn:        'text-[#C3C8EC] hover:text-white hover:bg-white/8',
    logoutBtn:       'text-[#9BA3D6] hover:text-rose-300 hover:bg-white/8',
    editPanelBg:     'bg-[#2C3257]',
    editPanelBorder: 'border-white/10',
  },
  clair: {
    id: 'clair', label: 'Clair', previewBg: '#f8fafc', previewText: '#1e293b',
    aside:           'bg-card border-r border-slate-200',
    divider:         'border-slate-200',
    logoText:        'text-navy',
    navInactive:     'text-slate-600 hover:text-navy',
    navActive:       'bg-indigo-50 border border-indigo-100 text-indigo-700 font-semibold',
    navIconInactive: 'text-slate-400',
    navIconActive:   'text-indigo-600',
    navDot:          'bg-indigo-500',
    navHoverBg:      'hover:bg-slate-100',
    sectionLabel:    'text-slate-400',
    selectorBtn:     'text-slate-600 hover:bg-slate-100',
    selectorDropBg:  'bg-card border-slate-200 shadow-lg',
    selectorItemCls: 'text-slate-500 hover:text-navy hover:bg-slate-50',
    selectorItemActiveCls: 'text-navy font-semibold bg-slate-100',
    sprintChip:      'bg-slate-100 border border-slate-200',
    sprintText:      'text-slate-500',
    sprintBadge:     'text-emerald-600',
    footerBorder:    'border-slate-200',
    profileText:     'text-slate-600',
    profileSub:      'text-indigo-500',
    notesBtn:        'text-slate-500 hover:text-slate-800 hover:bg-slate-100',
    logoutBtn:       'text-slate-400 hover:text-rose-500 hover:bg-rose-50',
    editPanelBg:     'bg-card',
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
  const { isAdmin, canWrite } = useAuth()
  const toast                 = useToast()
  const inputRef               = useRef<HTMLInputElement>(null)

  const { data: notes = [] } = useQuickNotes(userId)
  const createNote = useCreateQuickNote()
  const toggleNote  = useToggleQuickNote()
  const deleteNote  = useDeleteQuickNote()

  const [input, setInput]       = useState('')
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sendingLop, setSendingLop] = useState(false)

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
    const action: ActionLop = {
      id: Date.now().toString(), titre: note.text,
      created_at: new Date().toISOString(),
      date_cloture_estimee: null, report_1: null, report_2: null,
      assigne_id: userId, assigne_nom: userName,
      cloture: false, cloture_at: null,
    }
    setSendingLop(true)
    const { error } = await supabase.rpc('add_action_lop', { p_produit_id: produitId, p_action: action })
    setSendingLop(false)
    if (error) { toast("Échec de l'envoi vers la LOP (droits insuffisants ?)", 'error'); return }
    setSendingId(null)
    remove(note.id)
    toast('Envoyé vers la LOP produit')
  }

  const openNotes = notes.filter(n => !n.done)
  const doneNotes = notes.filter(n => n.done)
  const produitsActifs = produits.filter(p => p.actif && (isAdmin || canWrite(p.id)))

  return createPortal((
    <>
      <div className="fixed inset-0 z-[10049]" onClick={onClose} />
      <div className="fixed bottom-4 z-[10050] w-[360px] max-h-[70vh] bg-card shadow-2xl flex flex-col rounded-2xl border border-border overflow-hidden"
        style={{ left: leftOffset }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <StickyNote size={15} className="text-indigo-400" />
            <div>
              <h2 className="text-sm font-bold text-navy">Points à traiter</h2>
              <p className="text-[11px] text-subtle">{openNotes.length} en attente · {doneNotes.length} traité{doneNotes.length !== 1 ? 's' : ''}</p>
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
                  <button onClick={() => remove(note.id)} className="max-md:opacity-100 opacity-0 group-hover/row:opacity-100 p-1 rounded hover:bg-rose-50 text-subtle hover:text-rose-600 transition-all shrink-0 mt-0.5"><X size={12} /></button>
                </div>
                {sendingId === note.id ? (
                  <div className="mt-2 ml-6 flex flex-wrap gap-1.5">
                    <span className="text-[11px] text-subtle/60 w-full mb-0.5">Choisir le produit :</span>
                    {produitsActifs.map(p => (
                      <button key={p.id} onClick={() => sendToLop(note, p.id)} disabled={sendingLop}
                        className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full text-white hover:opacity-80 transition-opacity disabled:opacity-50"
                        style={{ background: p.couleur ?? '#4A4CC8' }}>{p.nom}</button>
                    ))}
                    <button onClick={() => setSendingId(null)} className="text-xs px-2.5 py-1 rounded-full border border-border text-subtle hover:text-rose-600 transition-colors">Annuler</button>
                  </div>
                ) : (
                  <button onClick={() => setSendingId(note.id)} className="mt-1.5 ml-6 flex items-center gap-1 text-[11px] text-subtle/40 hover:text-indigo-600 max-md:opacity-100 opacity-0 group-hover/row:opacity-100 transition-all">
                    <ArrowRight size={10} /> Envoyer vers LOP produit
                  </button>
                )}
              </div>
            ))}
          </div>
          {doneNotes.length > 0 && (
            <details className="group/done border-t border-border/40">
              <summary className="flex items-center gap-2 px-4 py-2 text-[11px] text-subtle/50 uppercase tracking-wider font-semibold cursor-pointer hover:text-subtle list-none select-none">
                <ChevronDown size={11} className="transition-transform group-open/done:rotate-0 -rotate-90" /> Traités ({doneNotes.length})
              </summary>
              <div className="divide-y divide-border/20">
                {doneNotes.map(note => (
                  <div key={note.id} className="flex items-start gap-2.5 px-4 py-2.5 group/d hover:bg-bg/30">
                    <button onClick={() => toggle(note.id, note.done)} className="mt-0.5 w-4 h-4 rounded border border-emerald-300 bg-emerald-50 shrink-0 flex items-center justify-center"><Check size={9} className="text-emerald-600" /></button>
                    <span className="flex-1 text-xs text-subtle/40 line-through leading-snug">{note.text}</span>
                    <button onClick={() => remove(note.id)} className="max-md:opacity-100 opacity-0 group-hover/d:opacity-100 p-1 rounded hover:bg-rose-50 text-subtle hover:text-rose-600 transition-all shrink-0 mt-0.5"><X size={11} /></button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border bg-bg/50 shrink-0">
          <div className="flex items-center gap-2 bg-card rounded-xl border border-border px-3 py-2.5 focus-within:border-indigo-300 transition-colors">
            <Plus size={13} className="text-subtle/40 shrink-0" />
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') onClose() }}
              placeholder="Ajouter un point à traiter…"
              className="flex-1 text-sm text-navy placeholder:text-subtle/40 outline-none bg-transparent" />
            {input.trim() && (
              <button onClick={add} className="text-xs font-semibold text-white bg-indigo-500 px-2.5 py-1 rounded-lg hover:bg-indigo-400 transition-colors shrink-0">↵</button>
            )}
          </div>
          <p className="text-[11px] text-subtle/30 mt-1.5 text-center">Entrée pour ajouter · Hover pour actions · Échap pour fermer</p>
        </div>
      </div>
    </>
  ), document.body)
}

// ── Notifications ─────────────────────────────────────────────
const NOTIF_TYPE_CFG: Record<AppNotification['type'], { icon: string; href: string }> = {
  assignation:     { icon: '📌', href: '/taches' },
  sprint_cloture:  { icon: '🏁', href: '/sprint' },
  tache_bloquee:   { icon: '⛔', href: '/taches' },
  mention:         { icon: '💬', href: '/taches' },
  acces_demande:   { icon: '🔑', href: '/admin/equipes' },
  mention_reunion: { icon: '💬', href: '/reunion' },
  mention_discussion: { icon: '💬', href: '' },
}

function NotificationsPanel({ userId, onClose, leftOffset }: {
  userId: string; onClose: () => void; leftOffset: string
}) {
  const navigate = useNavigate()
  const { data: notifications = [] } = useNotifications(userId)
  const { data: produits = [] } = useProduits()
  const { setProduitActif } = useProduit()
  const markRead    = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const deleteNotif  = useDeleteNotification()

  const unread = notifications.filter(n => !n.lu)

  function open(n: AppNotification) {
    if (!n.lu) markRead.mutate({ id: n.id, user_id: userId })
    if (n.produit_id) {
      const p = produits.find(p => p.id === n.produit_id)
      if (p) setProduitActif({ id: p.id, nom: p.nom, couleur: p.couleur })
    }
    if (n.type === 'mention_discussion') {
      window.dispatchEvent(new Event('open-discussion'))
      onClose()
      return
    }
    const base = NOTIF_TYPE_CFG[n.type]?.href ?? '/'
    const opensTask = n.type === 'assignation' || n.type === 'mention' || n.type === 'tache_bloquee'
    let href = base
    if (opensTask && n.target) {
      href = `${base}?tab=edit&focus=${encodeURIComponent(n.target)}`
    } else if (n.type === 'mention_reunion' && n.target) {
      const [semaine, annee] = n.target.split('-')
      href = `${base}?semaine=${semaine}&annee=${annee}`
    }
    navigate(href)
    onClose()
  }

  return createPortal((
    <>
      <div className="fixed inset-0 z-[10049]" onClick={onClose} />
      <div className="fixed bottom-4 z-[10050] w-[360px] max-h-[70vh] bg-card shadow-2xl flex flex-col rounded-2xl border border-border overflow-hidden"
        style={{ left: leftOffset }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <Bell size={15} className="text-indigo-400" />
            <div>
              <h2 className="text-sm font-bold text-navy">Notifications</h2>
              <p className="text-[11px] text-subtle">{unread.length} non lue{unread.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {unread.length > 0 && (
              <button onClick={() => markAllRead.mutate(userId)}
                className="text-[11px] font-semibold text-indigo-500 hover:text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors">
                Tout marquer lu
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg text-subtle hover:text-navy transition-colors"><X size={15} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-subtle/30">
              <Bell size={36} className="mb-3" />
              <p className="text-xs italic">Aucune notification</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {notifications.map(n => (
                <div key={n.id} onClick={() => open(n)}
                  className={cn('px-4 py-3 group/row cursor-pointer transition-colors flex items-start gap-2.5',
                    n.lu ? 'hover:bg-bg/40' : 'bg-indigo-50/40 hover:bg-indigo-50/70')}>
                  <span className="text-base leading-none mt-0.5">{NOTIF_TYPE_CFG[n.type]?.icon ?? '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {!n.lu && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />}
                      <p className={cn('text-sm leading-snug', n.lu ? 'text-navy/70' : 'text-navy font-semibold')}>{n.title}</p>
                    </div>
                    {n.body && <p className="text-xs text-subtle mt-0.5 truncate">{n.body}</p>}
                    <p className="text-[11px] text-subtle/50 mt-1">{new Date(n.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); deleteNotif.mutate({ id: n.id, user_id: userId }) }}
                    className="max-md:opacity-100 opacity-0 group-hover/row:opacity-100 p-1 rounded hover:bg-rose-50 text-subtle hover:text-rose-600 transition-all shrink-0 mt-0.5">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  ), document.body)
}

// ── Propositions d'amélioration ──────────────────────────────────
const SUGGESTION_STATUT_CFG: Record<SuggestionStatut, { label: string; className: string }> = {
  nouvelle: { label: 'Nouvelle',  className: 'bg-indigo-50 text-indigo-600' },
  acceptee: { label: 'Acceptée',  className: 'bg-emerald-50 text-emerald-600' },
  rejetee:  { label: 'Rejetée',   className: 'bg-rose-50 text-rose-600' },
  fermee:   { label: 'Fermée',    className: 'bg-slate-100 text-slate-500' },
}
const SUGGESTION_IMPORTANCE_CFG: Record<SuggestionImportance, { label: string; className: string; order: number }> = {
  haute:   { label: 'Haute',   className: 'bg-rose-50 text-rose-600',    order: 0 },
  moyenne: { label: 'Moyenne', className: 'bg-amber-50 text-amber-600',  order: 1 },
  basse:   { label: 'Basse',   className: 'bg-slate-100 text-slate-500', order: 2 },
}
const SUGGESTION_IMPORTANCE_LEVELS: SuggestionImportance[] = ['basse', 'moyenne', 'haute']

type SuggestionSort = 'recent' | 'importance' | 'auteur'

// Formulaire d'édition d'une proposition — composant top-level (pas défini
// dans SuggestionsPanel) pour que son état local (texte en cours de frappe)
// survive aux re-renders du parent (ex. refetch de la query suggestions en
// arrière-plan) au lieu d'être démonté/perdu.
function SuggestionEditForm({ s, onDone, updateSuggestion }: {
  s: Suggestion
  onDone: () => void
  updateSuggestion: ReturnType<typeof useUpdateSuggestion>
}) {
  const [t, setT] = useState(s.titre)
  const [d, setD] = useState(s.description ?? '')
  const [imp, setImp] = useState<SuggestionImportance>(s.importance)

  async function save() {
    if (!t.trim()) return
    await updateSuggestion.mutateAsync({ id: s.id, titre: t.trim(), description: d.trim() || null, importance: imp })
    onDone()
  }

  return (
    <div className="px-4 py-3 bg-bg/50 flex flex-col gap-2">
      <input value={t} onChange={e => setT(e.target.value)} autoFocus
        className="text-sm text-navy outline-none bg-card border border-border rounded-lg px-3 py-2 focus:border-indigo-300 transition-colors" />
      <textarea value={d} onChange={e => setD(e.target.value)} rows={2}
        placeholder="Détails (optionnel)…"
        className="text-xs text-navy outline-none bg-card border border-border rounded-lg px-3 py-2 focus:border-indigo-300 transition-colors resize-none" />
      <div className="flex items-center gap-1.5">
        {SUGGESTION_IMPORTANCE_LEVELS.map(lvl => (
          <button key={lvl} type="button" onClick={() => setImp(lvl)}
            className={cn('text-[11px] font-semibold px-2 py-1 rounded-lg border transition-colors',
              imp === lvl ? cn(SUGGESTION_IMPORTANCE_CFG[lvl].className, 'border-transparent') : 'border-border text-subtle hover:border-indigo-200')}>
            {SUGGESTION_IMPORTANCE_CFG[lvl].label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 self-end">
        <button onClick={onDone} className="text-xs font-semibold text-subtle hover:text-navy px-2 py-1.5 rounded-lg transition-colors">Annuler</button>
        <button onClick={save} disabled={!t.trim() || updateSuggestion.isPending}
          className="text-xs font-semibold text-white bg-indigo-500 px-3 py-1.5 rounded-lg hover:bg-indigo-400 transition-colors disabled:opacity-40">
          {updateSuggestion.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}

function SuggestionsPanel({ userId, isAdmin, onClose, leftOffset }: {
  userId: string; isAdmin: boolean; onClose: () => void; leftOffset: string
}) {
  const { data: suggestions = [] } = useSuggestions()
  const { data: membres = [] } = useUtilisateurs()
  const createSuggestion = useCreateSuggestion()
  const updateSuggestion = useUpdateSuggestion()
  const updateStatut     = useUpdateSuggestionStatut()
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [importance, setImportance] = useState<SuggestionImportance>('moyenne')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SuggestionSort>('recent')

  function authorName(id: string) {
    const m = membres.find(u => u.user_id === id)
    return m ? ([m.prenom, m.nom].filter(Boolean).join(' ') || m.trigramme || m.display_name || 'Utilisateur') : 'Utilisateur'
  }

  async function submit() {
    if (!titre.trim()) return
    await createSuggestion.mutateAsync({ auteur_id: userId, titre: titre.trim(), description: description.trim() || null, importance })
    setTitre(''); setDescription(''); setImportance('moyenne'); setShowForm(false)
  }

  // Tri appliqué séparément aux deux groupes (nouvelles / traitées) — le
  // regroupement par statut reste toujours prioritaire sur le tri choisi.
  function sortList(list: Suggestion[]): Suggestion[] {
    if (sortBy === 'importance') return [...list].sort((a, b) => SUGGESTION_IMPORTANCE_CFG[a.importance].order - SUGGESTION_IMPORTANCE_CFG[b.importance].order)
    if (sortBy === 'auteur') return [...list].sort((a, b) => authorName(a.auteur_id).localeCompare(authorName(b.auteur_id), 'fr'))
    return list // 'recent' : déjà trié par created_at desc depuis la query
  }

  const nouvelles = sortList(suggestions.filter(s => s.statut === 'nouvelle'))
  const autres     = sortList(suggestions.filter(s => s.statut !== 'nouvelle'))

  function SuggestionRow({ s }: { s: Suggestion }) {
    const cfg = SUGGESTION_STATUT_CFG[s.statut]
    const impCfg = SUGGESTION_IMPORTANCE_CFG[s.importance]
    const canEdit = s.auteur_id === userId || isAdmin

    if (editingId === s.id) {
      return <SuggestionEditForm s={s} onDone={() => setEditingId(null)} updateSuggestion={updateSuggestion} />
    }

    return (
      <div className="px-4 py-3 group/row hover:bg-bg/40 transition-colors">
        <div className="flex items-start gap-2.5">
          <Lightbulb size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-medium text-navy/85 leading-snug">{s.titre}</p>
              <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0', cfg.className)}>{cfg.label}</span>
              <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0', impCfg.className)}>{impCfg.label}</span>
            </div>
            {s.description && <p className="text-xs text-subtle mt-1 leading-snug">{s.description}</p>}
            <p className="text-[11px] text-subtle/50 mt-1.5">
              {authorName(s.auteur_id)} · {new Date(s.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
            </p>
          </div>
          {canEdit && (
            <button onClick={() => setEditingId(s.id)} title="Modifier"
              className="shrink-0 p-1 rounded-lg max-md:opacity-100 opacity-0 group-hover/row:opacity-100 text-subtle hover:text-indigo-600 hover:bg-indigo-50 transition-all">
              <Pencil size={12} />
            </button>
          )}
        </div>
        {isAdmin && (
          <div className="mt-2 ml-6 flex items-center gap-1.5">
            {s.statut === 'nouvelle' && (
              <>
                <button onClick={() => updateStatut.mutate({ id: s.id, statut: 'acceptee' })}
                  className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg transition-colors">
                  <ThumbsUp size={11} /> Accepter
                </button>
                <button onClick={() => updateStatut.mutate({ id: s.id, statut: 'rejetee' })}
                  className="flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg transition-colors">
                  <ThumbsDown size={11} /> Rejeter
                </button>
              </>
            )}
            {s.statut === 'acceptee' && (
              <button onClick={() => updateStatut.mutate({ id: s.id, statut: 'fermee' })}
                className="flex items-center gap-1 text-[11px] font-semibold text-subtle hover:text-navy hover:bg-bg px-2 py-1 rounded-lg transition-colors">
                <Archive size={11} /> Marquer traitée
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return createPortal((
    <>
      <div className="fixed inset-0 z-[10049]" onClick={onClose} />
      <div className="fixed bottom-4 z-[10050] w-[380px] max-h-[70vh] bg-card shadow-2xl flex flex-col rounded-2xl border border-border overflow-hidden"
        style={{ left: leftOffset }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <Lightbulb size={15} className="text-amber-400" />
            <div>
              <h2 className="text-sm font-bold text-navy">Propositions d'amélioration</h2>
              <p className="text-[11px] text-subtle">{nouvelles.length} nouvelle{nouvelles.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowForm(v => !v)}
              className={cn('text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors', showForm ? 'bg-indigo-50 text-indigo-600' : 'text-indigo-500 hover:bg-indigo-50')}>
              <Plus size={12} className="inline -mt-0.5" /> Proposer
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg text-subtle hover:text-navy transition-colors"><X size={15} /></button>
          </div>
        </div>

        {showForm && (
          <div className="px-4 py-3 border-b border-border bg-bg/50 shrink-0 flex flex-col gap-2">
            <input value={titre} onChange={e => setTitre(e.target.value)} autoFocus
              placeholder="Titre de la proposition…"
              className="text-sm text-navy placeholder:text-subtle/40 outline-none bg-card border border-border rounded-lg px-3 py-2 focus:border-indigo-300 transition-colors" />
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="Détails (optionnel)…"
              className="text-xs text-navy placeholder:text-subtle/40 outline-none bg-card border border-border rounded-lg px-3 py-2 focus:border-indigo-300 transition-colors resize-none" />
            <div className="flex items-center gap-1.5">
              {SUGGESTION_IMPORTANCE_LEVELS.map(lvl => (
                <button key={lvl} type="button" onClick={() => setImportance(lvl)}
                  className={cn('text-[11px] font-semibold px-2 py-1 rounded-lg border transition-colors',
                    importance === lvl ? cn(SUGGESTION_IMPORTANCE_CFG[lvl].className, 'border-transparent') : 'border-border text-subtle hover:border-indigo-200')}>
                  {SUGGESTION_IMPORTANCE_CFG[lvl].label}
                </button>
              ))}
            </div>
            <button onClick={submit} disabled={!titre.trim() || createSuggestion.isPending}
              className="text-xs font-semibold text-white bg-indigo-500 px-3 py-1.5 rounded-lg hover:bg-indigo-400 transition-colors disabled:opacity-40 self-end">
              {createSuggestion.isPending ? 'Envoi…' : 'Envoyer'}
            </button>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border/50 shrink-0">
            <ArrowUpDown size={10} className="text-subtle/50 shrink-0" />
            {([['recent', 'Récentes'], ['importance', 'Importance'], ['auteur', 'Créateur']] as [SuggestionSort, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setSortBy(key)}
                className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors',
                  sortBy === key ? 'bg-indigo-50 text-indigo-600' : 'text-subtle hover:text-navy')}>
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {suggestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-subtle/30">
              <Lightbulb size={36} className="mb-3" />
              <p className="text-xs italic">Aucune proposition pour le moment</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {nouvelles.map(s => <SuggestionRow key={s.id} s={s} />)}
              {autres.length > 0 && (
                <details className="group/done" open={nouvelles.length === 0}>
                  <summary className="flex items-center gap-2 px-4 py-2 text-[11px] text-subtle/50 uppercase tracking-wider font-semibold cursor-pointer hover:text-subtle list-none select-none">
                    <ChevronDown size={11} className="transition-transform group-open/done:rotate-0 -rotate-90" /> Traitées ({autres.length})
                  </summary>
                  <div className="divide-y divide-border/20">
                    {autres.map(s => <SuggestionRow key={s.id} s={s} />)}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  ), document.body)
}

// ── Discussion produit ──────────────────────────────────────────
function fmtDiscussionDay(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui"
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Hier'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })
}

function DiscussionPanel({ produitId, produitNom, userId, isAdmin, onClose, leftOffset }: {
  produitId: number; produitNom: string; userId: string; isAdmin: boolean; onClose: () => void; leftOffset: string
}) {
  const { data: membres = [] } = useUtilisateurs()
  const { data: produits = [] } = useProduits()
  const { data: messages = [], isLoading } = useProduitMessages(produitId)
  const addMessage = useAddProduitMessage()
  const deleteMessage = useDeleteProduitMessage()
  const uploadBg = useUploadDiscussionBg()
  const updateBgOpacity = useUpdateDiscussionBgOpacity()
  const [draft, setDraft] = useState('')
  const [showBgEditor, setShowBgEditor] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const bgFileRef = useRef<HTMLInputElement>(null)

  const produit = produits.find(p => p.id === produitId)
  const bgUrl = produit?.discussion_bg_url ?? null
  const bgOpacity = produit?.discussion_bg_opacity ?? 0.15

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [messages.length])

  function submit() {
    if (!draft.trim()) return
    addMessage.mutate({ produit_id: produitId, user_id: userId, texte: draft.trim() })
    setDraft('')
  }

  const groups: { day: string; items: typeof messages }[] = []
  for (const m of messages) {
    const day = fmtDiscussionDay(m.created_at)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.items.push(m)
    else groups.push({ day, items: [m] })
  }

  return createPortal((
    <>
      <div className="fixed inset-0 z-[10049]" onClick={onClose} />
      <div className="fixed top-12 z-[10050] w-[520px] max-w-[calc(100vw-2rem)] h-[62vh] bg-card shadow-2xl flex flex-col rounded-2xl border border-border overflow-hidden"
        style={{ left: leftOffset }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <MessageCircle size={15} className="text-indigo-400" />
            <div>
              <h2 className="text-sm font-bold text-navy">Discussion</h2>
              <p className="text-[11px] text-subtle">{produitNom}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <button onClick={() => setShowBgEditor(v => !v)} title="Personnaliser le fond"
                className={cn('p-1.5 rounded-lg transition-colors', showBgEditor ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-bg text-subtle hover:text-navy')}>
                <Camera size={14} />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg text-subtle hover:text-navy transition-colors"><X size={15} /></button>
          </div>
        </div>

        {showBgEditor && isAdmin && (
          <div className="px-5 py-3 border-b border-border bg-bg/50 shrink-0 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <input ref={bgFileRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadBg.mutate({ produitId, file: f }); e.target.value = '' }} />
              <button onClick={() => bgFileRef.current?.click()} disabled={uploadBg.isPending}
                className="ds-btn ds-btn-sm flex items-center gap-1.5">
                <Camera size={11} /> {uploadBg.isPending ? 'Envoi…' : bgUrl ? 'Changer le fond' : 'Ajouter un fond'}
              </button>
              {bgUrl && (
                <button onClick={() => uploadBg.mutate({ produitId, file: null })}
                  className="ds-btn ds-btn-sm text-rose-500 hover:bg-rose-50">Retirer</button>
              )}
            </div>
            {bgUrl && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-subtle font-semibold uppercase tracking-wide shrink-0">Opacité</span>
                <input type="range" min={0} max={1} step={0.05} defaultValue={bgOpacity}
                  onChange={e => updateBgOpacity.mutate({ produitId, opacity: Number(e.target.value) })}
                  className="flex-1 accent-indigo-500" />
                <span className="text-[11px] text-subtle tabular-nums w-8 text-right">{Math.round(bgOpacity * 100)}%</span>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3 relative">
          {bgUrl && (
            <img src={bgUrl} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{ opacity: bgOpacity }} />
          )}
          <div className="relative">
          {isLoading ? (
            <div className="flex justify-center py-10 text-subtle/40 text-xs">Chargement…</div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-subtle/30 gap-2">
              <MessageCircle size={32} />
              <p className="text-xs italic">Aucun message pour l'instant</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map(g => (
                <div key={g.day} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[10px] font-semibold text-subtle uppercase tracking-wide">{g.day}</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  {g.items.map(m => {
                    const auteur = membres.find(u => u.user_id === m.user_id)
                    const mine = m.user_id === userId
                    return (
                      <div key={m.id} className="flex items-start gap-2 group/msg bg-white/75 backdrop-blur-[2px] rounded-xl px-2.5 py-2">
                        <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
                          style={{ background: auteur?.couleur ?? '#4A4CC8' }}>
                          {auteur?.avatar_url
                            ? <img src={auteur.avatar_url} alt="" className="w-full h-full object-cover" />
                            : (auteur?.trigramme ?? auteur?.display_name?.slice(0, 2) ?? '?')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-navy">{auteur?.display_name ?? auteur?.trigramme ?? 'Utilisateur'}</span>
                            <span className="text-[10px] text-subtle/60">{new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                            {mine && (
                              <button onClick={() => deleteMessage.mutate({ id: m.id, produit_id: produitId })}
                                className="ml-auto max-md:opacity-100 opacity-0 group-hover/msg:opacity-100 text-subtle hover:text-red transition-all"><X size={10} /></button>
                            )}
                          </div>
                          <p className="text-xs text-navy/85 whitespace-pre-wrap break-words leading-snug">{m.texte}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
          </div>
        </div>

        <div className="px-3 py-3 border-t border-border bg-bg/50 shrink-0">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <MentionField as="textarea" value={draft} onChange={setDraft} membres={membres}
                onEnter={submit} dropDirection="up"
                placeholder="Écrire à l'équipe… @trg"
                className="ds-input text-xs w-full resize-none bg-card" rows={2} />
            </div>
            <button onClick={submit} disabled={!draft.trim() || addMessage.isPending}
              className="ds-btn-primary shrink-0 h-8 w-8 !p-0 flex items-center justify-center"><Send size={13} /></button>
          </div>
        </div>
      </div>
    </>
  ), document.body)
}

// ── Nav data ──────────────────────────────────────────────────
export interface NavItem { id: string; label: string; href: string; icon: React.ReactNode; adminOnly?: boolean; writeOnly?: boolean }

export const GLOBAL_NAV: NavItem[] = [
  { id: 'dashboard',    label: 'Portefeuille',           href: '/',                  icon: <LayoutDashboard size={15} /> },
  { id: 'reunion',      label: 'Réunions',               href: '/reunions',          icon: <CalendarClock size={15} />   },
  { id: 'plan-charges', label: 'Plan de charges',        href: '/plan-charges',      icon: <TrendingUp size={15} />      },
  { id: 'produits',     label: 'Produits',               href: '/produits',          icon: <Package size={15} />         },
  { id: 'roadmap',      label: 'Roadmap',                href: '/roadmap',           icon: <Milestone size={15} />       },
]

export const PRODUCT_NAV: NavItem[] = [
  { id: 'produit-dashboard', label: 'Dashboard',    href: '/produit-dashboard',  icon: <BarChart3 size={15} />      },
  { id: 'sprint',            label: 'Sprint Board', href: '/sprint',             icon: <Kanban size={15} />         },
  { id: 'taches',            label: 'Tâches Backlog', href: '/taches',           icon: <FilePlus size={15} />       },
  { id: 'dod',               label: 'Exigences',    href: '/dod',                icon: <ClipboardCheck size={15} /> },
  { id: 'activite',          label: 'Activité',     href: '/activite',           icon: <Clock size={15} />          },
  { id: 'produit-config',    label: 'Configuration', href: '/produit-config',    icon: <SlidersHorizontal size={15} />, writeOnly: true },
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
              {produitActif?.id === p.id && <span className="text-indigo-400 text-[11px]">✓</span>}
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

// ── Accès rapide : Notifications + Points à traiter ─────────────
// Placé en bas de la nav défilable (juste au-dessus du trait qui la sépare
// du footer profil), qui accueille désormais les Propositions d'amélioration.
function QuickAccessRow({ t, collapsed }: { t: SidebarTheme; collapsed: boolean }) {
  const { user, profile } = useAuth()
  const [showNotes,  setShowNotes]  = useState(false)
  const [showNotifs, setShowNotifs] = useState(false)
  const { data: quickNotes = [] }     = useQuickNotes(user?.id)
  const { data: notifications = [] }  = useNotifications(user?.id)
  const migrateLegacyNotes            = useMigrateLegacyQuickNotes()
  const unreadNotifCount = notifications.filter(n => !n.lu).length

  // Migration ponctuelle des anciennes notes localStorage → Supabase
  useEffect(() => {
    if (user?.id) migrateLegacyNotes.mutate(user.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  if (!user) return null

  return (
    <div className="flex items-stretch gap-1 mt-1.5 mb-1 shrink-0">
      <button onClick={() => setShowNotifs(true)} title="Notifications"
        className={cn('relative flex-1 min-w-0 flex items-center justify-center rounded-lg text-[12px] font-medium transition-colors py-[7px]',
          collapsed ? 'px-1.5' : 'gap-1.5 px-2', t.notesBtn)}>
        <Bell size={14} className="shrink-0" />
        {!collapsed && <span className="truncate">Notifs</span>}
        {unreadNotifCount > 0 && (
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500" />
        )}
      </button>
      <button onClick={() => setShowNotes(true)} title="Points à traiter"
        className={cn('relative flex-1 min-w-0 flex items-center justify-center rounded-lg text-[12px] font-medium transition-colors py-[7px]',
          collapsed ? 'px-1.5' : 'gap-1.5 px-2', t.notesBtn)}>
        <StickyNote size={14} className="shrink-0" />
        {!collapsed && <span className="truncate">À traiter</span>}
        {quickNotes.filter(x => !x.done).length > 0 && (
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500" />
        )}
      </button>
      {showNotifs && (
        <NotificationsPanel userId={user.id} onClose={() => setShowNotifs(false)} leftOffset={collapsed ? '4.5rem' : '14.5rem'} />
      )}
      {showNotes && (
        <QuickNotesPanel userId={user.id} userName={profile?.display_name ?? user.email ?? ''}
          onClose={() => setShowNotes(false)} leftOffset={collapsed ? '4.5rem' : '14.5rem'} />
      )}
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
  const [open,           setOpen]           = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const { data: suggestions = [] } = useSuggestions()
  const newSuggestionsCount = suggestions.filter(s => s.statut === 'nouvelle').length
  const darkMode = useDarkModeStore(s => s.dark)
  const toggleDark = useDarkModeStore(s => s.toggle)
  const running = useTimerStore(s => s.running)
  const stopTimer = useTimerStore(s => s.stop)
  const addTemps = useAddTemps()
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setTick(v => v + 1), 1000)
    return () => clearInterval(id)
  }, [running])

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
              <div className="absolute inset-0 bg-black/40 max-md:opacity-100 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Camera size={14} className="text-white" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn('text-xs font-semibold truncate', t.profileText)}>{displayName}</div>
              {isAdmin && <div className={cn('text-[11px]', t.profileSub)}>Admin</div>}
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
          <div className={cn('text-[11px] uppercase tracking-widest mb-1.5', t.sectionLabel)}>Couleur avatar</div>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {BRAND_COLORS.map(c => (
              <button key={c} type="button" onClick={() => pickColor(c)}
                className={cn('w-5 h-5 rounded-full transition-transform hover:scale-110',
                  profile?.couleur === c && 'ring-2 ring-white ring-offset-1')}
                style={{ background: c, boxShadow: profile?.couleur === c ? `0 0 0 2px ${c}40` : undefined }} />
            ))}
          </div>

          {/* Thème sidebar */}
          <div className={cn('text-[11px] uppercase tracking-widest mb-2', t.sectionLabel)}>Thème du menu</div>
          <div className="flex gap-2">
            {(Object.values(THEMES) as SidebarTheme[]).map(theme => (
              <button key={theme.id} onClick={() => onThemeChange(theme.id)}
                title={theme.label}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-xl border-2 transition-all text-[11px] font-semibold',
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

      {/* Chrono en cours (persiste tant qu'on n'a pas cliqué "Arrêter") */}
      {user && running && (
        <div className={cn('flex items-center gap-2 rounded-lg mb-0.5 px-2.5 py-[7px] bg-emerald-500/10 border border-emerald-500/20', collapsed && 'justify-center px-2')}>
          <Timer size={13} className="text-emerald-500 shrink-0" />
          {!collapsed && (
            <span className="flex-1 min-w-0 text-xs font-semibold text-emerald-600 truncate" title={running.titre}>
              {running.id_tache} · {formatElapsed(running.started_at)}
            </span>
          )}
          <button onClick={async () => {
              const minutes = elapsedMinutes(running.started_at)
              stopTimer()
              if (minutes < 1) { return }
              await addTemps.mutateAsync({ produit_id: running.produit_id, id_tache: running.id_tache, user_id: user.id, date: new Date().toISOString().slice(0, 10), minutes, note: 'Chrono' })
            }}
            title="Arrêter le chrono" className="text-emerald-600 hover:text-emerald-700 shrink-0">
            <Square size={13} />
          </button>
        </div>
      )}

      {/* Propositions d'amélioration + mode sombre */}
      {user && (
        <div className="flex items-stretch gap-1 mb-0.5">
          <button onClick={() => setShowSuggestions(true)} title="Propositions d'amélioration"
            className={cn('relative flex-1 min-w-0 flex items-center justify-center rounded-lg text-[12px] font-medium transition-colors py-[7px]',
              collapsed ? 'px-1.5' : 'gap-1.5 px-2', t.notesBtn)}>
            <Lightbulb size={14} className="shrink-0" />
            {!collapsed && <span className="truncate">Améliorations</span>}
            {newSuggestionsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500" />
            )}
          </button>
          <button onClick={toggleDark} title={darkMode ? 'Passer en mode clair' : 'Passer en mode sombre'}
            className={cn('shrink-0 flex items-center justify-center rounded-lg transition-colors py-[7px]',
              collapsed ? 'px-1.5' : 'px-2', t.notesBtn)}>
            {darkMode ? <Sun size={14} className="shrink-0" /> : <Moon size={14} className="shrink-0" />}
          </button>
          {showSuggestions && (
            <SuggestionsPanel userId={user.id} isAdmin={isAdmin} onClose={() => setShowSuggestions(false)} leftOffset={collapsed ? '4.5rem' : '14.5rem'} />
          )}
        </div>
      )}

      {/* Profil + Déconnexion — une seule rangée */}
      <div className="flex items-stretch gap-1">
        <button onClick={() => setOpen(v => !v)} title={collapsed ? displayName : undefined}
          className={cn('flex-1 min-w-0 flex items-center rounded-lg transition-colors',
            collapsed ? 'justify-center px-2 py-[7px]' : 'gap-2 px-2.5 py-[7px]', open ? t.navActive : cn(t.navHoverBg))}>
          <div className="w-6 h-6 rounded-full overflow-hidden shrink-0">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: profile?.couleur ?? '#4A4CC8' }}>
                {initiale}
              </div>
            )}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0 text-left">
              <div className={cn('text-[12px] font-medium truncate leading-tight', t.profileText)}>{displayName}</div>
              {isAdmin && <div className={cn('text-[11px] leading-tight', t.profileSub)}>Admin</div>}
            </div>
          )}
        </button>

        <button onClick={async () => {
          const { supabase } = await import('@/lib/supabase')
          await supabase.auth.signOut()
        }} title="Se déconnecter"
          className={cn('shrink-0 flex items-center justify-center rounded-lg transition-colors px-2.5', t.logoutBtn)}>
          <LogOut size={13} />
        </button>
      </div>
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
  const { user, isAdmin, canWrite } = useAuth()
  const { produitActif }      = useProduit()
  const location              = useLocation()
  const navigate              = useNavigate()
  const [showDiscussion, setShowDiscussion] = useState(false)

  useEffect(() => {
    function onOpenRequest() { setShowDiscussion(true) }
    window.addEventListener('open-discussion', onOpenRequest)
    return () => window.removeEventListener('open-discussion', onOpenRequest)
  }, [])

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
  const productItems = PRODUCT_NAV.filter(i => !i.writeOnly || isAdmin || (produitActif && canWrite(produitActif.id)))

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
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/30 bg-[#1E3A5F] shrink-0">
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

        {/* Recherche transverse */}
        <div className={cn('px-3 pt-2', collapsed && 'px-2')}>
          <button onClick={() => window.dispatchEvent(new Event('open-global-search'))}
            title={collapsed ? 'Rechercher (Ctrl+K)' : undefined}
            className={cn('w-full flex items-center rounded-lg text-[12px] font-medium transition-colors border',
              collapsed ? 'justify-center px-2 py-[7px]' : 'gap-2 px-2.5 py-[7px]', t.selectorBtn, t.divider)}>
            <Search size={13} className="shrink-0 opacity-60" />
            {!collapsed && <>
              <span className="flex-1 text-left opacity-60">Rechercher…</span>
              <kbd className="text-[10px] font-mono opacity-40">Ctrl K</kbd>
            </>}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 pb-2 overflow-y-auto overflow-x-hidden">

          {/* Mon Travail — item épinglé, séparé */}
          <div className="pt-3 pb-1.5">
            <NavRow item={{ id: 'montravail', label: 'Mon Travail', href: '/montravail', icon: <User size={15} /> }}
              active={activeId === 'montravail'} t={t} collapsed={collapsed} />
          </div>
          <div className={cn('mx-2.5 mb-1.5 h-px', t.divider)} />

          {/* Section Global */}
          {!collapsed && (
            <div className="px-2.5 pt-2 pb-1 flex items-center gap-2">
              <span className={cn('text-[11px] font-semibold uppercase tracking-[0.08em] select-none flex-1', t.sectionLabel)}>
                Global
              </span>
              <button onClick={() => navigate(isAdmin ? '/setup?tab=equipes' : '/setup?tab=metiers')} title="Réglages"
                className={cn('p-1 rounded-md transition-colors shrink-0', t.notesBtn)}>
                <Settings size={13} />
              </button>
            </div>
          )}
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
                  <span className={cn('text-[11px] font-semibold uppercase tracking-[0.08em] truncate', t.sectionLabel)}>
                    {produitActif.nom}
                  </span>
                  {sprintActif && (
                    <span className={cn('text-[11px] font-bold shrink-0', t.sprintBadge)}>
                      {sprintActif.numero}
                    </span>
                  )}
                  <button onClick={() => setShowDiscussion(true)} title="Discussion produit"
                    className={cn('ml-auto p-1 rounded-md transition-colors shrink-0', t.notesBtn)}>
                    <MessageCircle size={13} />
                  </button>
                  <button onClick={() => navigate('/setup?tab=sprints')} title="Setup produit"
                    className={cn('p-1 rounded-md transition-colors shrink-0', t.notesBtn)}>
                    <Settings size={13} />
                  </button>
                </div>
              )}
              {collapsed && (
                <div className="flex justify-center mb-2" title={produitActif.nom}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: produitActif.couleur ?? '#4A4CC8' }} />
                </div>
              )}

              <div className="flex flex-col gap-0.5">
                {productItems.map(item => <NavRow key={item.id} item={item} active={activeId === item.id} t={t} collapsed={collapsed} />)}
              </div>
            </>
          )}
        </nav>

        {/* Hors du flux défilable : toujours collé au trait séparateur du footer,
            quelle que soit la hauteur du contenu de la nav au-dessus. */}
        <div className="px-3 shrink-0">
          <QuickAccessRow t={t} collapsed={collapsed} />
        </div>

        <ProfileFooter t={t} onThemeChange={handleThemeChange} collapsed={collapsed} />
      </aside>

      {showDiscussion && produitActif && user && (
        <DiscussionPanel
          produitId={produitActif.id}
          produitNom={produitActif.nom}
          userId={user.id}
          isAdmin={isAdmin}
          onClose={() => setShowDiscussion(false)}
          leftOffset={collapsed ? '4.5rem' : '14.5rem'}
        />
      )}
    </>
  )
}
