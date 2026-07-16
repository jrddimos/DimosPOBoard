import { useMemo, useRef, useState, useLayoutEffect, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tree, type NodeRendererProps, type TreeApi } from 'react-arborist'
import { ChevronRight, ChevronDown, ShieldCheck, Shield, AlertTriangle } from 'lucide-react'
import { StatutBadge } from '@/components/ui/Badge'
import { GuideRail } from '@/components/ui/TreeGuideRail'
import { useColonneTitre, ColonneTitreHandle } from '@/components/ui/ColonneTitre'
import { useFillHeight } from '@/hooks/useFillHeight'
import { cn, epicShortName } from '@/lib/utils'
import { EXIGENCE_TYPE_CFG, CRITICITE_CFG } from '@/constants'
import type { DodItem } from '@/hooks/useDod'
import type { Tache } from '@/types'

type Group = { key: string; tasks: Tache[]; color: string }

type TreeNode =
  | { id: string; kind: 'group'; label: string; color: string; count: number; verified: number; special?: boolean; children: TreeNode[] }
  | { id: string; kind: 'exigence'; item: DodItem; tasks: Tache[]; children?: TreeNode[] }
  | { id: string; kind: 'tache'; tache: Tache }

// --col-titre : largeur max de la colonne titre, redimensionnable à la
// souris (useColonneTitre, variable posée sur le conteneur de l'arbre).
const ROW_COLUMNS = 'minmax(160px, var(--col-titre, 380px)) 104px 70px 28px'

function codesOf(lien: string | null): string[] {
  return (lien ?? '').split(/[,;]/).map(s => s.trim()).filter(Boolean)
}

export function CouvertureTree({ groups, dodItems, groupBy, allParents }: {
  groups: Group[]
  dodItems: DodItem[]
  groupBy: 'epic' | 'jalon'
  allParents: Tache[]
}) {
  const navigate = useNavigate()

  const data = useMemo<TreeNode[]>(() => {
    const groupNodes: TreeNode[] = groups.map(g => {
      const codes = new Set(g.tasks.flatMap(t => codesOf(t.lien_dod)))
      const exigences = dodItems.filter(d => codes.has(d.code))
      return {
        id: `group::${g.key}`, kind: 'group', label: g.key, color: g.color,
        count: exigences.length, verified: exigences.filter(d => d.verifiee).length,
        children: exigences.map(item => {
          const tasks = g.tasks.filter(t => codesOf(t.lien_dod).includes(item.code))
          return {
            id: `group::${g.key}::${item.code}`, kind: 'exigence', item, tasks,
            children: tasks.map(t => ({ id: `group::${g.key}::${item.code}::${t.id_tache}`, kind: 'tache', tache: t })),
          }
        }),
      }
    })

    const coveredCodes = new Set(allParents.flatMap(t => codesOf(t.lien_dod)))
    const uncovered = dodItems.filter(d => d.actif && !coveredCodes.has(d.code))
    if (uncovered.length) {
      groupNodes.push({
        id: 'group::__uncovered', kind: 'group', label: '⚠ Exigences non couvertes', color: '#EF4444',
        count: uncovered.length, verified: uncovered.filter(d => d.verifiee).length, special: true,
        children: uncovered.map(item => ({ id: `uncovered::${item.code}`, kind: 'exigence', item, tasks: [] })),
      })
    }
    return groupNodes
  }, [groups, dodItems, allParents])

  const rowHeight = 36
  const containerRef = useRef<HTMLDivElement>(null)
  const treeRef = useRef<TreeApi<TreeNode>>(null)
  const height = useFillHeight(containerRef)
  const [width, setWidth] = useState(800)
  const { width: colTitre, onMouseDown: onColResize } = useColonneTitre('dod-couv-col-titre', 380)
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
          {(props) => <CouvertureRow {...props} groupBy={groupBy} onOpenTache={t => navigate(`/taches?focus=${t.id_tache}`)} />}
        </Tree>
      </div>
    </div>
  )
}

function CouvertureRow({ node, style, groupBy, onOpenTache }: NodeRendererProps<TreeNode> & {
  groupBy: 'epic' | 'jalon'
  onOpenTache: (t: Tache) => void
}) {
  const d = node.data
  const hasChildren = !!node.children?.length
  const rowStyle = { ...style, display: 'grid', gridTemplateColumns: ROW_COLUMNS, height: '100%', position: 'relative' as const }

  if (d.kind === 'group') {
    const pct = d.count ? Math.round(d.verified / d.count * 100) : 0
    return (
      <div style={rowStyle}
        className={cn('items-center gap-2 px-2 font-bold text-[13px] uppercase tracking-wide cursor-pointer hover:bg-bg/60 border-b border-border/70',
          d.special ? 'text-red' : 'text-navy')}
        onClick={() => node.toggle()}>
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <GuideRail node={node} />
          {hasChildren ? (node.isOpen ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />) : <span className="w-[14px] shrink-0" />}
          {!d.special && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />}
          <span className="truncate">{d.special ? d.label : (groupBy === 'epic' ? epicShortName(d.label) : d.label)}</span>
          <span className="text-subtle font-normal normal-case shrink-0">{d.count} exigence{d.count !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0" style={{ gridColumn: '2 / -1' }} title={`${d.verified}/${d.count} exigences vérifiées`}>
          <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: d.special ? '#EF4444' : d.color }} />
          </div>
          <span className="text-[11px] font-semibold normal-case shrink-0 w-8 text-right">{pct}%</span>
        </div>
      </div>
    )
  }

  if (d.kind === 'exigence') {
    const item = d.item
    return (
      <div style={rowStyle} className="items-center gap-2 px-2 text-sm border-l-2 border-transparent hover:bg-bg/60 cursor-pointer"
        onClick={() => node.toggle()}>
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <GuideRail node={node} />
          {hasChildren ? (node.isOpen ? <ChevronDown size={13} className="text-subtle shrink-0" /> : <ChevronRight size={13} className="text-subtle shrink-0" />) : <span className="w-[13px] shrink-0" />}
          <span className="font-mono font-semibold text-brand shrink-0">{item.code}</span>
          <span className="truncate">{item.titre}</span>
          <span className="shrink-0 text-xs text-subtle">{d.tasks.length} US</span>
        </div>
        <span className={cn('shrink-0 truncate text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide', EXIGENCE_TYPE_CFG[item.type]?.className)}>
          {EXIGENCE_TYPE_CFG[item.type]?.label}
        </span>
        <span className="flex items-center gap-1 min-w-0 text-xs" title={CRITICITE_CFG[item.criticite]?.label}>
          <span className={cn('w-2 h-2 rounded-full shrink-0', CRITICITE_CFG[item.criticite]?.dot)} />
          <span className="truncate">{CRITICITE_CFG[item.criticite]?.label.replace(/^Criticité /, '')}</span>
        </span>
        <span className="shrink-0">
          {item.verifiee ? <ShieldCheck size={14} className="text-green" /> : item.actif ? <Shield size={14} className="text-subtle" /> : <AlertTriangle size={14} className="text-subtle/50" />}
        </span>
      </div>
    )
  }

  const t = d.tache
  return (
    <div style={rowStyle} className="items-center gap-2 px-2 text-sm cursor-pointer hover:bg-bg/60"
      onClick={() => onOpenTache(t)}>
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        <GuideRail node={node} />
        <span className="w-[13px] shrink-0" />
        <span className="font-semibold text-indigo-600 whitespace-nowrap shrink-0">{t.id_tache}</span>
        <span className="truncate">{t.titre}</span>
      </div>
      <span className="min-w-0 overflow-hidden"><StatutBadge value={t.statut} className="truncate" /></span>
      <span />
      <span />
    </div>
  )
}
