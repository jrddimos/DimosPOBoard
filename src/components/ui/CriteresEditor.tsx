import { useState, useRef } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CritereItem } from '@/lib/utils'

interface Props {
  items: CritereItem[]
  onChange: (items: CritereItem[]) => void
  readOnly?: boolean
  compact?: boolean
}

export function CriteresEditor({ items, onChange, readOnly = false, compact = false }: Props) {
  const [newText, setNewText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function toggle(id: string) {
    onChange(items.map(i => i.id === id ? { ...i, checked: !i.checked } : i))
  }

  function remove(id: string) {
    onChange(items.filter(i => i.id !== id))
  }

  function updateText(id: string, text: string) {
    onChange(items.map(i => i.id === id ? { ...i, text } : i))
  }

  function add() {
    const t = newText.trim()
    if (!t) return
    onChange([...items, { id: Math.random().toString(36).slice(2), text: t, checked: false }])
    setNewText('')
    inputRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); add() }
  }

  const doneCount = items.filter(i => i.checked).length
  const pct = items.length > 0 ? Math.round(doneCount / items.length * 100) : 0

  return (
    <div className="flex flex-col gap-1.5">
      {/* Barre de progression si ≥ 2 critères */}
      {items.length >= 2 && (
        <div className="flex items-center gap-2 mb-0.5">
          <div className="flex-1 h-1 rounded-full bg-border overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-green' : 'bg-purple')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[11px] text-subtle tabular-nums">{doneCount}/{items.length}</span>
        </div>
      )}

      {/* Liste des critères */}
      {items.length === 0 && readOnly && (
        <p className="text-xs text-subtle/60 italic">Aucun critère défini</p>
      )}
      {items.map(item => (
        <div key={item.id} className="flex items-start gap-2 group">
          {/* Checkbox */}
          <button
            onClick={() => !readOnly && toggle(item.id)}
            className={cn(
              'mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all',
              item.checked
                ? 'bg-green border-green'
                : readOnly
                  ? 'border-border cursor-default'
                  : 'border-border hover:border-purple/60 cursor-pointer',
            )}
          >
            {item.checked && <Check size={9} className="text-white" />}
          </button>

          {/* Texte éditable ou lecture seule */}
          {readOnly ? (
            <span className={cn('text-xs leading-snug flex-1 pt-px', item.checked ? 'line-through text-subtle/60' : 'text-navy/80')}>
              {item.text || <span className="italic text-subtle/40">Sans titre</span>}
            </span>
          ) : (
            <input
              value={item.text}
              onChange={e => updateText(item.id, e.target.value)}
              className={cn(
                'flex-1 text-xs bg-transparent border-none outline-none py-0 leading-snug',
                item.checked ? 'line-through text-subtle/60' : 'text-navy',
              )}
              placeholder="Critère…"
            />
          )}

          {/* Supprimer */}
          {!readOnly && (
            <button
              onClick={() => remove(item.id)}
              className={cn(
                'max-md:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity text-subtle hover:text-red shrink-0',
                compact ? 'mt-0.5' : 'mt-0.5',
              )}
            >
              <Trash2 size={10} />
            </button>
          )}
        </div>
      ))}

      {/* Champ ajout */}
      {!readOnly && (
        <div className="flex items-center gap-2 mt-1">
          <div className="w-4 shrink-0 flex justify-center">
            <Plus size={10} className="text-subtle" />
          </div>
          <input
            ref={inputRef}
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ajouter un critère…"
            className="flex-1 text-xs bg-transparent border-none outline-none text-subtle placeholder:text-subtle/50"
          />
          {newText.trim() && (
            <button onClick={add} className="text-[11px] text-purple font-semibold shrink-0 hover:underline">
              Ajouter
            </button>
          )}
        </div>
      )}
    </div>
  )
}
