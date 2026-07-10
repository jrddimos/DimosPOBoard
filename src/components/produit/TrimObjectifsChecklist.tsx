import { Plus, Check, X, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TrimCheckItem } from '@/hooks/useProduits'

// Extrait de ProduitConfigPage.tsx (TrimRow) pour être réutilisable ailleurs
// (roadmap multi-produits) sans dupliquer la logique d'édition — même rendu,
// même comportement pour Setup Produit.
export function TrimObjectifsChecklist({ items, onChange, isCloture, barColor = 'bg-purple' }: {
  items: TrimCheckItem[]
  onChange: (items: TrimCheckItem[]) => void
  isCloture: boolean
  barColor?: string
}) {
  const pct = items.length > 0 ? Math.round(items.filter(o => o.checked).length / items.length * 100) : null

  function addItem() { onChange([...items, { id: crypto.randomUUID(), texte: '', checked: false }]) }
  function toggleItem(id: string) { onChange(items.map(o => o.id === id ? { ...o, checked: !o.checked } : o)) }
  function updateText(id: string, texte: string) { onChange(items.map(o => o.id === id ? { ...o, texte } : o)) }
  function removeItem(id: string) { onChange(items.filter(o => o.id !== id)) }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-bold text-navy/75 uppercase tracking-wide flex items-center gap-1"><Target size={10}/> Objectifs</span>
        {!isCloture && (
          <button onClick={addItem}
            className="flex items-center gap-1 text-xs font-semibold text-purple hover:text-purple/80 transition-colors">
            <Plus size={12}/> Ajouter
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-subtle/50 italic">Aucun objectif</p>
      ) : (
        <div className="space-y-1">
          {items.map(obj => (
            <div key={obj.id} className="flex items-center gap-2">
              <button onClick={() => toggleItem(obj.id)}
                className={cn('w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-all',
                  obj.checked ? 'bg-green border-green' : 'border-border hover:border-purple/50')}>
                {obj.checked && <Check size={9} className="text-white"/>}
              </button>
              <input value={obj.texte} onChange={e => updateText(obj.id, e.target.value)}
                className={cn('flex-1 ds-input text-xs py-0.5', obj.checked && 'line-through text-subtle')}
                placeholder="Objectif…" />
              {!isCloture && (
                <button onClick={() => removeItem(obj.id)}
                  className="p-0.5 rounded hover:bg-red/10 text-subtle hover:text-red shrink-0">
                  <X size={10}/>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {pct !== null && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
            <div className={cn('h-full rounded-full', barColor)} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] font-bold text-navy tabular-nums">
            {items.filter(o => o.checked).length}/{items.length} — {pct}%
          </span>
        </div>
      )}
    </div>
  )
}
