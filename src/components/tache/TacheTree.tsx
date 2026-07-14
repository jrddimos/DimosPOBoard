import { useMemo, useRef, useState, useLayoutEffect } from 'react'
import { Tree, type NodeApi, type NodeRendererProps, type TreeApi } from 'react-arborist'
import { ChevronRight, ChevronDown, Folder, Copy, Trash2, Plus, RotateCcw } from 'lucide-react'
import { StatutBadge, MoscowBadge, PrioBadge } from '@/components/ui/Badge'
import { cn, epicShortName, effortEffectif, isUS, computeTacheNumbers, buildTacheIndex } from '@/lib/utils'
import { GuideRail } from '@/components/ui/TreeGuideRail'
import { useFillHeight } from '@/hooks/useFillHeight'
import { epicFullName, useEpics, type Epic } from '@/hooks/useEpics'
import type { useUpdateTache } from '@/hooks/useTaches'
import type { Tache } from '@/types'
import { isBloqueeParDependance, type TacheDependance } from '@/hooks/useTacheDependances'

// Conteneur > US > sous-tâche, groupées visuellement sous un en-tête Epic
// (synthétique — l'Epic n'est pas une entité réelle, juste un texte sur `Tache`).
type TreeNode =
  | { id: string; kind: 'epic'; label: string; color?: string | null; count: number; effort: number; doneUS: number; totalUS: number; num?: string; children: TreeNode[] }
  | { id: string; kind: 'tache'; tache: Tache; num?: string; children?: TreeNode[] }

// Aplatit un ensemble de tâches racines en vraies US de travail, en
// traversant les Conteneurs (purement organisationnels) sans les compter.
function flattenUS(tasks: Tache[], childMap: Record<string, Tache[]>): Tache[] {
  const out: Tache[] = []
  for (const t of tasks) {
    if (t.type_tache === 'Conteneur') out.push(...flattenUS(childMap[t.id_tache] ?? [], childMap))
    else out.push(t)
  }
  return out
}

// Colonnes partagées par toutes les lignes (Epic/Conteneur/US/sous-tâche) :
// une zone libre (chevron + icône + id + titre, où vit l'indentation de
// l'arbre) puis 4 colonnes fixes — statut/priorité/MoSCoW/assigné — pour
// qu'elles s'alignent verticalement comme un vrai tableau d'une ligne à
// l'autre, même quand une ligne n'a rien à afficher dans l'une d'elles.
// Colonne titre plafonnée plus large qu'avant (600px, au lieu de 380px) pour
// laisser respirer les titres longs, mais pas illimitée (1fr poussait les
// badges Statut/Priorité/MoSCoW/Assigné trop loin à droite sur les titres
// courts) — les badges restent ensuite alignés juste après, à taille fixe.
const ROW_COLUMNS = 'minmax(160px,600px) 84px 46px 104px 32px'

function buildTacheNode(t: Tache, childMap: Record<string, Tache[]>, numbers: Map<string, string>): TreeNode {
  const subs = childMap[t.id_tache] ?? []
  return {
    id: t.id_tache, kind: 'tache', tache: t, num: numbers.get(t.id_tache),
    children: subs.length ? subs.map(s => buildTacheNode(s, childMap, numbers)) : undefined,
  }
}

export function TacheTree({
  filtered, childMap, epicsList, epicColorMap, byId, allTaches,
  selected, onToggleSelect, panelId, onOpenPanel, dependances, updateTache, onDuplicateEpic, isAdmin, onClearEpic, onQuickAdd, onAddSousTache, iterationCounts, renderExtra, showExpandControls = true,
}: {
  filtered: Tache[]
  childMap: Record<string, Tache[]>
  epicsList: Epic[]
  epicColorMap: Map<string, string | null | undefined>
  byId: Map<string, Tache>
  allTaches: Tache[]
  selected: string[]
  onToggleSelect: (id: string, checked: boolean) => void
  panelId: string | null
  onOpenPanel: (t: Tache) => void
  dependances: TacheDependance[]
  updateTache: ReturnType<typeof useUpdateTache>
  onDuplicateEpic: (epicLabel: string) => void
  isAdmin: boolean
  onClearEpic: (epicLabel: string) => void
  onQuickAdd: (epicLabel: string, conteneurParent?: Tache) => void
  onAddSousTache: (t: Tache) => void
  iterationCounts: Map<string, number>
  renderExtra?: (t: Tache) => React.ReactNode
  showExpandControls?: boolean
}) {
  const orderedEpicLabels = useMemo(() => epicsList.map(epicFullName), [epicsList])

  // Numérotation TOUJOURS calculée sur l'ensemble complet des tâches et des
  // Epics du produit — pas sur le sous-ensemble affiché — pour qu'une US
  // garde le même numéro (1.2, 3.1…) dans le backlog, la vue sprint du Setup
  // et toute vue filtrée. epicsList/filtered/childMap ne servent qu'au rendu.
  const { data: allEpics = [] } = useEpics()
  const numberingLabels = useMemo(() => allEpics.map(epicFullName), [allEpics])
  const fullById = useMemo(() => buildTacheIndex(allTaches), [allTaches])
  const fullChildMap = useMemo(() => {
    const m: Record<string, Tache[]> = {}
    allTaches.filter(t => t.parent_id).forEach(c => { if (!m[c.parent_id!]) m[c.parent_id!] = []; m[c.parent_id!].push(c) })
    return m
  }, [allTaches])
  const numbers = useMemo(
    () => computeTacheNumbers(numberingLabels, label => allTaches.filter(t => !t.parent_id && t.epic === label), fullChildMap, fullById),
    [numberingLabels, allTaches, fullChildMap, fullById],
  )

  const data = useMemo<TreeNode[]>(() => {
    const nodes: TreeNode[] = []
    orderedEpicLabels.forEach(e => {
      const tasks = filtered.filter(t => t.epic === e)
      const usList = flattenUS(tasks, childMap)
      nodes.push({
        id: `epic::${e}`,
        kind: 'epic',
        label: e,
        color: epicColorMap.get(e),
        count: tasks.length,
        effort: tasks.reduce((s, t) => s + effortEffectif(t, childMap), 0),
        doneUS: usList.filter(u => u.statut === 'Fait').length,
        totalUS: usList.length,
        num: numbers.get(`epic::${e}`),
        children: tasks.map(t => buildTacheNode(t, childMap, numbers)),
      })
    })
    return nodes
  }, [orderedEpicLabels, filtered, childMap, epicColorMap, numbers])

  const rowHeight = 36
  const containerRef = useRef<HTMLDivElement>(null)
  const treeRef = useRef<TreeApi<TreeNode>>(null)
  const height = useFillHeight(containerRef)
  const [width, setWidth] = useState(800)
  useLayoutEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const ro = new ResizeObserver(entries => setWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  async function handleMove({ dragNodes, parentNode }: { dragNodes: NodeApi<TreeNode>[]; parentNode: NodeApi<TreeNode> | null }) {
    if (!parentNode) return
    const target = parentNode.data
    for (const dn of dragNodes) {
      if (dn.data.kind !== 'tache') continue
      const dragged = dn.data.tache
      if (target.kind === 'epic') {
        await updateTache.mutateAsync({ id_tache: dragged.id_tache, updates: { parent_id: null, epic: target.label } })
      } else {
        await updateTache.mutateAsync({ id_tache: dragged.id_tache, updates: { parent_id: target.tache.id_tache, epic: target.tache.epic ?? dragged.epic } })
      }
    }
  }

  return (
    <div className="w-full">
      {showExpandControls && (
        <div className="flex items-center gap-2 px-2 py-1 border-b border-border/70">
          <button onClick={() => treeRef.current?.openAll()}
            className="text-[11px] font-semibold text-subtle hover:text-navy transition-colors">Tout déplier</button>
          <span className="text-border">·</span>
          <button onClick={() => treeRef.current?.closeAll()}
            className="text-[11px] font-semibold text-subtle hover:text-navy transition-colors">Tout replier</button>
        </div>
      )}
      <div ref={containerRef} className="w-full">
        <Tree<TreeNode>
          ref={treeRef}
          data={data}
          openByDefault
          width={width}
          height={height}
          rowHeight={rowHeight}
          indent={0}
          renderCursor={TacheDropCursor}
          disableDrag={(d: TreeNode) => d.kind === 'epic' || d.tache.type_tache === 'Conteneur'}
          disableDrop={({ parentNode, dragNodes }) => {
            const target = parentNode.data
            if (target.kind === 'epic') return false
            if (target.kind === 'tache' && target.tache.type_tache === 'Conteneur') return false
            // cible = US : refusé si la tâche déplacée a elle-même des sous-tâches (pas de 4e niveau)
            return dragNodes.some(dn => dn.data.kind === 'tache' && (childMap[dn.data.tache.id_tache]?.length ?? 0) > 0)
          }}
          onMove={handleMove}
        >
          {(props) => (
            <TacheTreeRow {...props} byId={byId} allTaches={allTaches} dependances={dependances} childMap={childMap}
              selected={selected} onToggleSelect={onToggleSelect} panelId={panelId} onOpenPanel={onOpenPanel}
              onDuplicateEpic={onDuplicateEpic} isAdmin={isAdmin} onClearEpic={onClearEpic} onQuickAdd={onQuickAdd}
              onAddSousTache={onAddSousTache} iterationCounts={iterationCounts} renderExtra={renderExtra} />
          )}
        </Tree>
      </div>
    </div>
  )
}

// Ligne de dépôt (drag & drop) aux couleurs de l'app plutôt que le bleu
// générique par défaut de react-arborist.
function TacheDropCursor({ top, left, indent }: { top: number; left: number; indent: number }) {
  return (
    <div className="absolute flex items-center pointer-events-none z-10" style={{ top: top - 2, left, right: indent }}>
      <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />
      <div className="flex-1 h-0.5 bg-indigo-600 rounded-full" />
    </div>
  )
}

function TacheTreeRow({ node, style, dragHandle, byId, allTaches, dependances, childMap, selected, onToggleSelect, panelId, onOpenPanel, onDuplicateEpic, isAdmin, onClearEpic, onQuickAdd, onAddSousTache, iterationCounts, renderExtra }: NodeRendererProps<TreeNode> & {
  byId: Map<string, Tache>
  allTaches: Tache[]
  dependances: TacheDependance[]
  childMap: Record<string, Tache[]>
  selected: string[]
  onToggleSelect: (id: string, checked: boolean) => void
  panelId: string | null
  onOpenPanel: (t: Tache) => void
  onDuplicateEpic: (epicLabel: string) => void
  isAdmin: boolean
  onClearEpic: (epicLabel: string) => void
  onQuickAdd: (epicLabel: string, conteneurParent?: Tache) => void
  onAddSousTache: (t: Tache) => void
  iterationCounts: Map<string, number>
  renderExtra?: (t: Tache) => React.ReactNode
}) {
  const d = node.data
  const hasChildren = !!node.children?.length

  if (d.kind === 'epic') {
    const pct = d.totalUS > 0 ? Math.round(d.doneUS / d.totalUS * 100) : 0
    return (
      <div style={{ ...style, display: 'grid', gridTemplateColumns: ROW_COLUMNS, height: '100%', position: 'relative' }} ref={dragHandle}
        className="items-center gap-2 px-2 font-bold text-navy text-[13px] uppercase tracking-wide cursor-pointer hover:bg-bg/60 border-b border-border/70"
        onClick={() => node.toggle()}>
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <GuideRail node={node} />
          {hasChildren ? (node.isOpen ? <ChevronDown size={14} className="text-subtle shrink-0" /> : <ChevronRight size={14} className="text-subtle shrink-0" />) : <span className="w-[14px] shrink-0" />}
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color ?? '#4A4CC8' }} />
          {d.num && <span className="shrink-0 font-mono text-[10px] text-subtle/70 bg-bg px-1 rounded">{d.num}</span>}
          <span className="truncate">{epicShortName(d.label)}</span>
          <span className="text-subtle font-normal normal-case text-[9px] shrink-0">{d.count} US · {d.effort}j</span>
          <button onClick={e => { e.stopPropagation(); onDuplicateEpic(d.label) }} title="Dupliquer l'Epic (avec tout son contenu)"
            className="shrink-0 p-1 rounded normal-case text-subtle hover:text-indigo-600 hover:bg-card transition-colors">
            <Copy size={11} />
          </button>
          <button onClick={e => { e.stopPropagation(); onQuickAdd(d.label) }} title="Ajouter un Conteneur ou une US dans cet Epic"
            className="shrink-0 p-1 rounded normal-case text-subtle hover:text-green hover:bg-green/10 transition-colors">
            <Plus size={12} />
          </button>
          {isAdmin && (
            <button onClick={e => { e.stopPropagation(); onClearEpic(d.label) }} title="Vider l'Epic (supprime définitivement toutes ses tâches)"
              className="shrink-0 p-1 rounded normal-case text-subtle hover:text-red hover:bg-red/10 transition-colors">
              <Trash2 size={11} />
            </button>
          )}
          {d.totalUS > 0 && (
            <div className="flex items-center gap-1.5 w-32 shrink-0 normal-case font-normal" title={`${d.doneUS}/${d.totalUS} US terminées`}>
              <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[11px] font-semibold shrink-0 w-8 text-right">{pct}%</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  const t = d.tache
  const isConteneur = t.type_tache === 'Conteneur'
  const isTacheUS = isUS(t, byId)
  const isSousTacheRow = !isConteneur && !isTacheUS
  const blockers = isTacheUS ? isBloqueeParDependance(t.id_tache, dependances, allTaches) : []
  const subs = childMap[t.id_tache] ?? []

  return (
    <div style={{ ...style, display: 'grid', gridTemplateColumns: ROW_COLUMNS, height: '100%', position: 'relative' }} ref={dragHandle}
      className={cn('items-center gap-2 px-2 text-sm cursor-pointer border-l-2 rounded-r-md transition-colors',
        isConteneur ? 'border-amber-300 bg-amber-50/40 hover:bg-amber-50' : 'border-transparent hover:bg-bg/60',
        panelId === t.id_tache && '!bg-indigo-100 !border-indigo-400')}
      onClick={() => onOpenPanel(t)}>
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        <GuideRail node={node} />
        {hasChildren ? (
          <button onClick={e => { e.stopPropagation(); node.toggle() }} className="text-subtle hover:text-indigo-600 shrink-0">
            {node.isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : <span className="w-[13px] shrink-0" />}

        {(isTacheUS || isConteneur) && (
          <input type="checkbox" checked={selected.includes(t.id_tache)} className="accent-indigo-500 shrink-0 w-3.5 h-3.5"
            onClick={e => e.stopPropagation()}
            onChange={e => onToggleSelect(t.id_tache, e.target.checked)} />
        )}

        {isConteneur && <Folder size={14} className="text-amber-500 fill-amber-100 shrink-0" />}

        {d.num && <span className={cn('font-semibold whitespace-nowrap shrink-0', isTacheUS ? 'text-indigo-600' : 'text-subtle')}>{d.num}</span>}
        <span className="shrink-0 font-mono text-[9px] text-subtle/70 bg-bg px-1 rounded">{t.id_tache}</span>
        <span className={cn('truncate', isSousTacheRow && 'italic text-subtle', isConteneur && 'font-semibold text-navy')}>{t.titre}</span>
        {isConteneur && <span className="shrink-0 text-[9px] text-subtle">{subs.length} US · {effortEffectif(t, childMap)}j</span>}
        {isConteneur && (
          <button onClick={e => { e.stopPropagation(); onQuickAdd(t.epic ?? '', t) }} title="Ajouter une US dans ce Conteneur"
            className="shrink-0 p-1 rounded text-subtle hover:text-green hover:bg-green/10 transition-colors">
            <Plus size={12} />
          </button>
        )}
        {isTacheUS && (iterationCounts.get(t.id_tache) ?? 0) > 0 && (
          <span title={`${iterationCounts.get(t.id_tache) ?? 0} itérations`}
            className="shrink-0 flex items-center gap-0.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full">
            <RotateCcw size={9} /> {iterationCounts.get(t.id_tache) ?? 0}
          </span>
        )}
        {isTacheUS && (
          <button onClick={e => { e.stopPropagation(); onAddSousTache(t) }} title="Ajouter une sous-tâche"
            className="shrink-0 p-1 rounded text-subtle hover:text-green hover:bg-green/10 transition-colors">
            <Plus size={12} />
          </button>
        )}
        {isTacheUS && renderExtra && (
          <span className="shrink-0" onClick={e => e.stopPropagation()}>{renderExtra(t)}</span>
        )}
        {blockers.length > 0 && (
          <span title={`Bloquée par : ${blockers.join(', ')}`}
            className="shrink-0 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
            ⛔ {blockers.length}
          </span>
        )}
      </div>

      {isConteneur ? null : (
        <>
          <span className="min-w-0 overflow-hidden"><StatutBadge value={t.statut} className="truncate" /></span>
          <span className="min-w-0 overflow-hidden">{isTacheUS && t.priorite && <PrioBadge value={t.priorite} />}</span>
          <span className="min-w-0 overflow-hidden">{isTacheUS && t.moscow && <MoscowBadge value={t.moscow} className="truncate" />}</span>
          <span className="min-w-0 overflow-hidden">
            {isTacheUS && t.assigne_a && (
              <span title={t.assigne_a} className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                {t.assigne_a}
              </span>
            )}
          </span>
        </>
      )}
    </div>
  )
}
