import { useState } from 'react'
import { X, BookOpen, Folder } from 'lucide-react'
import { cn } from '@/lib/utils'
import { epicFullName, type Epic } from '@/hooks/useEpics'

// Popup déclenchée depuis un groupe du board Fast Task pour transformer son
// contenu en backlog réel : soit un nouvel Epic (le groupe devient un Epic à
// part entière), soit un nouveau Conteneur rattaché à un Epic existant —
// dans les deux cas, le nom du groupe devient le nom de l'Epic/Conteneur, et
// toutes les tâches du groupe y sont rattachées.
export function ConvertGroupModal({ groupNom, taskCount, epicsList, onClose, onConfirm }: {
  groupNom: string
  taskCount: number
  epicsList: Epic[]
  onClose: () => void
  onConfirm: (choice: { type: 'epic' } | { type: 'conteneur'; epicLabel: string }) => Promise<void>
}) {
  const [type, setType] = useState<'epic' | 'conteneur'>('epic')
  const [epicLabel, setEpicLabel] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (type === 'conteneur' && !epicLabel) return
    setSaving(true)
    try {
      await onConfirm(type === 'epic' ? { type: 'epic' } : { type: 'conteneur', epicLabel })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand/40 backdrop-blur-sm p-4"
      onClick={() => { if (!saving) onClose() }}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400 font-medium">Transformer le groupe en backlog</p>
            <p className="text-sm font-bold text-navy truncate">"{groupNom}" — {taskCount} tâche{taskCount !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} disabled={saving} className="shrink-0 p-1.5 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-navy disabled:opacity-40"><X size={15} /></button>
        </div>

        <div className="flex flex-col gap-2 mb-4">
          <button type="button" onClick={() => setType('epic')}
            className={cn('flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium text-left transition-colors',
              type === 'epic' ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-navy hover:border-slate-300')}>
            <BookOpen size={14} className="shrink-0" /> Nouvel Epic « {groupNom} »
          </button>
          <button type="button" onClick={() => setType('conteneur')}
            className={cn('flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium text-left transition-colors',
              type === 'conteneur' ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-200 text-navy hover:border-slate-300')}>
            <Folder size={14} className="shrink-0" /> Nouveau Conteneur « {groupNom} »
          </button>
        </div>

        <p className="text-xs text-subtle mb-4">
          Le groupe et ses post-it seront retirés du board une fois les tâches rattachées.
        </p>

        {type === 'conteneur' && (
          <div className="mb-4">
            <label className="ds-label mb-1 block">Epic parent *</label>
            <select value={epicLabel} onChange={e => setEpicLabel(e.target.value)} className="ds-select w-full">
              <option value="">-- Choisir un Epic --</option>
              {epicsList.map(e => <option key={e.id} value={epicFullName(e)}>{epicFullName(e)}</option>)}
            </select>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={submit} disabled={saving || (type === 'conteneur' && !epicLabel)}
            className="ds-btn-primary flex-1 disabled:opacity-40">
            {saving ? 'Création…' : 'Créer et rattacher'}
          </button>
          <button onClick={onClose} disabled={saving} className="ds-btn disabled:opacity-40">Annuler</button>
        </div>
      </div>
    </div>
  )
}
