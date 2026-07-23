import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import { GridLayout, useContainerWidth, type Layout, type LayoutItem } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { motion } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { useUtilisateurs } from '@/hooks/useEquipes'
import { useToast } from '@/hooks/useToast'
import { confirm } from '@/components/ui/ConfirmModal'
import { useClickOutside } from '@/hooks/useClickOutside'
import {
  useDashboardViews, useCreateDashboardView, useUpdateDashboardView, useDeleteDashboardView,
  type ViewLayoutItem, type DashboardView,
} from '@/hooks/useDashboardViews'
import { WIDGETS, WIDGET_BY_KEY, portfolioKpis, AnimNumber, RagIconDot, RagLegend, COL_TIPS, CURSOR_TIP, type WidgetCtx } from './widgets'
import { cn } from '@/lib/utils'
import {
  SlidersHorizontal, Check, X, Plus, Trash2, GripVertical, Sparkles, Pencil,
  Filter, ChevronDown, Globe, CalendarDays, HeartPulse, TrendingUp, ShieldAlert, CalendarClock,
  HelpCircle,
} from 'lucide-react'
import type { Produit } from '@/hooks/useProduits'
import type { MultiScope, ProduitMetrics } from '@/utils/produitMetrics'
import type { Tache } from '@/types'

// Vue par défaut, identique pour tous — sert aussi de graine aux vues perso
const STANDARD_LAYOUT: ViewLayoutItem[] = [
  { i: 'heatmap',     x: 0, y: 0, w: 6, h: 5 },
  { i: 'avancement',  x: 6, y: 0, w: 6, h: 5 },
  { i: 'timeline',    x: 0, y: 5, w: 8, h: 4 },
  { i: 'blocages',    x: 8, y: 5, w: 4, h: 4 },
  { i: 'montravail',  x: 0, y: 9, w: 4, h: 5 },
  { i: 'repartition', x: 4, y: 9, w: 4, h: 5 },
  { i: 'budget',      x: 8, y: 9, w: 4, h: 5 },
  { i: 'roadmap',     x: 0, y: 14, w: 12, h: 6 },
]

// FL3 — suivi d'incréments livrés par initiative transverse (scorecard,
// cf. widgets.tsx + migration 0061), remplace le classeur Excel dédié.
const FL3_LAYOUT: ViewLayoutItem[] = [
  { i: 'scorecard', x: 0, y: 0, w: 12, h: 16 },
]

// Onglets "par défaut" — communs à tous, non personnels (contrairement aux
// vues de `views`) : la disposition de base sert de graine si l'utilisateur
// clique Personnaliser dessus (cf. startEditing/createNewView).
const BUILTIN_TABS: { id: string; label: string; layout: ViewLayoutItem[] }[] = [
  { id: 'std', label: 'Standard', layout: STANDARD_LAYOUT },
  { id: 'fl3', label: 'FL3',      layout: FL3_LAYOUT },
]

interface CockpitViewProps {
  produits: Produit[]
  metricsMap: Map<number, ProduitMetrics>
  scope: MultiScope
  setScope: (s: MultiScope) => void
  accessibles: Produit[]
  selectedIds: Set<number> | null
  toggleProduit: (id: number) => void
  selectAll: () => void
  allTaches: Tache[]
  // Par produit (pas un childMap global) : id_tache n'est unique qu'au sein
  // d'un produit, un index/childMap partagé sur tous les produits confondus
  // expose à des collisions entre deux produits partageant un même id_tache.
  childMapByProduit: Map<number, Record<string, Tache[]>>
  faitDoneMap: Map<string, string>
  navigate: (to: string) => void
  openProduct: (p: Produit) => void
  fmtDate: (d: Date) => string
}

// ── Filtre périmètre replié dans un popover (évite une 2e rangée) ─
function PerimetreFilter({ accessibles, selectedIds, toggleProduit, selectAll }: {
  accessibles: Produit[]
  selectedIds: Set<number> | null
  toggleProduit: (id: number) => void
  selectAll: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)

  const nbOn = selectedIds === null ? accessibles.length : selectedIds.size
  const filtered = selectedIds !== null && selectedIds.size < accessibles.length

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors',
          filtered ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-card border-border text-subtle hover:text-navy'
        )}>
        <Filter size={12} />
        Périmètre {filtered && <span className="tabular-nums">({nbOn}/{accessibles.length})</span>}
        <ChevronDown size={11} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-20 top-full left-0 mt-1.5 w-64 bg-card border border-border rounded-xl shadow-lg p-2.5">
          <div className="flex items-center justify-between mb-2 px-0.5">
            <span className="text-[11px] font-semibold text-subtle uppercase tracking-wide">Produits inclus</span>
            {filtered && (
              <button onClick={selectAll} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700">Tout sélectionner</button>
            )}
          </div>
          <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto">
            {accessibles.map(p => {
              const on = selectedIds === null || selectedIds.has(p.id)
              // Empêche de décocher le dernier produit restant : un périmètre
              // vide viderait silencieusement tous les widgets du cockpit.
              const isLast = on && (selectedIds?.size ?? accessibles.length) <= 1
              return (
                <button key={p.id} onClick={() => !isLast && toggleProduit(p.id)} disabled={isLast}
                  title={isLast ? 'Au moins un produit doit rester sélectionné' : undefined}
                  className={cn('flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors text-left',
                    isLast ? 'cursor-not-allowed opacity-60' : 'hover:bg-bg')}>
                  <span className={cn(
                    'w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors',
                    on ? 'border-transparent' : 'border-border'
                  )} style={on ? { background: p.couleur ?? '#4A4CC8' } : {}}>
                    {on && <Check size={10} className="text-white" />}
                  </span>
                  <span className={cn('flex-1 truncate', on ? 'font-semibold text-navy' : 'text-subtle')}>{p.nom}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Aide centralisée : conventions RAG + curseur temps, en un endroit
// plutôt qu'éparpillées tooltip par tooltip, widget par widget ─────
function HelpPopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)} title="Comment lire les indicateurs du cockpit"
        className={cn('flex items-center justify-center w-7 h-7 rounded-lg border transition-colors',
          open ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-card border-border text-subtle hover:text-navy')}>
        <HelpCircle size={14} />
      </button>
      {open && (
        <div className="absolute z-20 top-full right-0 mt-1.5 w-80 bg-card border border-border rounded-xl shadow-lg p-3.5">
          <p className="text-[11px] font-semibold text-subtle uppercase tracking-wide mb-2">Lire les indicateurs</p>
          <RagLegend extra={
            <span className="flex items-center gap-1">
              <span className="w-0.5 h-3 bg-navy rounded-full inline-block" /> curseur temps
            </span>
          } />
          <p className="text-[11px] text-subtle leading-relaxed mb-3">{CURSOR_TIP}</p>
          <div className="flex flex-col gap-2">
            {Object.entries(COL_TIPS).map(([label, tip]) => (
              <div key={label}>
                <p className="text-xs font-bold text-navy">{label}</p>
                <p className="text-[11px] text-subtle leading-relaxed">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Bandeau KPI ───────────────────────────────────────────────────
// Tuiles à icône gradient, même langage visuel que la Roadmap (StatTile) :
// pastille colorée à gauche + valeur/label à droite, pour une lecture
// scannable en un coup d'œil plutôt que 4 cartes au poids visuel identique.
function KpiTile({ icon, label, from, to, index, children, onClick }: {
  icon: React.ReactNode; label: string; from: string; to: string; index: number; children: React.ReactNode
  // Rend la tuile cliquable (navigation vers un produit) — sinon reste passive.
  onClick?: () => void
}) {
  return (
    <motion.div key={label}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3, ease: 'easeOut' }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }) : undefined}
      className={cn(
        'bg-card border border-border rounded-2xl px-3.5 py-3 shadow-sm flex items-center gap-3 transition-all',
        onClick && 'cursor-pointer hover:border-indigo-300 hover:shadow-md hover:-translate-y-0.5'
      )}>
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0"
        style={{ background: `linear-gradient(135deg, ${from}, ${to})`, boxShadow: `0 4px 12px -3px ${from}88` }}
      >{icon}</div>
      <div className="min-w-0 flex-1">
        {children}
        <p className="text-[11px] text-subtle truncate leading-tight">{label}</p>
      </div>
    </motion.div>
  )
}

function KpiBand({ ctx }: { ctx: WidgetCtx }) {
  const k = portfolioKpis(ctx)
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      <KpiTile index={0} icon={<HeartPulse size={16} />} label="Produits par pire indicateur RAG" from="#10b981" to="#34d399">
        <div className="flex items-center gap-2.5" title="Nombre de produits classés par leur pire indicateur (avancement, budget, date ou blocages)">
          <span className="flex items-center gap-1">
            <RagIconDot rag="green" />
            <AnimNumber value={k.g} className="text-base font-extrabold text-emerald-600" />
          </span>
          <span className="flex items-center gap-1">
            <RagIconDot rag="amber" />
            <AnimNumber value={k.a} className="text-base font-extrabold text-amber-600" />
          </span>
          <span className="flex items-center gap-1">
            <RagIconDot rag="red" />
            <AnimNumber value={k.r} className="text-base font-extrabold text-rose-600" />
          </span>
        </div>
      </KpiTile>
      <KpiTile index={1} icon={<TrendingUp size={16} />} label="Avancement du périmètre" from="#6366f1" to="#818cf8">
        <div className="flex items-baseline gap-1.5">
          <span className="text-base font-extrabold text-navy"><AnimNumber value={k.avancement} />%</span>
          {k.cursor !== null && (
            <span className={cn('text-[11px] font-semibold', k.avancement >= k.cursor ? 'text-emerald-600' : 'text-rose-600')}>
              {k.avancement >= k.cursor ? '▲' : '▼'} {k.cursor}%
            </span>
          )}
        </div>
      </KpiTile>
      <KpiTile index={2} icon={<ShieldAlert size={16} />}
        label={k.blocages > 0 ? `sur ${k.prodBloques} produit${k.prodBloques > 1 ? 's' : ''}${k.soleBlockedProduct ? ' — cliquer pour l\'ouvrir' : ''}` : 'Tout roule'}
        from={k.blocages > 0 ? '#ea580c' : '#10b981'} to={k.blocages > 0 ? '#fb923c' : '#34d399'}
        onClick={k.soleBlockedProduct ? () => ctx.openProduct(k.soleBlockedProduct!) : undefined}>
        <AnimNumber value={k.blocages} className={cn('text-base font-extrabold', k.blocages > 0 ? 'text-rose-600' : 'text-emerald-600')} />
      </KpiTile>
      <KpiTile index={3} icon={<CalendarClock size={16} />} label={k.nextDelivery ? `${ctx.fmtDate(k.nextDelivery.date)} — cliquer pour l'ouvrir` : 'Aucune date planifiée'} from="#4A4CC8" to="#8b7ff0"
        onClick={k.nextDelivery ? () => ctx.openProduct(k.nextDelivery!.p) : undefined}>
        {k.nextDelivery ? (
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: k.nextDelivery.p.couleur ?? '#4A4CC8' }} />
            <span className={cn('text-sm font-extrabold truncate', k.nextDelivery.late ? 'text-amber-600' : 'text-navy')}>{k.nextDelivery.p.nom}</span>
          </span>
        ) : <span className="text-sm font-extrabold text-subtle">—</span>}
      </KpiTile>
    </div>
  )
}

// ── Cockpit ───────────────────────────────────────────────────────
export default function CockpitView(props: CockpitViewProps) {
  const { user, isAdmin } = useAuth()
  const { data: membres = [] } = useUtilisateurs()
  const toast = useToast()

  const { data: views = [] } = useDashboardViews(user?.id, 'portefeuille')
  const createView = useCreateDashboardView()
  const updateView = useUpdateDashboardView()
  const deleteView = useDeleteDashboardView()

  // FL3 (ROCKS) est une vue stratégique réservée aux admins — Standard reste
  // commun à tous.
  const visibleBuiltinTabs = isAdmin ? BUILTIN_TABS : BUILTIN_TABS.filter(b => b.id !== 'fl3')

  // Onglet actif : 'std' ou id d'une vue perso (persisté localement)
  const [activeTab, setActiveTab] = useState<string>(() => localStorage.getItem('cockpit-tab') ?? 'std')
  useEffect(() => { localStorage.setItem('cockpit-tab', activeTab) }, [activeTab])
  // Un non-admin ayant déjà 'fl3' en localStorage (ex: perdait ses droits
  // admin depuis) ne doit pas se retrouver bloqué sur un onglet masqué.
  useEffect(() => {
    if (activeTab === 'fl3' && !isAdmin) setActiveTab('std')
  }, [activeTab, isAdmin])

  const activeView = views.find(v => String(v.id) === activeTab) ?? null
  const activeBuiltin = visibleBuiltinTabs.find(b => b.id === activeTab) ?? null
  const baseLayout: ViewLayoutItem[] = activeView ? activeView.layout : (activeBuiltin ?? visibleBuiltinTabs[0]).layout

  const [editing, setEditing]       = useState(false)
  // Layout local à l'édition en cours (drag/resize/ajout de widget) — tant
  // qu'on n'édite pas, l'affichage suit directement baseLayout (recalculé à
  // chaque rendu depuis activeTab) : aucun état à resynchroniser au clic sur
  // un onglet, donc pas de rendu transitoire avec l'ancien jeu de widgets.
  // Un tel décalage a provoqué un crash ("Rendered more hooks than during
  // the previous render") quand le layout resynchronisait un rendu trop
  // tard : le nouveau composant de widget (ex. ScorecardWidget, avec ses
  // propres hooks) héritait alors du fiber de l'ancien.
  const [editLayout, setEditLayout] = useState<ViewLayoutItem[] | null>(null)
  const layout = editing && editLayout ? editLayout : baseLayout
  const [naming, setNaming]   = useState(false)
  const [newName, setNewName] = useState('')
  // Renommage inline d'une vue perso (double-clic ou icône crayon sur son
  // onglet) — id de la vue en cours de renommage, ou null si aucune.
  const [renamingId, setRenamingId]     = useState<number | null>(null)
  const [renameValue, setRenameValue]   = useState('')

  function startRename(v: DashboardView) {
    setRenamingId(v.id)
    setRenameValue(v.nom)
  }

  async function commitRename() {
    const v = views.find(x => x.id === renamingId)
    const trimmed = renameValue.trim()
    setRenamingId(null)
    if (v && trimmed && trimmed !== v.nom) {
      await updateView.mutateAsync({ id: v.id, updates: { nom: trimmed } })
    }
  }

  // Changer d'onglet sort du mode édition et jette le brouillon local — pas
  // un useEffect sur activeTab : ça entrerait en conflit avec startEditing/
  // createNewView, qui changent aussi activeTab mais veulent au contraire
  // ENTRER en édition dans la foulée.
  function switchTab(id: string) {
    setActiveTab(id)
    setEditing(false)
    setEditLayout(null)
  }

  const monMembre = membres.find(m => m.user_id === user?.id)
  const ctx: WidgetCtx = useMemo(() => ({
    produits: props.produits,
    accessibles: props.accessibles,
    metricsMap: props.metricsMap,
    scope: props.scope,
    allTaches: props.allTaches,
    childMapByProduit: props.childMapByProduit,
    faitDoneMap: props.faitDoneMap,
    membres,
    userTrigramme: monMembre?.trigramme ?? null,
    navigate: props.navigate,
    openProduct: props.openProduct,
    fmtDate: props.fmtDate,
  }), [props.produits, props.accessibles, props.metricsMap, props.scope, props.allTaches, props.childMapByProduit, props.faitDoneMap, membres, monMembre?.trigramme, props.fmtDate, props.navigate, props.openProduct])

  const { width, containerRef, mounted } = useContainerWidth()

  const usedKeys = new Set(layout.map(l => l.i))
  const available = WIDGETS.filter(w => !usedKeys.has(w.key))

  function sanitize(l: Layout): ViewLayoutItem[] {
    return l.map((it: LayoutItem) => ({ i: it.i, x: it.x, y: it.y, w: it.w, h: it.h }))
  }

  function addWidget(key: string) {
    const def = WIDGET_BY_KEY.get(key); if (!def) return
    const maxY = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0)
    setEditLayout([...layout, { i: key, x: 0, y: maxY, w: def.defaultSize.w, h: def.defaultSize.h }])
  }

  function removeWidget(key: string) {
    setEditLayout(layout.filter(l => l.i !== key))
  }

  async function startEditing() {
    if (activeView) { setEditLayout(activeView.layout); setEditing(true); return }
    // Les onglets par défaut (Standard, FL3) ne sont pas modifiables
    // directement : on crée une copie perso, graine sur la disposition active.
    if (!user) return
    const v = await createView.mutateAsync({ user_id: user.id, nom: 'Ma vue', layout: (activeBuiltin ?? visibleBuiltinTabs[0]).layout, contexte: 'portefeuille' as const })
    setActiveTab(String(v.id))
    setEditLayout(v.layout)
    setEditing(true)
    toast('Vue "Ma vue" créée — personnalise-la puis sauvegarde')
  }

  async function saveEditing() {
    if (!activeView) return
    await updateView.mutateAsync({ id: activeView.id, updates: { layout } })
    setEditing(false)
    setEditLayout(null)
    toast('Vue sauvegardée')
  }

  async function createNewView() {
    if (!user || !newName.trim()) return
    const v = await createView.mutateAsync({ user_id: user.id, nom: newName.trim(), layout: (activeBuiltin ?? visibleBuiltinTabs[0]).layout, contexte: 'portefeuille' as const })
    setNaming(false); setNewName('')
    setActiveTab(String(v.id))
    setEditLayout(v.layout)
    setEditing(true)
  }

  async function removeView() {
    if (!activeView || !user) return
    const ok = await confirm({ title: `Supprimer la vue "${activeView.nom}" ?`, message: 'Sa disposition sera perdue.', confirmLabel: 'Supprimer', variant: 'danger' })
    if (!ok) return
    await deleteView.mutateAsync({ id: activeView.id, user_id: user.id })
    switchTab('std')
  }

  const rglLayout: Layout = layout.map(l => {
    const def = WIDGET_BY_KEY.get(l.i)
    return { ...l, minW: def?.minW ?? 2, minH: def?.minH ?? 2, static: !editing }
  })

  return (
    <div>
      {/* Rangée de contrôles unique : vues à gauche, filtres + personnalisation
          à droite — remplace les deux barres d'outils séparées (topbar page +
          onglets cockpit) d'avant, qui dupliquaient la hiérarchie visuelle. */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {visibleBuiltinTabs.map(b => (
          <button key={b.id} onClick={() => switchTab(b.id)}
            className={cn('text-xs font-semibold px-3 py-1.5 rounded-lg transition-all',
              activeTab === b.id ? 'bg-brand text-white' : 'bg-card border border-border text-subtle hover:text-navy')}>
            {b.label}
          </button>
        ))}
        {views.map(v => (
          renamingId === v.id ? (
            <input key={v.id} autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenamingId(null) }}
              className="ds-input !py-1 !px-2 text-xs w-32" />
          ) : (
            <button key={v.id} onClick={() => switchTab(String(v.id))} onDoubleClick={() => startRename(v)}
              title="Double-clic pour renommer"
              className={cn('group flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all',
                activeTab === String(v.id) ? 'bg-indigo-500 text-white' : 'bg-card border border-border text-subtle hover:text-navy')}>
              {v.nom}
              <Pencil size={10} onClick={e => { e.stopPropagation(); startRename(v) }}
                className={cn('opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity',
                  activeTab === String(v.id) ? 'text-white' : 'text-subtle')} />
            </button>
          )
        ))}
        {naming ? (
          <span className="flex items-center gap-1">
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createNewView(); if (e.key === 'Escape') setNaming(false) }}
              className="ds-input !py-1 !px-2 text-xs w-32" placeholder="Nom de la vue…" />
            <button onClick={createNewView} className="ds-btn-primary ds-btn-sm !px-2"><Check size={12} /></button>
            <button onClick={() => setNaming(false)} className="ds-btn ds-btn-sm !px-2"><X size={12} /></button>
          </span>
        ) : (
          <button onClick={() => setNaming(true)} title="Nouvelle vue personnalisée"
            className="text-xs text-subtle hover:text-indigo-600 px-2 py-1.5 rounded-lg border border-dashed border-border hover:border-indigo-300 transition-colors flex items-center gap-1">
            <Plus size={12} /> Vue
          </button>
        )}

        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          {props.accessibles.length > 1 && (
            <PerimetreFilter
              accessibles={props.accessibles} selectedIds={props.selectedIds}
              toggleProduit={props.toggleProduit} selectAll={props.selectAll}
            />
          )}
          <div className="flex gap-0.5 bg-bg border border-border rounded-lg p-0.5">
            <button onClick={() => props.setScope('global')}
              className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all',
                props.scope === 'global' ? 'bg-card shadow-sm text-navy' : 'text-subtle hover:text-navy')}>
              <Globe size={11} /> Global
            </button>
            <button onClick={() => props.setScope('trim')}
              className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all',
                props.scope === 'trim' ? 'bg-card shadow-sm text-navy' : 'text-subtle hover:text-navy')}>
              <CalendarDays size={11} /> Trimestre
            </button>
          </div>
          <HelpPopover />
          <div className="w-px h-5 bg-border mx-0.5" />
          {editing ? (
            <>
              {activeView && (
                <button onClick={removeView} title="Supprimer cette vue"
                  className="ds-btn ds-btn-sm text-rose-500 hover:bg-rose-50"><Trash2 size={12} /></button>
              )}
              <button onClick={() => { setEditLayout(null); setEditing(false) }} className="ds-btn ds-btn-sm">Annuler</button>
              <button onClick={saveEditing} disabled={updateView.isPending}
                className="ds-btn-primary ds-btn-sm flex items-center gap-1.5"><Check size={12} /> Terminer</button>
            </>
          ) : (
            <button onClick={startEditing} disabled={createView.isPending}
              className="ds-btn ds-btn-sm flex items-center gap-1.5">
              <SlidersHorizontal size={12} /> Personnaliser
            </button>
          )}
        </div>
      </div>

      {/* Bandeau KPI */}
      <KpiBand ctx={ctx} />

      {/* Bibliothèque de widgets (mode édition) */}
      {editing && (
        <div className="mb-4 bg-indigo-50/70 border border-dashed border-indigo-200 rounded-2xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={13} className="text-indigo-500" />
            <span className="text-xs font-semibold text-indigo-700">Glisse les blocs par leur poignée, redimensionne par le coin — ajoute des widgets :</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {available.length === 0 ? (
              <span className="text-xs text-subtle italic">Tous les widgets sont déjà sur la grille</span>
            ) : available.map(w => (
              <button key={w.key} onClick={() => addWidget(w.key)} title={w.description}
                className="flex items-center gap-1.5 text-xs font-semibold bg-card border border-border rounded-lg px-2.5 py-1.5 text-navy hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                {w.icon} {w.label} <Plus size={11} className="text-subtle" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Grille bento */}
      <div ref={containerRef as React.RefObject<HTMLDivElement>}>
        {mounted && (
          // key=activeTab : force un remount complet à chaque changement
          // d'onglet. Sans ça, la grille pouvait garder son état interne de
          // l'onglet précédent (des jeux de widgets très différents, ex.
          // Standard → FL3) et n'affichait la bonne disposition qu'après un
          // rechargement de page.
          <GridLayout
            key={activeTab}
            width={width}
            layout={rglLayout}
            gridConfig={{ cols: 12, rowHeight: 56, margin: [12, 12], containerPadding: [0, 0] }}
            dragConfig={{ enabled: editing, handle: '.widget-drag' }}
            resizeConfig={{ enabled: editing }}
            onLayoutChange={l => setEditLayout(sanitize(l))}
          >
            {layout.map(item => {
              const def = WIDGET_BY_KEY.get(item.i)
              if (!def) return <div key={item.i} className="hidden" />
              return (
                // Le wrapper extérieur (= .react-grid-item, reçoit la poignée de
                // redimensionnement injectée dans son coin bas-droit) reste sans
                // overflow/rounded : combinés, ces deux propriétés rognaient la
                // zone cliquable de la poignée pile dans le coin arrondi.
                // Le rendu visuel (fond, bordure, coins arrondis, scroll) est
                // reporté sur ce conteneur interne qui remplit tout l'espace.
                <div key={item.i} className="h-full">
                  <div className={cn(
                    'bg-card border border-border rounded-2xl shadow-sm h-full flex flex-col overflow-hidden transition-shadow',
                    editing && 'ring-1 ring-indigo-200 shadow-md')}>
                    <div className={cn('flex items-center gap-2 px-3.5 pt-3 pb-2 shrink-0', editing && 'widget-drag cursor-grab active:cursor-grabbing')}>
                      {editing && <GripVertical size={13} className="text-subtle/50 shrink-0" />}
                      <span className="text-indigo-500 shrink-0">{def.icon}</span>
                      <span className="text-xs font-bold text-navy uppercase tracking-wide truncate">{def.label}</span>
                      {editing && (
                        <button onClick={() => removeWidget(item.i)} onMouseDown={e => e.stopPropagation()}
                          className="ml-auto p-1 rounded hover:bg-rose-50 text-subtle hover:text-rose-600 transition-colors shrink-0">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto px-3.5 pb-3">
                      {/* createElement, pas def.render(ctx) : plusieurs widgets (ex.
                          ScorecardWidget) utilisent leurs propres hooks. Appelés comme
                          une fonction JS ordinaire, ces hooks étaient attribués au fiber
                          de CockpitView lui-même — un changement du jeu de widgets
                          affichés (ex. Standard → FL3) faisait alors varier le nombre de
                          hooks de CockpitView d'un rendu à l'autre et provoquait un
                          crash React ("Rendered more hooks than during the previous
                          render"). createElement fait de chaque widget un vrai élément
                          React, avec son propre fiber isolé. */}
                      {createElement(def.render, ctx)}
                    </div>
                  </div>
                </div>
              )
            })}
          </GridLayout>
        )}
      </div>

      {layout.length === 0 && (
        <div className="bg-card border-2 border-dashed border-border rounded-2xl flex flex-col items-center py-14 text-subtle gap-2">
          <Sparkles size={26} className="opacity-30" />
          <p className="text-sm">Grille vide — ajoute des widgets depuis la bibliothèque ci-dessus</p>
        </div>
      )}
    </div>
  )
}
