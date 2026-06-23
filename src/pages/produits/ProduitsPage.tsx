import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import {
  useProduits, useCreateProduit, useUpdateProduit, useDeleteProduit, useDuplicateProduit,
  type Produit, type DuplicateOptions,
} from '@/hooks/useProduits'
import { useAuth } from '@/contexts/AuthContext'
import { useProduit } from '@/contexts/ProduitContext'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import { Spinner } from '@/components/ui/Spinner'
import { Plus, Pencil, Trash2, ChevronRight, Check, X, Star, Copy, LayoutTemplate, FileText, Target, TrendingUp, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BRAND_COLORS } from '@/constants'
import type { TrimObjectif } from '@/hooks/useProduits'

const NIVEAUX_RISQUE = ['Faible', 'Moyen', 'Élevé', 'Critique']
const RISQUE_COLORS: Record<string, string> = {
  Faible:   'bg-green-100 text-green-700',
  Moyen:    'bg-amber-100 text-amber-700',
  Élevé:    'bg-orange-100 text-orange-700',
  Critique: 'bg-red-100 text-red-700',
}

function newTrim(): TrimObjectif {
  return { id: crypto.randomUUID(), trimestre: '', objectif: '', budget_etp: null, budget_invest: null, budget_achats: null, kpis: '', outcome_desc: '', outcome_euros: null }
}

function fmt(n: number) { return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) }

// ── Ligne trimestre ────────────────────────────────────────────
function TrimRow({ t, onChange, onDelete }: {
  t: TrimObjectif
  onChange: (updated: TrimObjectif) => void
  onDelete: () => void
}) {
  function set<K extends keyof TrimObjectif>(k: K, v: TrimObjectif[K]) {
    onChange({ ...t, [k]: v })
  }
  function num(k: 'budget_etp' | 'budget_invest' | 'budget_achats' | 'outcome_euros', raw: string) {
    set(k, raw === '' ? null : Number(raw))
  }

  const coutEtp    = (t.budget_etp ?? 0) * 80000
  const totalTrim  = coutEtp + (t.budget_invest ?? 0) + (t.budget_achats ?? 0)

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* En-tête trimestre */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-bg border-b border-border">
        <input
          value={t.trimestre}
          onChange={e => set('trimestre', e.target.value)}
          className="flex-1 bg-transparent font-bold text-sm text-navy placeholder:text-subtle/50 outline-none"
          placeholder="Ex : Q1 2025, T2 2026…"
        />
        <button onClick={onDelete} className="p-1 rounded hover:bg-red/10 text-subtle hover:text-red transition-colors">
          <X size={13} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Objectif */}
        <div>
          <span className="ds-label block mb-1">Objectif</span>
          <textarea value={t.objectif} onChange={e => set('objectif', e.target.value)}
            className="ds-textarea text-xs" rows={2} placeholder="Qu'est-ce qu'on veut atteindre ce trimestre ?" />
        </div>

        {/* Budget */}
        <div>
          <span className="ds-label block mb-2">Budget</span>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="text-[10px] text-subtle font-semibold block mb-1">ETP (nb)</span>
              <input type="number" min="0" step="0.5" value={t.budget_etp ?? ''} placeholder="0"
                onChange={e => num('budget_etp', e.target.value)} className="ds-input text-xs" />
            </div>
            <div>
              <span className="text-[10px] text-subtle font-semibold block mb-1">Invest (€)</span>
              <input type="number" min="0" step="1000" value={t.budget_invest ?? ''} placeholder="0"
                onChange={e => num('budget_invest', e.target.value)} className="ds-input text-xs" />
            </div>
            <div>
              <span className="text-[10px] text-subtle font-semibold block mb-1">Achats (€)</span>
              <input type="number" min="0" step="1000" value={t.budget_achats ?? ''} placeholder="0"
                onChange={e => num('budget_achats', e.target.value)} className="ds-input text-xs" />
            </div>
          </div>
          {totalTrim > 0 && (
            <p className="text-[10px] text-subtle mt-1.5">
              Coût trimestre : <span className="font-bold text-navy">{fmt(totalTrim)}</span>
              {t.budget_etp ? <span className="opacity-60 ml-1">(ETP × 80k€/an)</span> : null}
            </p>
          )}
        </div>

        {/* KPIs + Outcome */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="ds-label block mb-1 flex items-center gap-1"><TrendingUp size={10}/> KPIs</span>
            <textarea value={t.kpis} onChange={e => set('kpis', e.target.value)}
              className="ds-textarea text-xs" rows={2} placeholder="NPS > 50, adoption > 30%…" />
          </div>
          <div className="space-y-1.5">
            <span className="ds-label block flex items-center gap-1"><TrendingUp size={10}/> Outcome</span>
            <textarea value={t.outcome_desc} onChange={e => set('outcome_desc', e.target.value)}
              className="ds-textarea text-xs" rows={2} placeholder="Description de la valeur créée…" />
            <input type="number" min="0" step="1000" value={t.outcome_euros ?? ''} placeholder="Valeur financière (€)"
              onChange={e => num('outcome_euros', e.target.value)} className="ds-input text-xs" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────
interface ProduitForm { nom: string; description: string; couleur: string }
type CreateMode = 'vierge' | 'dupliquer' | 'modele'

// ── Fiche produit (modal) ─────────────────────────────────────
function FicheProduitModal({ p, onClose, onSave }: {
  p: Produit
  onClose: () => void
  onSave: (updates: Partial<Produit>) => Promise<void>
}) {
  const [saving, setSaving]   = useState(false)
  const [vision, setVision]   = useState(p.vision ?? '')
  const [priorite, setPrio]   = useState(p.priorite_strategique != null ? String(p.priorite_strategique) : '')
  const [risque, setRisque]   = useState(p.niveau_risque ?? '')
  const [dateLancement, setDate] = useState(p.date_lancement_cible ?? '')
  const [trims, setTrims]     = useState<TrimObjectif[]>(
    Array.isArray(p.objectifs_trimestriels) && p.objectifs_trimestriels.length > 0
      ? p.objectifs_trimestriels
      : [newTrim()]
  )

  function updateTrim(id: string, updated: TrimObjectif) {
    setTrims(ts => ts.map(t => t.id === id ? updated : t))
  }
  function deleteTrim(id: string) {
    setTrims(ts => ts.filter(t => t.id !== id))
  }
  function addTrim() {
    setTrims(ts => [...ts, newTrim()])
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({
        vision:                 vision || null,
        priorite_strategique:   priorite !== '' ? Number(priorite) : null,
        niveau_risque:          risque || null,
        date_lancement_cible:   dateLancement || null,
        objectifs_trimestriels: trims.filter(t => t.trimestre || t.objectif),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  // Totaux globaux
  const totalEtp     = trims.reduce((s, t) => s + (t.budget_etp ?? 0), 0)
  const totalInvest  = trims.reduce((s, t) => s + (t.budget_invest ?? 0), 0)
  const totalAchats  = trims.reduce((s, t) => s + (t.budget_achats ?? 0), 0)
  const totalBudget  = totalEtp * 80000 + totalInvest + totalAchats
  const totalOutcome = trims.reduce((s, t) => s + (t.outcome_euros ?? 0), 0)
  const roi          = totalBudget > 0 ? ((totalOutcome - totalBudget) / totalBudget * 100) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="h-2 shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />
        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Titre */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-navy">{p.nom}</h2>
              {p.description && <p className="text-xs text-subtle mt-0.5">{p.description}</p>}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg text-subtle hover:text-navy transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Priorité / Risque / Date */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="ds-label mb-1 block">Priorité stratégique</label>
              <select value={priorite} onChange={e => setPrio(e.target.value)} className="ds-select text-xs">
                <option value="">—</option>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{'★'.repeat(n)} — {n}/5</option>)}
              </select>
            </div>
            <div>
              <label className="ds-label mb-1 block">Niveau de risque</label>
              <select value={risque} onChange={e => setRisque(e.target.value)} className="ds-select text-xs">
                <option value="">—</option>
                {NIVEAUX_RISQUE.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="ds-label mb-1 flex items-center gap-1"><Calendar size={11}/> Lancement cible</label>
              <input type="date" value={dateLancement} onChange={e => setDate(e.target.value)} className="ds-input text-xs" />
            </div>
          </div>

          {/* Vision */}
          <div>
            <label className="ds-label mb-1 flex items-center gap-1"><Target size={11}/> Vision produit</label>
            <textarea value={vision} onChange={e => setVision(e.target.value)}
              className="ds-textarea text-sm leading-relaxed" rows={3}
              placeholder="Quel problème résout-il ? Pour qui ? Quelle valeur unique apporte-t-il ?" />
          </div>

          {/* Objectifs par trimestre */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="ds-label">Objectifs par trimestre</span>
              <button onClick={addTrim}
                className="flex items-center gap-1 text-xs font-semibold text-purple hover:text-purple/80 transition-colors">
                <Plus size={13}/> Ajouter un trimestre
              </button>
            </div>
            <div className="space-y-3">
              {trims.map(t => (
                <TrimRow key={t.id} t={t}
                  onChange={updated => updateTrim(t.id, updated)}
                  onDelete={() => deleteTrim(t.id)} />
              ))}
            </div>
          </div>

          {/* Résumé financier */}
          {totalBudget > 0 || totalOutcome > 0 ? (
            <div className="rounded-xl border-2 border-navy/10 bg-navy/5 p-4">
              <div className="text-xs font-bold text-navy uppercase tracking-wider mb-3">Résumé financier</div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs mb-3">
                <div className="flex justify-between">
                  <span className="text-subtle">ETP total</span>
                  <span className="font-semibold text-navy">{totalEtp.toLocaleString('fr-FR')} ETP</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-subtle">Coût ETP</span>
                  <span className="font-semibold text-navy">{fmt(totalEtp * 80000)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-subtle">Investissements</span>
                  <span className="font-semibold text-navy">{fmt(totalInvest)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-subtle">Achats</span>
                  <span className="font-semibold text-navy">{fmt(totalAchats)}</span>
                </div>
              </div>
              <div className="border-t border-navy/10 pt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="font-bold text-navy">Budget total</span>
                  <span className="font-bold text-navy">{fmt(totalBudget)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-green-700">Outcome total</span>
                  <span className="font-bold text-green-700">{fmt(totalOutcome)}</span>
                </div>
                {roi !== null && (
                  <div className="col-span-2 flex justify-between pt-1 border-t border-navy/10 mt-1">
                    <span className="font-bold text-navy">ROI estimé</span>
                    <span className={cn('font-bold', roi >= 0 ? 'text-green-700' : 'text-red-600')}>
                      {roi >= 0 ? '+' : ''}{roi.toFixed(0)} %
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex gap-2 bg-white">
          <button onClick={handleSave} disabled={saving}
            className="ds-btn-primary ds-btn-sm flex items-center gap-1.5 disabled:opacity-50">
            <Check size={13}/> {saving ? 'Enregistrement…' : 'Enregistrer la fiche'}
          </button>
          <button onClick={onClose} className="ds-btn ds-btn-sm">Annuler</button>
        </div>
      </div>
    </div>
  )
}

// ── Carte produit ─────────────────────────────────────────────
function ProduitCard({
  p, isAdmin, isActif, roleLabel, roleColor,
  onEnter, onEdit, onDelete, onToggleTemplate, onFiche,
}: {
  p: Produit; isAdmin: boolean; isActif: boolean
  roleLabel: string; roleColor: string
  onEnter: () => void; onEdit: () => void; onDelete: () => void
  onToggleTemplate: () => void; onFiche: () => void
}) {
  return (
    <div className={cn(
      'group bg-white rounded-2xl border shadow-sm overflow-hidden transition-all',
      isActif ? 'border-purple ring-2 ring-purple/20' : 'border-border hover:shadow-md hover:-translate-y-0.5',
      p.is_template && 'ring-1 ring-amber-300/60',
    )}>
      <div className="h-2" style={{ background: p.couleur ?? '#4A4CC8' }} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0 cursor-pointer" onClick={onEnter}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <div className="font-bold text-navy text-base truncate">{p.nom}</div>
              {p.is_template && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold shrink-0">
                  <Star size={9} className="fill-amber-500 stroke-amber-500" /> Modèle
                </span>
              )}
            </div>
            {p.description && (
              <div className="text-xs text-subtle line-clamp-2">{p.description}</div>
            )}
          </div>
          <div className="flex gap-1 ml-2 shrink-0">
            <button onClick={onFiche} title="Fiche produit"
              className="p-1.5 rounded-lg hover:bg-bg text-subtle hover:text-purple transition-colors">
              <FileText size={13} />
            </button>
            {isAdmin && (
              <>
                <button onClick={onToggleTemplate} title={p.is_template ? 'Retirer le statut modèle' : 'Marquer comme modèle'}
                  className={cn(
                    'p-1.5 rounded-lg transition-colors',
                    p.is_template
                      ? 'text-amber-500 bg-amber-50 hover:bg-amber-100'
                      : 'text-subtle hover:bg-bg hover:text-amber-500'
                  )}>
                  <Star size={13} className={p.is_template ? 'fill-amber-400 stroke-amber-500' : ''} />
                </button>
                <button onClick={onEdit}
                  className="p-1.5 rounded-lg hover:bg-bg text-subtle hover:text-navy transition-colors">
                  <Pencil size={13} />
                </button>
                <button onClick={onDelete}
                  className="p-1.5 rounded-lg hover:bg-red/10 text-subtle hover:text-red transition-colors">
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        </div>
        {/* Badges thème / risque / priorité */}
        {(p.theme || p.niveau_risque || p.priorite_strategique) && (
          <div className="flex flex-wrap gap-1 mb-3">
            {p.theme && (
              <span className="text-[10px] px-1.5 py-0.5 bg-purple/10 text-purple rounded-full font-medium">{p.theme}</span>
            )}
            {p.niveau_risque && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', RISQUE_COLORS[p.niveau_risque] ?? 'bg-gray-100 text-gray-600')}>
                ⚠ {p.niveau_risque}
              </span>
            )}
            {p.priorite_strategique && (
              <span className="text-[10px] px-1.5 py-0.5 bg-navy/10 text-navy rounded-full font-medium">
                {'★'.repeat(p.priorite_strategique)} P{p.priorite_strategique}
              </span>
            )}
            {p.date_lancement_cible && (
              <span className="text-[10px] px-1.5 py-0.5 bg-bg border border-border text-subtle rounded-full">
                🗓 {new Date(p.date_lancement_cible).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', roleColor)}>
            {roleLabel}
          </span>
          <button onClick={onEnter} className="flex items-center gap-1 text-subtle hover:text-purple transition-colors">
            <span className="text-xs font-medium">{isActif ? 'Actif' : 'Ouvrir'}</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Formulaire produit ────────────────────────────────────────
function ProduitFormCard({
  initial, onSave, onCancel, loading,
}: {
  initial?: ProduitForm; onSave: (f: ProduitForm) => Promise<void>; onCancel: () => void; loading: boolean
}) {
  const [nom, setNom]         = useState(initial?.nom ?? '')
  const [desc, setDesc]       = useState(initial?.description ?? '')
  const [couleur, setCouleur] = useState(initial?.couleur ?? BRAND_COLORS[0])

  return (
    <div className="bg-white rounded-2xl border border-purple/40 p-5 shadow-sm">
      <div className="h-2 -mx-5 -mt-5 mb-5 rounded-t-2xl" style={{ background: couleur }} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="ds-label mb-1 block">Nom *</label>
          <input value={nom} onChange={e => setNom(e.target.value)} className="ds-input"
            placeholder="Ex: Dimos D4X" autoFocus
            onKeyDown={e => e.key === 'Enter' && onSave({ nom, description: desc, couleur })} />
        </div>
        <div>
          <label className="ds-label mb-1 block">Description</label>
          <input value={desc} onChange={e => setDesc(e.target.value)} className="ds-input" placeholder="Description courte…" />
        </div>
      </div>
      <div className="mb-4">
        <label className="ds-label mb-1.5 block">Couleur</label>
        <div className="flex gap-2 flex-wrap">
          {BRAND_COLORS.map(c => (
            <button key={c} type="button" onClick={() => setCouleur(c)}
              className={cn('w-6 h-6 rounded-full transition-transform hover:scale-110', couleur === c && 'ring-2 ring-navy ring-offset-2')}
              style={{ background: c }} />
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ nom, description: desc, couleur })} disabled={loading || !nom.trim()}
          className="ds-btn-primary ds-btn-sm flex items-center gap-1.5">
          <Check size={13} /> {loading ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button onClick={onCancel} className="ds-btn ds-btn-sm flex items-center gap-1.5">
          <X size={13} /> Annuler
        </button>
      </div>
    </div>
  )
}

// ── Modal création ────────────────────────────────────────────
function CheckOption({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <div className={cn(
        'w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0',
        checked ? 'bg-purple border-purple' : 'border-border group-hover:border-purple/50'
      )} onClick={() => onChange(!checked)}>
        {checked && <Check size={10} className="text-white" />}
      </div>
      <span className="text-xs text-navy">{label}</span>
    </label>
  )
}

function CreateModal({
  produits, onClose, onCreate, onDuplicate, loading,
}: {
  produits: Produit[]
  onClose: () => void
  onCreate: (f: ProduitForm) => Promise<void>
  onDuplicate: (opts: Omit<DuplicateOptions, 'sourceId'> & { sourceId: number }) => Promise<void>
  loading: boolean
}) {
  const [mode, setMode]         = useState<CreateMode>('vierge')
  const [sourceId, setSourceId] = useState<number | ''>('')
  const [nom, setNom]           = useState('')
  const [desc, setDesc]         = useState('')
  const [couleur, setCouleur]   = useState(BRAND_COLORS[0])
  const [copyDod,     setCopyDod]     = useState(true)
  const [copyTaches,  setCopyTaches]  = useState(false)
  const [copySprints, setCopySprints] = useState(false)

  const templates = produits.filter(p => p.is_template)
  const sources   = mode === 'modele' ? templates : produits

  function onSourceChange(id: number | '') {
    setSourceId(id)
    if (id !== '') {
      const src = produits.find(p => p.id === id)
      if (src) {
        setNom(`Copie de ${src.nom}`)
        setDesc(src.description ?? '')
        setCouleur(src.couleur ?? BRAND_COLORS[0])
      }
    } else {
      setNom(''); setDesc(''); setCouleur(BRAND_COLORS[0])
    }
  }

  function resetMode(m: CreateMode) {
    setMode(m); setSourceId(''); setNom(''); setDesc(''); setCouleur(BRAND_COLORS[0])
    setCopyDod(true); setCopyTaches(false); setCopySprints(false)
  }

  async function handleSubmit() {
    const f: ProduitForm = { nom: nom.trim(), description: desc, couleur }
    if (mode === 'vierge') {
      await onCreate(f)
    } else {
      if (!sourceId) return
      await onDuplicate({ sourceId: Number(sourceId), ...f, copyDod, copyTaches, copySprints })
    }
  }

  const canSubmit = nom.trim() && (mode === 'vierge' || sourceId !== '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header couleur */}
        <div className="h-2" style={{ background: couleur }} />

        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-navy">Nouveau produit</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg text-subtle hover:text-navy transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Choix du mode */}
          <div className="mb-5">
            <div className="ds-label mb-2">Base de départ</div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'vierge',    label: 'Vierge',         icon: <Plus size={16} />,           desc: 'Produit vide' },
                { id: 'dupliquer', label: 'Dupliquer',       icon: <Copy size={16} />,           desc: 'Depuis un existant' },
                { id: 'modele',    label: 'Depuis modèle',   icon: <LayoutTemplate size={16} />, desc: 'Produits modèles' },
              ] as { id: CreateMode; label: string; icon: React.ReactNode; desc: string }[]).map(opt => (
                <button key={opt.id} type="button" onClick={() => resetMode(opt.id)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-xs font-medium transition-all',
                    mode === opt.id
                      ? 'border-purple bg-purple/5 text-purple'
                      : 'border-border text-subtle hover:border-navy/30 hover:text-navy'
                  )}>
                  {opt.icon}
                  <span className="font-semibold">{opt.label}</span>
                  <span className="text-[10px] opacity-70">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Sélecteur de source */}
          {mode !== 'vierge' && (
            <div className="mb-4">
              <label className="ds-label mb-1 block">
                {mode === 'modele' ? 'Modèle à utiliser' : 'Produit à dupliquer'}
              </label>
              {sources.length === 0 ? (
                <div className="text-xs text-subtle italic px-3 py-2 bg-bg rounded-xl">
                  {mode === 'modele'
                    ? 'Aucun modèle disponible — marquez un produit avec ★ pour l\'utiliser comme modèle.'
                    : 'Aucun produit disponible.'}
                </div>
              ) : (
                <select
                  value={sourceId}
                  onChange={e => onSourceChange(e.target.value === '' ? '' : Number(e.target.value))}
                  className="ds-select">
                  <option value="">— Sélectionner —</option>
                  {sources.map(p => (
                    <option key={p.id} value={p.id}>{p.nom}{p.is_template ? ' ★' : ''}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Ce qui est copié */}
          {mode !== 'vierge' && sourceId !== '' && (
            <div className="mb-4 p-3 bg-bg rounded-xl border border-border">
              <div className="ds-label mb-2">Éléments à copier</div>
              <div className="flex flex-col gap-2">
                <CheckOption label="Critères DoD" checked={copyDod} onChange={setCopyDod} />
                <CheckOption label="Tâches / US (remises à zéro : statut → À faire, sprint → vide)" checked={copyTaches} onChange={setCopyTaches} />
                <CheckOption label="Sprints (remis à l'état planifié, dates effacées)" checked={copySprints} onChange={setCopySprints} />
              </div>
            </div>
          )}

          {/* Champs nom / description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="ds-label mb-1 block">Nom *</label>
              <input value={nom} onChange={e => setNom(e.target.value)} className="ds-input"
                placeholder="Ex: Dimos D4X" autoFocus={mode === 'vierge'} />
            </div>
            <div>
              <label className="ds-label mb-1 block">Description</label>
              <input value={desc} onChange={e => setDesc(e.target.value)} className="ds-input" placeholder="Description courte…" />
            </div>
          </div>

          {/* Couleur */}
          <div className="mb-5">
            <label className="ds-label mb-1.5 block">Couleur</label>
            <div className="flex gap-2 flex-wrap">
              {BRAND_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setCouleur(c)}
                  className={cn('w-6 h-6 rounded-full transition-transform hover:scale-110', couleur === c && 'ring-2 ring-navy ring-offset-2')}
                  style={{ background: c }} />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-3 border-t border-border">
            <button onClick={handleSubmit} disabled={loading || !canSubmit}
              className="ds-btn-primary ds-btn-sm flex items-center gap-1.5 disabled:opacity-50">
              <Check size={13} /> {loading ? 'Création…' : 'Créer le produit'}
            </button>
            <button onClick={onClose} className="ds-btn ds-btn-sm">Annuler</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────
export default function ProduitsPage() {
  const { data: produits = [], isLoading } = useProduits()
  const { isAdmin, getRoleForProduit }     = useAuth()
  const { produitActif, setProduitActif }  = useProduit()
  const createProduit    = useCreateProduit()
  const updateProduit    = useUpdateProduit()
  const deleteProduit    = useDeleteProduit()
  const duplicateProduit = useDuplicateProduit()
  const toast    = useToast()
  const navigate = useNavigate()

  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId]   = useState<number | null>(null)
  const [ficheId,   setFicheId]     = useState<number | null>(null)

  const produitsAccessibles = produits.filter(p =>
    p.actif && (isAdmin || getRoleForProduit(p.id) !== null)
  )

  function roleLabel(produitId: number) {
    if (isAdmin) return 'Admin'
    const r = getRoleForProduit(produitId)
    if (r === 'po')      return 'PO'
    if (r === 'dev')     return 'Développeur'
    if (r === 'lecteur') return 'Lecteur'
    return ''
  }

  function roleColor(produitId: number) {
    if (isAdmin) return 'bg-purple/10 text-purple'
    const r = getRoleForProduit(produitId)
    if (r === 'po')      return 'bg-navy/10 text-navy'
    if (r === 'dev')     return 'bg-green/10 text-green'
    if (r === 'lecteur') return 'bg-subtle/10 text-subtle'
    return ''
  }

  function enterProduit(p: Produit) {
    setProduitActif({ id: p.id, nom: p.nom, couleur: p.couleur })
    navigate('/')
  }

  async function handleCreate(f: ProduitForm) {
    if (!f.nom.trim()) { toast('Nom obligatoire', 'error'); return }
    const p = await createProduit.mutateAsync({ nom: f.nom.trim(), description: f.description || null, couleur: f.couleur, actif: true, is_template: false as boolean })
    toast(`Produit "${p.nom}" créé`)
    setShowCreate(false)
  }

  async function handleDuplicate(opts: Omit<DuplicateOptions, 'sourceId'> & { sourceId: number }) {
    if (!opts.nom.trim()) { toast('Nom obligatoire', 'error'); return }
    const p = await duplicateProduit.mutateAsync({ ...opts, nom: opts.nom.trim(), description: opts.description || null })
    toast(`Produit "${p.nom}" créé`)
    setShowCreate(false)
  }

  async function handleUpdate(id: number, f: ProduitForm) {
    await updateProduit.mutateAsync({ id, updates: { nom: f.nom.trim(), description: f.description || null, couleur: f.couleur } })
    if (produitActif?.id === id) setProduitActif({ id, nom: f.nom.trim(), couleur: f.couleur })
    toast('Produit mis à jour')
    setEditingId(null)
  }

  async function handleDelete(p: Produit) {
    if (!window.confirm(`Supprimer "${p.nom}" définitivement ?`)) return
    await deleteProduit.mutateAsync(p.id)
    if (produitActif?.id === p.id) setProduitActif(null)
    toast(`"${p.nom}" supprimé`)
  }

  async function handleToggleTemplate(p: Produit) {
    await updateProduit.mutateAsync({ id: p.id, updates: { is_template: !p.is_template } })
    toast(p.is_template ? `"${p.nom}" retiré des modèles` : `"${p.nom}" marqué comme modèle`)
  }

  const isSaving = createProduit.isPending || duplicateProduit.isPending
  const nbModeles = produitsAccessibles.filter(p => p.is_template).length

  if (isLoading) return <Layout><Spinner /></Layout>

  return (
    <Layout>
      {/* Topbar */}
      <div className="page-topbar -mx-3 -mt-3 mb-5 px-3 md:-mx-5 md:-mt-5 md:px-5">
        <h1 className="text-sm font-semibold text-navy">Produits</h1>
        <span className="text-xs text-subtle ml-2">
          {produitsAccessibles.length - nbModeles} produit{produitsAccessibles.length - nbModeles !== 1 ? 's' : ''}
          {nbModeles > 0 && ` · ${nbModeles} modèle${nbModeles !== 1 ? 's' : ''}`}
        </span>
        {isAdmin && (
          <button onClick={() => { setShowCreate(true); setEditingId(null) }}
            className="ml-auto ds-btn-primary ds-btn-sm flex items-center gap-1.5">
            <Plus size={13} /> Nouveau produit
          </button>
        )}
      </div>

      {/* Fiche produit */}
      {ficheId !== null && (() => {
        const fp = produits.find(p => p.id === ficheId)
        return fp ? (
          <FicheProduitModal
            p={fp}
            onClose={() => setFicheId(null)}
            onSave={async updates => {
              await updateProduit.mutateAsync({ id: fp.id, updates })
              toast('Fiche enregistrée')
            }}
          />
        ) : null
      })()}

      {/* Modal création */}
      {showCreate && (
        <CreateModal
          produits={produits}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
          onDuplicate={(opts) => handleDuplicate(opts)}
          loading={isSaving}
        />
      )}

      {/* Grille produits */}
      {produitsAccessibles.length === 0 ? (
        <div className="text-center py-20 text-subtle">
          <div className="text-4xl mb-3">📦</div>
          <p className="font-medium">Aucun produit accessible</p>
          <p className="text-xs mt-1">Contactez un administrateur pour obtenir un accès.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {produitsAccessibles.map(p =>
            editingId === p.id ? (
              <ProduitFormCard
                key={p.id}
                initial={{ nom: p.nom, description: p.description ?? '', couleur: p.couleur ?? BRAND_COLORS[0] }}
                onSave={f => handleUpdate(p.id, f)}
                onCancel={() => setEditingId(null)}
                loading={updateProduit.isPending}
              />
            ) : (
              <ProduitCard
                key={p.id}
                p={p}
                isAdmin={isAdmin}
                isActif={produitActif?.id === p.id}
                roleLabel={roleLabel(p.id)}
                roleColor={roleColor(p.id)}
                onEnter={() => enterProduit(p)}
                onEdit={() => { setEditingId(p.id); setShowCreate(false) }}
                onDelete={() => handleDelete(p)}
                onToggleTemplate={() => handleToggleTemplate(p)}
                onFiche={() => { setFicheId(p.id); setEditingId(null); setShowCreate(false) }}
              />
            )
          )}
        </div>
      )}

      <ToastContainer />
    </Layout>
  )
}
