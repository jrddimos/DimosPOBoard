import { useEffect, useMemo, useState } from 'react'
import { GridLayout, useContainerWidth, type Layout, type LayoutItem } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { motion } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { useUtilisateurs } from '@/hooks/useEquipes'
import { useToast } from '@/hooks/useToast'
import { confirm } from '@/components/ui/ConfirmModal'
import {
  useDashboardViews, useCreateDashboardView, useUpdateDashboardView, useDeleteDashboardView,
  type ViewLayoutItem,
} from '@/hooks/useDashboardViews'
import { WIDGETS, WIDGET_BY_KEY, portfolioKpis, AnimNumber, type WidgetCtx } from './widgets'
import { cn } from '@/lib/utils'
import {
  SlidersHorizontal, Check, X, Plus, Trash2, GripVertical, Sparkles,
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

interface CockpitViewProps {
  produits: Produit[]
  metricsMap: Map<number, ProduitMetrics>
  scope: MultiScope
  allTaches: Tache[]
  navigate: (to: string) => void
  openProduct: (p: Produit) => void
  fmtDate: (d: Date) => string
}

// ── Bandeau KPI ───────────────────────────────────────────────────
function KpiBand({ ctx }: { ctx: WidgetCtx }) {
  const k = portfolioKpis(ctx)
  const cards = [
    {
      label: 'Santé portefeuille',
      body: (
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1"><AnimNumber value={k.g} className="text-xl font-extrabold text-emerald-600" /><span className="w-2 h-2 rounded-full bg-emerald-400" /></span>
          <span className="flex items-center gap-1"><AnimNumber value={k.a} className="text-xl font-extrabold text-amber-600" /><span className="w-2 h-2 rounded-full bg-amber-400" /></span>
          <span className="flex items-center gap-1"><AnimNumber value={k.r} className="text-xl font-extrabold text-rose-600" /><span className="w-2 h-2 rounded-full bg-rose-500" /></span>
        </div>
      ),
    },
    {
      label: 'Avancement du périmètre',
      body: (
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-extrabold text-navy"><AnimNumber value={k.avancement} />%</span>
          {k.cursor !== null && (
            <span className={cn('text-xs font-semibold', k.avancement >= k.cursor ? 'text-emerald-600' : 'text-rose-600')}>
              {k.avancement >= k.cursor ? '▲' : '▼'} curseur {k.cursor}%
            </span>
          )}
        </div>
      ),
    },
    {
      label: 'Blocages ouverts',
      body: (
        <div className="flex items-baseline gap-2">
          <AnimNumber value={k.blocages} className={cn('text-xl font-extrabold', k.blocages > 0 ? 'text-rose-600' : 'text-emerald-600')} />
          <span className="text-xs text-subtle">{k.blocages > 0 ? `sur ${k.prodBloques} produit${k.prodBloques > 1 ? 's' : ''}` : 'tout roule'}</span>
        </div>
      ),
    },
    {
      label: 'Prochaine livraison',
      body: k.nextDelivery ? (
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-sm font-extrabold text-navy truncate">{k.nextDelivery.p.nom}</span>
          <span className={cn('text-xs font-semibold shrink-0', k.nextDelivery.late ? 'text-amber-600' : 'text-emerald-600')}>
            {ctx.fmtDate(k.nextDelivery.date)}
          </span>
        </div>
      ) : <span className="text-xs text-subtle italic">Aucune date planifiée</span>,
    },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      {cards.map((c, i) => (
        <motion.div key={c.label}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.35, ease: 'easeOut' }}
          className="bg-card border border-border rounded-2xl px-4 py-3 shadow-sm">
          <div className="text-[11px] font-semibold text-subtle uppercase tracking-wide mb-1">{c.label}</div>
          {c.body}
        </motion.div>
      ))}
    </div>
  )
}

// ── Cockpit ───────────────────────────────────────────────────────
export default function CockpitView(props: CockpitViewProps) {
  const { user } = useAuth()
  const { data: membres = [] } = useUtilisateurs()
  const toast = useToast()

  const { data: views = [] } = useDashboardViews(user?.id, 'portefeuille')
  const createView = useCreateDashboardView()
  const updateView = useUpdateDashboardView()
  const deleteView = useDeleteDashboardView()

  // Onglet actif : 'std' ou id d'une vue perso (persisté localement)
  const [activeTab, setActiveTab] = useState<string>(() => localStorage.getItem('cockpit-tab') ?? 'std')
  useEffect(() => { localStorage.setItem('cockpit-tab', activeTab) }, [activeTab])

  const activeView = views.find(v => String(v.id) === activeTab) ?? null
  const baseLayout: ViewLayoutItem[] = activeView ? activeView.layout : STANDARD_LAYOUT

  const [editing, setEditing] = useState(false)
  const [layout, setLayout]   = useState<ViewLayoutItem[]>(baseLayout)
  const [naming, setNaming]   = useState(false)
  const [newName, setNewName] = useState('')

  // Resynchronise quand on change d'onglet ou que la vue arrive de la DB
  useEffect(() => { setLayout(baseLayout); setEditing(false) }, [activeTab, activeView?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  const monMembre = membres.find(m => m.user_id === user?.id)
  const ctx: WidgetCtx = useMemo(() => ({
    produits: props.produits,
    metricsMap: props.metricsMap,
    scope: props.scope,
    allTaches: props.allTaches,
    membres,
    userTrigramme: monMembre?.trigramme ?? null,
    navigate: props.navigate,
    openProduct: props.openProduct,
    fmtDate: props.fmtDate,
  }), [props.produits, props.metricsMap, props.scope, props.allTaches, membres, monMembre?.trigramme])

  const { width, containerRef, mounted } = useContainerWidth()

  const usedKeys = new Set(layout.map(l => l.i))
  const available = WIDGETS.filter(w => !usedKeys.has(w.key))

  function sanitize(l: Layout): ViewLayoutItem[] {
    return l.map((it: LayoutItem) => ({ i: it.i, x: it.x, y: it.y, w: it.w, h: it.h }))
  }

  function addWidget(key: string) {
    const def = WIDGET_BY_KEY.get(key); if (!def) return
    const maxY = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0)
    setLayout(prev => [...prev, { i: key, x: 0, y: maxY, w: def.defaultSize.w, h: def.defaultSize.h }])
  }

  function removeWidget(key: string) {
    setLayout(prev => prev.filter(l => l.i !== key))
  }

  async function startEditing() {
    if (activeView) { setEditing(true); return }
    // La vue Standard n'est pas modifiable : on crée une copie perso
    if (!user) return
    const v = await createView.mutateAsync({ user_id: user.id, nom: 'Ma vue', layout: STANDARD_LAYOUT, contexte: 'portefeuille' as const })
    setActiveTab(String(v.id))
    setEditing(true)
    toast('Vue "Ma vue" créée — personnalise-la puis sauvegarde')
  }

  async function saveEditing() {
    if (!activeView) return
    await updateView.mutateAsync({ id: activeView.id, updates: { layout } })
    setEditing(false)
    toast('Vue sauvegardée')
  }

  async function createNewView() {
    if (!user || !newName.trim()) return
    const v = await createView.mutateAsync({ user_id: user.id, nom: newName.trim(), layout: STANDARD_LAYOUT, contexte: 'portefeuille' as const })
    setNaming(false); setNewName('')
    setActiveTab(String(v.id))
    setEditing(true)
  }

  async function removeView() {
    if (!activeView || !user) return
    const ok = await confirm({ title: `Supprimer la vue "${activeView.nom}" ?`, message: 'Sa disposition sera perdue.', confirmLabel: 'Supprimer', variant: 'danger' })
    if (!ok) return
    await deleteView.mutateAsync({ id: activeView.id, user_id: user.id })
    setActiveTab('std')
  }

  const rglLayout: Layout = layout.map(l => {
    const def = WIDGET_BY_KEY.get(l.i)
    return { ...l, minW: def?.minW ?? 2, minH: def?.minH ?? 2, static: !editing }
  })

  return (
    <div>
      {/* Onglets de vues + actions */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        <button onClick={() => setActiveTab('std')}
          className={cn('text-xs font-semibold px-3 py-1.5 rounded-lg transition-all',
            activeTab === 'std' ? 'bg-brand text-white' : 'bg-card border border-border text-subtle hover:text-navy')}>
          Standard
        </button>
        {views.map(v => (
          <button key={v.id} onClick={() => setActiveTab(String(v.id))}
            className={cn('text-xs font-semibold px-3 py-1.5 rounded-lg transition-all',
              activeTab === String(v.id) ? 'bg-indigo-500 text-white' : 'bg-card border border-border text-subtle hover:text-navy')}>
            {v.nom}
          </button>
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

        <div className="ml-auto flex items-center gap-1.5">
          {editing ? (
            <>
              {activeView && (
                <button onClick={removeView} title="Supprimer cette vue"
                  className="ds-btn ds-btn-sm text-rose-500 hover:bg-rose-50"><Trash2 size={12} /></button>
              )}
              <button onClick={() => { setLayout(baseLayout); setEditing(false) }} className="ds-btn ds-btn-sm">Annuler</button>
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
          <GridLayout
            width={width}
            layout={rglLayout}
            gridConfig={{ cols: 12, rowHeight: 56, margin: [12, 12], containerPadding: [0, 0] }}
            dragConfig={{ enabled: editing, handle: '.widget-drag' }}
            resizeConfig={{ enabled: editing }}
            onLayoutChange={l => setLayout(sanitize(l))}
          >
            {layout.map(item => {
              const def = WIDGET_BY_KEY.get(item.i)
              if (!def) return <div key={item.i} className="hidden" />
              return (
                <div key={item.i} className={cn(
                  'bg-card border border-border rounded-2xl shadow-sm flex flex-col overflow-hidden transition-shadow',
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
                    {def.render(ctx)}
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
