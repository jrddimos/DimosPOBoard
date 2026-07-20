import { useEffect, useState } from 'react'
import { GridLayout, useContainerWidth, type Layout, type LayoutItem } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/useToast'
import {
  useDashboardViews, useCreateDashboardView, useUpdateDashboardView, useDeleteDashboardView,
  type ViewLayoutItem, type ViewContexte,
} from '@/hooks/useDashboardViews'
import { cn } from '@/lib/utils'
import { SlidersHorizontal, Check, X, Plus, GripVertical, RotateCcw } from 'lucide-react'

export interface BentoItem {
  key: string
  label: string
  minW?: number
  minH?: number
  defaultSize?: { w: number; h: number }
  content: React.ReactNode
}

interface BentoGridProps {
  /** Clé de persistance dans user_dashboard_views (une seule disposition par contexte) */
  contexte: ViewContexte
  /** Tous les blocs disponibles ; ceux absents du layout vont dans la bibliothèque */
  items: BentoItem[]
  /** Disposition par défaut — reproduit l'agencement historique */
  defaultLayout: ViewLayoutItem[]
  /** false = grille figée sans bouton Personnaliser (ex : overlay réunion) */
  editable?: boolean
  rowHeight?: number
  /** Contrôle externe du mode édition — l'appelant affiche son propre bouton
      "Personnaliser" ailleurs dans sa page (ex : à côté d'un autre sélecteur)
      plutôt que celui interne, ci-dessous. Non fourni = état interne, comme
      avant (Cockpit, inchangé). */
  isEditing?: boolean
  onEditingChange?: (v: boolean) => void
  /** Masque le bouton "Personnaliser" interne — à utiliser avec isEditing/
      onEditingChange ci-dessus, sinon plus aucun moyen d'entrer en édition. */
  hideToggle?: boolean
}

// Grille bento générique : les blocs sont rendus tels quels (aucun chrome
// ajouté hors édition) ; la personnalisation est sauvegardée par utilisateur.
export function BentoGrid({
  contexte, items, defaultLayout, editable = true, rowHeight = 56,
  isEditing, onEditingChange, hideToggle = false,
}: BentoGridProps) {
  const { user } = useAuth()
  const toast = useToast()
  const itemByKey = new Map(items.map(i => [i.key, i]))

  const { data: views = [] } = useDashboardViews(editable ? user?.id : undefined, contexte)
  const createView = useCreateDashboardView()
  const updateView = useUpdateDashboardView()
  const deleteView = useDeleteDashboardView()

  // Une seule disposition par contexte : la première ligne trouvée
  const saved = views[0] ?? null
  const baseLayout = (saved?.layout?.length ? saved.layout : defaultLayout)
    .filter(l => itemByKey.has(l.i))

  const [editingState, setEditingState] = useState(false)
  const editing = isEditing ?? editingState
  const setEditing = onEditingChange ?? setEditingState
  const [layout, setLayout]   = useState<ViewLayoutItem[]>(baseLayout)

  useEffect(() => {
    if (!editing) setLayout(baseLayout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.id, JSON.stringify(saved?.layout)])

  const { width, containerRef, mounted } = useContainerWidth()

  const usedKeys = new Set(layout.map(l => l.i))
  const available = items.filter(i => !usedKeys.has(i.key))

  function addItem(key: string) {
    const def = itemByKey.get(key); if (!def) return
    const maxY = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0)
    setLayout(prev => [...prev, { i: key, x: 0, y: maxY, w: def.defaultSize?.w ?? 4, h: def.defaultSize?.h ?? 3 }])
  }

  async function save() {
    if (!user) return
    if (saved) await updateView.mutateAsync({ id: saved.id, updates: { layout } })
    else await createView.mutateAsync({ user_id: user.id, nom: 'custom', layout, contexte })
    setEditing(false)
    toast('Disposition sauvegardée')
  }

  async function reset() {
    if (saved && user) await deleteView.mutateAsync({ id: saved.id, user_id: user.id })
    setLayout(defaultLayout.filter(l => itemByKey.has(l.i)))
    setEditing(false)
    toast('Disposition par défaut restaurée')
  }

  const rglLayout: Layout = layout.map(l => {
    const def = itemByKey.get(l.i)
    return { ...l, minW: def?.minW ?? 2, minH: def?.minH ?? 2, static: !editing }
  })

  return (
    <div>
      {editable && (editing || !hideToggle) && (
        <div className="flex items-center gap-1.5 mb-2 justify-end">
          {editing ? (
            <>
              <div className="flex flex-wrap gap-1.5 mr-auto items-center">
                {available.length > 0 && available.map(i => (
                  <button key={i.key} onClick={() => addItem(i.key)}
                    className="flex items-center gap-1 text-[11px] font-semibold bg-card border border-border rounded-lg px-2 py-1 text-navy hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                    {i.label} <Plus size={10} className="text-subtle" />
                  </button>
                ))}
              </div>
              <button onClick={reset} title="Revenir à la disposition par défaut"
                className="ds-btn ds-btn-sm flex items-center gap-1"><RotateCcw size={11} /> Défaut</button>
              <button onClick={() => { setLayout(baseLayout); setEditing(false) }} className="ds-btn ds-btn-sm">Annuler</button>
              <button onClick={save} disabled={updateView.isPending || createView.isPending}
                className="ds-btn-primary ds-btn-sm flex items-center gap-1.5"><Check size={12} /> Terminer</button>
            </>
          ) : !hideToggle ? (
            <button onClick={() => setEditing(true)}
              className="ds-btn ds-btn-sm flex items-center gap-1.5">
              <SlidersHorizontal size={12} /> Personnaliser
            </button>
          ) : null}
        </div>
      )}

      <div ref={containerRef as React.RefObject<HTMLDivElement>}>
        {mounted && (
          <GridLayout
            width={width}
            layout={rglLayout}
            gridConfig={{ cols: 12, rowHeight, margin: [12, 12], containerPadding: [0, 0] }}
            dragConfig={{ enabled: editing, handle: '.bento-drag' }}
            resizeConfig={{ enabled: editing }}
            onLayoutChange={l => setLayout(l.map((it: LayoutItem) => ({ i: it.i, x: it.x, y: it.y, w: it.w, h: it.h })))}
          >
            {layout.map(item => {
              const def = itemByKey.get(item.i)
              if (!def) return <div key={item.i} className="hidden" />
              return (
                <div key={item.i} className={cn('relative h-full', editing && 'rounded-2xl ring-1 ring-indigo-200')}>
                  {/* Le bloc d'origine, rendu tel quel */}
                  <div className="h-full [&>*]:h-full">{def.content}</div>
                  {/* Chrome d'édition superposé — invisible hors mode Personnaliser */}
                  {editing && (
                    <div className="bento-drag absolute inset-x-0 top-0 h-8 z-10 flex items-center gap-1.5 px-2 rounded-t-2xl bg-indigo-500/85 text-white cursor-grab active:cursor-grabbing">
                      <GripVertical size={12} className="shrink-0" />
                      <span className="text-[11px] font-bold uppercase tracking-wide truncate flex-1">{def.label}</span>
                      <button onClick={() => setLayout(prev => prev.filter(l => l.i !== item.i))}
                        onMouseDown={e => e.stopPropagation()}
                        className="p-0.5 rounded hover:bg-white/20 transition-colors shrink-0">
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </GridLayout>
        )}
      </div>
    </div>
  )
}
