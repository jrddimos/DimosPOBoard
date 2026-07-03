import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { UserProfile } from '@/contexts/AuthContext'

// Champ texte (input ou textarea) avec autocomplétion @trigramme — utilisé
// partout où un utilisateur écrit un commentaire/note lu par l'équipe.
export function MentionField({
  as = 'input', value, onChange, membres, className, placeholder, rows, onEnter, dropDirection = 'down',
}: {
  as?: 'input' | 'textarea'
  value: string
  onChange: (v: string) => void
  membres: UserProfile[]
  className?: string
  placeholder?: string
  rows?: number
  onEnter?: () => void
  dropDirection?: 'up' | 'down'
}) {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState(0)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  const mentionMatches = mentionQuery === null ? [] : membres
    .filter(m => m.trigramme && m.trigramme.toLowerCase().startsWith(mentionQuery.toLowerCase()))
    .slice(0, 6)

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const val = e.target.value
    const pos = e.target.selectionStart ?? val.length
    onChange(val)
    const uptoCursor = val.slice(0, pos)
    const match = uptoCursor.match(/(?:^|\s)@([A-Za-z0-9]{0,5})$/)
    if (match) {
      setMentionQuery(match[1])
      setMentionStart(pos - match[1].length - 1)
    } else {
      setMentionQuery(null)
    }
  }

  function selectMention(trigramme: string) {
    const before = value.slice(0, mentionStart)
    const after = value.slice(mentionStart + 1 + (mentionQuery?.length ?? 0))
    const newVal = `${before}@${trigramme} ${after}`
    onChange(newVal)
    setMentionQuery(null)
    requestAnimationFrame(() => {
      const cursor = before.length + trigramme.length + 2
      ref.current?.focus()
      ref.current?.setSelectionRange(cursor, cursor)
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (e.key === 'Escape') { setMentionQuery(null); return }
    if (e.key === 'Enter' && mentionMatches.length > 0 && !e.shiftKey) {
      e.preventDefault()
      selectMention(mentionMatches[0].trigramme!)
      return
    }
    if (e.key === 'Enter' && onEnter && (as === 'input' || !e.shiftKey)) {
      e.preventDefault()
      onEnter()
    }
  }

  const commonProps = {
    ref: ref as never,
    value,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    onBlur: () => setTimeout(() => setMentionQuery(null), 150),
    placeholder,
    className,
  }

  return (
    <div className="relative">
      {as === 'textarea'
        ? <textarea {...commonProps} rows={rows} />
        : <input {...commonProps} />}

      {mentionQuery !== null && mentionMatches.length > 0 && (
        <div className={cn(
          'absolute left-0 z-30 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden',
          dropDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1',
        )} style={{ minWidth: '180px' }}>
          {mentionMatches.map(m => (
            <button key={m.user_id} type="button"
              onMouseDown={e => { e.preventDefault(); selectMention(m.trigramme!) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-indigo-50 transition-colors">
              <span className="text-xs font-semibold text-indigo-600">{m.trigramme}</span>
              <span className="text-xs text-subtle truncate">{m.prenom ?? ''} {m.nom ?? ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
