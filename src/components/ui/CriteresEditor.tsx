import { useState, useRef } from 'react'
import { Check, Plus, Trash2, GripVertical } from 'lucide-react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function toggle(id: string) {
    // Date de la dernière coche — effacée si décoché (une recoche
    // ultérieure prend une date fraîche), sert au burndown "par critères".
    onChange(items.map(i => i.id === id
      ? { ...i, checked: !i.checked, checked_at: !i.checked ? new Date().toISOString() : null }
      : i))
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

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex(i => i.id === active.id)
    const newIndex = items.findIndex(i => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onChange(arrayMove(items, oldIndex, newIndex))
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
      {readOnly ? (
        items.map(item => <CritereRow key={item.id} item={item} readOnly compact={compact} />)
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
            {items.map(item => (
              <CritereRow key={item.id} item={item} compact={compact}
                onToggle={() => toggle(item.id)} onRemove={() => remove(item.id)}
                onUpdateText={text => updateText(item.id, text)} />
            ))}
          </SortableContext>
        </DndContext>
      )}

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

function CritereRow({ item, readOnly = false, compact = false, onToggle, onRemove, onUpdateText }: {
  item: CritereItem
  readOnly?: boolean
  compact?: boolean
  onToggle?: () => void
  onRemove?: () => void
  onUpdateText?: (text: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: readOnly })
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }

  return (
    <div ref={setNodeRef} style={style} className={cn('flex items-start gap-1 group bg-white', isDragging && 'opacity-60')}>
      {/* Poignée de glisser-déposer */}
      {!readOnly && (
        <button {...attributes} {...listeners}
          className="mt-0.5 shrink-0 text-subtle/40 hover:text-subtle cursor-grab active:cursor-grabbing touch-none"
          tabIndex={-1}>
          <GripVertical size={12} />
        </button>
      )}

      {/* Checkbox */}
      <button
        onClick={() => !readOnly && onToggle?.()}
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
          onChange={e => onUpdateText?.(e.target.value)}
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
          onClick={() => onRemove?.()}
          className={cn(
            'max-md:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity text-subtle hover:text-red shrink-0',
            compact ? 'mt-0.5' : 'mt-0.5',
          )}
        >
          <Trash2 size={10} />
        </button>
      )}
    </div>
  )
}
