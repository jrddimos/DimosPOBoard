import { useMemo, useRef, useState, useLayoutEffect, type CSSProperties } from 'react'
import { Tree, type NodeRendererProps, type TreeApi } from 'react-arborist'
import { ChevronRight, ChevronDown, Pencil, Trash2, ToggleLeft, ToggleRight, ShieldCheck, Shield, RotateCcw } from 'lucide-react'
import { GuideRail } from '@/components/ui/TreeGuideRail'
import { useColonneTitre, ColonneTitreHandle } from '@/components/ui/ColonneTitre'
import { useFillHeight } from '@/hooks/useFillHeight'
import { cn, naturalCompare } from '@/lib/utils'
import { EXIGENCE_TYPE_CFG, CRITICITE_CFG } from '@/constants'
import type { DodItem } from '@/hooks/useDod'

type TreeNode =
  | { id: string; kind: 'categorie'; label: string; count: number; children: TreeNode[] }
  | { id: string; kind: 'exigence'; item: DodItem }

// --col-titre : largeur max de la colonne titre, redimensionnable à la
// souris (useColonneTitre, variable posée sur le conteneur de l'arbre).
const ROW_COLUMNS = 'minmax(160px, var(--col-titre, 380px)) 104px 70px 96px'

export function ReferentielTree({ items, aStatuer, loops, canEditDod, onEdit, onDelete, onToggle, onVerify }: {
  items: DodItem[]
  aStatuer: Set<number>
  loops: Map<string, number>
  canEditDod: boolean
  onEdit: (item: DodItem) => void
  onDelete: (item: DodItem) => void
  onToggle: (item: DodItem) => void
  onVerify: (item: DodItem) => void
}) {
  const data = useMemo<TreeNode[]>(() => {
    const map: Record<string, DodItem[]> = {}
    items.forEach(item => {
      const cat = item.categorie ?? 'Sans catégorie'
      if (!map[cat]) map[cat] = []
      map[cat].push(item)
    })
    for (const catItems of Object.values(map)) catItems.sort((a, b) => naturalCompare(a.code, b.code))

    return Object.entries(map)
      .sort(([, a], [, b]) => naturalCompare(a[0].code, b[0].code))
      .map(([categorie, catItems]) => ({
        id: `cat::${categorie}`, kind: 'categorie', label: categorie, count: catItems.length,
        children: catItems.map(item => ({ id: `item::${item.id}`, kind: 'exigence', item })),
      }))
  }, [items])

  const rowHeight = 36
  const containerRef = useRef<HTMLDivElement>(null)
  const treeRef = useRef<TreeApi<TreeNode>>(null)
  const height = useFillHeight(containerRef)
  const [width, setWidth] = useState(800)
  const { width: colTitre, onMouseDown: onColResize } = useColonneTitre('dod-ref-col-titre', 380)
  useLayoutEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const ro = new ResizeObserver(entries => setWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 px-2 py-1 border-b border-border/70">
        <button onClick={() => treeRef.current?.openAll()}
          className="text-[11px] font-semibold text-subtle hover:text-navy transition-colors">Tout déplier</button>
        <span className="text-border">·</span>
        <button onClick={() => treeRef.current?.closeAll()}
          className="text-[11px] font-semibold text-subtle hover:text-navy transition-colors">Tout replier</button>
      </div>
      {/* relative + variable CSS : les lignes consomment --col-titre dans
          leur grid, la poignée (+8px = padding gauche px-2 des lignes) suit. */}
      <div ref={containerRef} className="w-full relative" style={{ '--col-titre': `${colTitre}px` } as CSSProperties}>
        <ColonneTitreHandle left={colTitre + 8} onMouseDown={onColResize} />
        <Tree<TreeNode> ref={treeRef} data={data} openByDefault width={width} height={height} rowHeight={rowHeight} indent={0}
          disableDrag={() => true}>
          {(props) => (
            <ReferentielRow {...props} aStatuer={aStatuer} loops={loops} canEditDod={canEditDod}
              onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} onVerify={onVerify} />
          )}
        </Tree>
      </div>
    </div>
  )
}

function ReferentielRow({ node, style, aStatuer, loops, canEditDod, onEdit, onDelete, onToggle, onVerify }: NodeRendererProps<TreeNode> & {
  aStatuer: Set<number>
  loops: Map<string, number>
  canEditDod: boolean
  onEdit: (item: DodItem) => void
  onDelete: (item: DodItem) => void
  onToggle: (item: DodItem) => void
  onVerify: (item: DodItem) => void
}) {
  const d = node.data
  const hasChildren = !!node.children?.length
  const rowStyle = { ...style, display: 'grid', gridTemplateColumns: ROW_COLUMNS, height: '100%', position: 'relative' as const }

  if (d.kind === 'categorie') {
    return (
      <div style={rowStyle} className="items-center gap-2 px-2 font-bold text-navy text-[13px] uppercase tracking-wide cursor-pointer hover:bg-bg/60 border-b border-border/70"
        onClick={() => node.toggle()}>
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <GuideRail node={node} />
          {hasChildren ? (node.isOpen ? <ChevronDown size={14} className="text-subtle shrink-0" /> : <ChevronRight size={14} className="text-subtle shrink-0" />) : <span className="w-[14px] shrink-0" />}
          <span className="truncate">{d.label}</span>
          <span className="text-subtle font-normal normal-case shrink-0">({d.count})</span>
        </div>
      </div>
    )
  }

  const item = d.item
  const loopCount = loops.get(item.code) ?? 0
  return (
    <div style={rowStyle}
      className={cn('items-center gap-2 px-2 text-sm border-l-2', !item.actif ? 'opacity-60 border-transparent' : item.verifiee ? 'border-green/40' : 'border-transparent')}
      title={item.description ?? undefined}>
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        <GuideRail node={node} />
        <span className="w-[13px] shrink-0" />
        <span title={CRITICITE_CFG[item.criticite]?.label} className={cn('w-2 h-2 rounded-full shrink-0', CRITICITE_CFG[item.criticite]?.dot)} />
        <span className="font-mono text-xs font-bold text-brand shrink-0">{item.code}</span>
        <span className={cn('truncate', !item.actif && 'line-through text-subtle')}>{item.titre}</span>
        {aStatuer.has(item.id) && (
          <button onClick={e => { e.stopPropagation(); canEditDod && onVerify(item) }}
            title="Toutes les US liées sont terminées — cliquer pour statuer"
            className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide bg-orange/10 text-orange">
            <Shield size={10} /> À statuer
          </button>
        )}
        {loopCount >= 2 && (
          <span title={`Revalidée ${loopCount} fois`} className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide bg-orange/10 text-orange">
            <RotateCcw size={10} /> {loopCount}ᵉ
          </span>
        )}
      </div>
      <span className={cn('shrink-0 justify-self-start truncate text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide', EXIGENCE_TYPE_CFG[item.type]?.className)}>
        {EXIGENCE_TYPE_CFG[item.type]?.label}
      </span>
      <span title={CRITICITE_CFG[item.criticite]?.label} className="text-xs text-subtle truncate">
        {CRITICITE_CFG[item.criticite]?.label.replace(/^Criticité /, '')}
      </span>
      {canEditDod ? (
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={() => onVerify(item)} title={item.verifiee ? 'Repasser à vérifier' : 'Marquer vérifiée'}
            className={cn('p-1 rounded-lg transition-colors', item.verifiee ? 'text-green hover:bg-green/10' : 'text-subtle hover:text-green hover:bg-green/10')}>
            {item.verifiee ? <ShieldCheck size={13} /> : <Shield size={13} />}
          </button>
          <button onClick={() => onToggle(item)} title={item.actif ? 'Désactiver' : 'Activer'} className="p-1 rounded-lg text-subtle hover:text-navy transition-colors">
            {item.actif ? <ToggleRight size={14} className="text-green" /> : <ToggleLeft size={14} />}
          </button>
          <button onClick={() => onEdit(item)} className="p-1 rounded-lg text-subtle hover:text-navy hover:bg-bg transition-colors"><Pencil size={12} /></button>
          <button onClick={() => onDelete(item)} className="p-1 rounded-lg text-subtle hover:text-red hover:bg-red/10 transition-colors"><Trash2 size={12} /></button>
        </div>
      ) : <span />}
    </div>
  )
}
