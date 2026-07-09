import type { NodeApi } from 'react-arborist'
import { cn } from '@/lib/utils'

// Lignes de guidage façon explorateur (│ ├ └), dessinées en CSS plutôt qu'en
// caractères ASCII pour rester cohérentes avec le reste de l'UI (Tailwind,
// pas de police monospace). Même algorithme que `getTreeLinePrefix` de
// react-arborist : pour chaque ancêtre au-dessus du parent direct, on ne
// prolonge la ligne verticale que s'il a encore un frère en dessous de lui.
// Générique sur tout arbre react-arborist (Tâches, Exigences...).
export const GUIDE_WIDTH = 20

export function GuideRail<T>({ node }: { node: NodeApi<T> }) {
  if (node.level === 0) return null
  const segments: boolean[] = []
  let ancestor = node.parent
  while (ancestor && ancestor.level > 0) {
    segments.unshift(ancestor.nextSibling !== null)
    ancestor = ancestor.parent
  }
  const isLast = node.nextSibling === null
  return (
    <div className="flex shrink-0 self-stretch">
      {segments.map((continues, i) => (
        <div key={i} className="relative shrink-0" style={{ width: GUIDE_WIDTH }}>
          {continues && <div className="absolute inset-y-0 left-1/2 border-l border-border" />}
        </div>
      ))}
      <div className="relative shrink-0" style={{ width: GUIDE_WIDTH }}>
        <div className={cn('absolute left-1/2 border-l border-border', isLast ? 'top-0 h-1/2' : 'inset-y-0')} />
        <div className="absolute left-1/2 top-1/2 border-t border-border" style={{ width: GUIDE_WIDTH / 2 }} />
      </div>
    </div>
  )
}
