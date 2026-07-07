import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import {
  useProduits, useCreateProduit, useUpdateProduit, useDeleteProduit, useDuplicateProduit,
  type Produit, type DuplicateOptions,
  trimAvancement,
} from '@/hooks/useProduits'
import { useAuth } from '@/contexts/AuthContext'
import { useProduit } from '@/contexts/ProduitContext'
import { useAppSettings, useUpdateAppSettings } from '@/hooks/useAppSettings'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import { Spinner } from '@/components/ui/Spinner'
import {
  Plus, Check, X, Star, Copy, LayoutTemplate, Settings2,
  LayoutDashboard, ChevronRight, AlertTriangle, TrendingUp, TrendingDown, SlidersHorizontal,
  Power, ChevronDown, Package, Calendar, Search, ArrowUpDown, Sparkles,
} from 'lucide-react'
import { CreateProduitWizard } from './CreateProduitWizard'
import { cn } from '@/lib/utils'
import { BRAND_COLORS } from '@/constants'
import type { TrimStatut } from '@/hooks/useProduits'
import type { RagConfig } from '@/types'

// ── Constantes ────────────────────────────────────────────────────
const TRIM_STATUT_COLORS: Record<TrimStatut, string> = {
  'On track':  'bg-emerald-50 text-emerald-700',
  'At risk':   'bg-amber-50 text-amber-700',
  'Off track': 'bg-rose-50 text-rose-700',
  'En pause':  'bg-slate-100 text-slate-500',
}
const TRIM_STATUT_BAR: Record<TrimStatut, string> = {
  'On track':  'bg-emerald-400',
  'At risk':   'bg-amber-400',
  'Off track': 'bg-rose-400',
  'En pause':  'bg-slate-300',
}
const RISQUE_COLORS: Record<string, string> = {
  Faible:   'bg-emerald-50 text-emerald-700',
  Moyen:    'bg-amber-50 text-amber-700',
  Élevé:    'bg-amber-50 text-amber-700',
  Critique: 'bg-rose-50 text-rose-700',
}

type SortKey = 'nom' | 'statut' | 'avancement'
interface ProduitForm { nom: string; description: string; couleur: string }
type CreateMode = 'vierge' | 'dupliquer' | 'modele'

// ── Carte produit ─────────────────────────────────────────────────
function ProduitCard({ p, isAdmin, isActif, roleLabel, roleColor, onEnterConfig, onEnterDashboard, onEdit, onDelete, onToggleTemplate, onToggleActif }: {
  p: Produit; isAdmin: boolean; isActif: boolean
  roleLabel: string; roleColor: string
  onEnterConfig: () => void; onEnterDashboard: () => void
  onEdit: () => void; onDelete: () => void
  onToggleTemplate: () => void; onToggleActif: () => void
}) {
  const trims       = Array.isArray(p.objectifs_trimestriels) ? p.objectifs_trimestriels : []
  const activeTrim  = [...trims].reverse().find(t => !t.cloture && (t.trimestre || t.statut != null || t.objectifs?.length))
  const lastTrim    = [...trims].reverse().find(t => t.trimestre || t.statut != null || t.objectifs?.length)
  const displayTrim = activeTrim ?? lastTrim
  const trimPct     = displayTrim ? trimAvancement(displayTrim) : null
  const barCls      = displayTrim?.statut ? (TRIM_STATUT_BAR[displayTrim.statut] ?? 'bg-indigo-400') : 'bg-indigo-400'

  const diffJours = p.date_lancement_cible
    ? Math.floor((Date.now() - new Date(p.date_lancement_cible).getTime()) / 86400000)
    : null
  const enRetard = diffJours !== null && diffJours > 0

  const nbTrims   = trims.length
  const nbCloture = trims.filter(t => t.cloture).length

  const totalPrevEtp = trims.reduce((s, t) => s + (t.budget_etp  ?? 0), 0)
  const totalRealEtp = trims.reduce((s, t) => s + (t.realise_etp ?? 0), 0)
  const totalPrevJ   = Math.round(totalPrevEtp * 65)
  const totalRealJ   = Math.round(totalRealEtp * 65)
  const ecartEtp     = totalRealEtp - totalPrevEtp
  const hasBudget    = totalPrevEtp > 0 || totalRealEtp > 0

  return (
    <div className={cn(
      'group bg-card rounded-2xl border overflow-hidden transition-all',
      p.actif ? 'cursor-pointer' : 'cursor-default opacity-60 grayscale-[40%]',
      isActif ? 'border-indigo-300 ring-2 ring-indigo-100 shadow-md' : 'border-border hover:shadow-md hover:-translate-y-0.5',
      p.is_template && 'ring-1 ring-amber-200',
    )} onClick={p.actif ? onEnterConfig : undefined}>
      <div className="h-2 shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="font-bold text-navy text-sm truncate">{p.nom}</span>
              {p.is_template && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[11px] font-bold shrink-0">
                  <Star size={8} className="fill-amber-400 stroke-amber-500" /> Modèle
                </span>
              )}
              {isActif && (
                <span className="text-[11px] px-1.5 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded-full shrink-0">Actif</span>
              )}
              {!p.actif && (
                <span className="text-[11px] px-1.5 py-0.5 bg-slate-100 text-slate-500 font-bold rounded-full shrink-0">Inactif</span>
              )}
            </div>
            {p.description && (
              <p className="text-xs text-subtle line-clamp-1">{p.description}</p>
            )}
          </div>
          <div className="flex gap-1 ml-2 shrink-0" onClick={e => e.stopPropagation()}>
            {p.actif && (
              <button onClick={onEnterDashboard} title="Voir le dashboard"
                className="p-1.5 rounded-lg hover:bg-indigo-50 text-subtle hover:text-indigo-600 transition-colors">
                <LayoutDashboard size={13} />
              </button>
            )}
            {isAdmin && (
              <>
                {p.actif && (
                  <button onClick={onToggleTemplate}
                    title={p.is_template ? 'Retirer le statut modèle' : 'Marquer comme modèle'}
                    className={cn('p-1.5 rounded-lg transition-colors',
                      p.is_template ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-subtle hover:bg-amber-50 hover:text-amber-600')}>
                    <Star size={13} className={p.is_template ? 'fill-amber-400 stroke-amber-500' : ''} />
                  </button>
                )}
                {p.actif && (
                  <button onClick={onEdit}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-subtle hover:text-slate-600 transition-colors">
                    <Settings2 size={13} />
                  </button>
                )}
                <button onClick={onToggleActif}
                  title={p.actif ? 'Désactiver ce produit' : 'Réactiver ce produit'}
                  className={cn('p-1.5 rounded-lg transition-colors',
                    p.actif
                      ? 'text-subtle hover:bg-amber-50 hover:text-amber-600'
                      : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100')}>
                  <Power size={13} />
                </button>
                {p.actif && (
                  <button onClick={onDelete}
                    className="p-1.5 rounded-lg hover:bg-rose-50 text-subtle hover:text-rose-600 transition-colors">
                    <X size={13} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Vision */}
        {p.vision && (
          <p className="text-xs text-navy/70 leading-snug line-clamp-2 mb-3 border-l-2 border-indigo-200 pl-2">
            {p.vision}
          </p>
        )}

        {/* Badges */}
        {(p.theme || p.niveau_risque || p.priorite_strategique) && (
          <div className="flex flex-wrap gap-1 mb-3">
            {p.theme && (
              <span className="text-[11px] px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-medium">{p.theme}</span>
            )}
            {p.niveau_risque && (
              <span className={cn('text-[11px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5', RISQUE_COLORS[p.niveau_risque] ?? 'bg-slate-100 text-slate-600')}>
                <AlertTriangle size={8} /> {p.niveau_risque}
              </span>
            )}
            {p.priorite_strategique && (
              <span className="text-[11px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">
                {'★'.repeat(p.priorite_strategique)} P{p.priorite_strategique}
              </span>
            )}
          </div>
        )}

        {/* Trimestre actif */}
        {displayTrim && (displayTrim.statut || trimPct !== null) && (
          <div className="mb-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {displayTrim.trimestre && (
                  <span className="text-[11px] text-subtle font-medium">{displayTrim.trimestre}</span>
                )}
                {displayTrim.cloture && (
                  <span className="text-[11px] text-navy/50 font-medium">(Clôturé)</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {displayTrim.statut && (
                  <span className={cn('text-[11px] px-1.5 py-0.5 rounded-full font-semibold', TRIM_STATUT_COLORS[displayTrim.statut])}>
                    {displayTrim.statut}
                  </span>
                )}
                {trimPct !== null && (
                  <span className="text-[11px] font-bold text-navy tabular-nums">{trimPct} %</span>
                )}
              </div>
            </div>
            {trimPct !== null && (
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className={cn('h-full rounded-full transition-all', barCls)} style={{ width: `${trimPct}%` }} />
              </div>
            )}
          </div>
        )}

        {/* Budget ETP */}
        {hasBudget && (
          <div className="mb-3 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Prév.</span>
              <span className="text-xs font-bold text-navy tabular-nums">
                {totalPrevEtp > 0
                  ? <>{totalPrevEtp.toFixed(1)} ETP <span className="font-normal text-subtle">·</span> {totalPrevJ} j</>
                  : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-emerald-600 font-semibold uppercase tracking-wide">Conso.</span>
              <span className={cn('text-xs font-bold tabular-nums', totalRealEtp > 0 ? 'text-emerald-600' : 'text-subtle')}>
                {totalRealEtp > 0
                  ? <>{totalRealEtp.toFixed(1)} ETP <span className="font-normal text-emerald-300">·</span> {totalRealJ} j</>
                  : '—'}
              </span>
            </div>
            {totalPrevEtp > 0 && totalRealEtp > 0 && (
              <div className="flex items-center justify-between border-t border-slate-200 pt-1.5">
                <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Écart</span>
                <span className={cn('text-xs font-bold tabular-nums flex items-center gap-0.5',
                  ecartEtp > 0 ? 'text-rose-600' : ecartEtp < 0 ? 'text-emerald-600' : 'text-subtle')}>
                  {ecartEtp > 0 ? <TrendingUp size={9} /> : ecartEtp < 0 ? <TrendingDown size={9} /> : null}
                  {ecartEtp >= 0 ? '+' : ''}{ecartEtp.toFixed(1)} ETP
                  <span className="font-normal text-subtle mx-0.5">·</span>
                  {ecartEtp >= 0 ? '+' : ''}{Math.round(ecartEtp * 65)} j
                </span>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <div className="flex items-center gap-2">
            <span className={cn('text-[11px] font-semibold px-1.5 py-0.5 rounded-full', roleColor)}>
              {roleLabel}
            </span>
            {nbTrims > 0 && (
              <span className="text-[11px] text-subtle">
                {nbTrims} trim.{nbCloture > 0 && ` · ${nbCloture} clôt.`}
              </span>
            )}
            {p.date_lancement_cible && (
              <span className={cn('text-[11px] font-medium flex items-center gap-0.5', enRetard ? 'text-rose-600' : 'text-subtle')}>
                {enRetard
                  ? <><AlertTriangle size={9} /> +{diffJours}j</>
                  : <><Calendar size={9} /> {new Date(p.date_lancement_cible).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}</>
                }
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 text-subtle group-hover:text-indigo-600 transition-colors">
            <span className="text-[11px] font-medium">Paramètres</span>
            <ChevronRight size={12} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Formulaire renommage ──────────────────────────────────────────
function ProduitFormCard({ initial, onSave, onCancel, loading }: {
  initial?: ProduitForm; onSave: (f: ProduitForm) => Promise<void>; onCancel: () => void; loading: boolean
}) {
  const [nom, setNom]         = useState(initial?.nom ?? '')
  const [desc, setDesc]       = useState(initial?.description ?? '')
  const [couleur, setCouleur] = useState(initial?.couleur ?? BRAND_COLORS[0])

  return (
    <div className="bg-card rounded-2xl border border-indigo-200 p-5 shadow-sm">
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
              className={cn('w-6 h-6 rounded-full transition-transform hover:scale-110', couleur === c && 'ring-2 ring-slate-700 ring-offset-2')}
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

// ── CheckOption ───────────────────────────────────────────────────
function CheckOption({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <div className={cn(
        'w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0',
        checked ? 'bg-indigo-500 border-indigo-500' : 'border-border group-hover:border-indigo-300'
      )} onClick={() => onChange(!checked)}>
        {checked && <Check size={10} className="text-white" />}
      </div>
      <span className="text-xs text-navy">{label}</span>
    </label>
  )
}

// ── Modale création ───────────────────────────────────────────────
function CreateModal({ produits, onClose, onCreate, onDuplicate, loading }: {
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
      if (src) { setNom(`Copie de ${src.nom}`); setDesc(src.description ?? ''); setCouleur(src.couleur ?? BRAND_COLORS[0]) }
    } else { setNom(''); setDesc(''); setCouleur(BRAND_COLORS[0]) }
  }

  function resetMode(m: CreateMode) {
    setMode(m); setSourceId(''); setNom(''); setDesc(''); setCouleur(BRAND_COLORS[0])
    setCopyDod(true); setCopyTaches(false); setCopySprints(false)
  }

  async function handleSubmit() {
    const f: ProduitForm = { nom: nom.trim(), description: desc, couleur }
    if (mode === 'vierge') await onCreate(f)
    else { if (!sourceId) return; await onDuplicate({ sourceId: Number(sourceId), ...f, copyDod, copyTaches, copySprints }) }
  }

  const canSubmit = nom.trim() && (mode === 'vierge' || sourceId !== '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="h-2" style={{ background: couleur }} />
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-navy">Nouveau produit</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-subtle hover:text-navy transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="mb-5">
            <div className="ds-label mb-2">Base de départ</div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'vierge',    label: 'Vierge',       icon: <Plus size={16} />,           desc: 'Produit vide' },
                { id: 'dupliquer', label: 'Dupliquer',     icon: <Copy size={16} />,           desc: 'Depuis un existant' },
                { id: 'modele',    label: 'Depuis modèle', icon: <LayoutTemplate size={16} />, desc: 'Produits modèles' },
              ] as { id: CreateMode; label: string; icon: React.ReactNode; desc: string }[]).map(opt => (
                <button key={opt.id} type="button" onClick={() => resetMode(opt.id)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-xs font-medium transition-all',
                    mode === opt.id
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                      : 'border-border text-subtle hover:border-slate-300 hover:text-navy'
                  )}>
                  {opt.icon}
                  <span className="font-semibold">{opt.label}</span>
                  <span className="text-[11px] opacity-70">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {mode !== 'vierge' && (
            <div className="mb-4">
              <label className="ds-label mb-1 block">{mode === 'modele' ? 'Modèle à utiliser' : 'Produit à dupliquer'}</label>
              {sources.length === 0 ? (
                <div className="text-xs text-subtle italic px-3 py-2 bg-slate-50 rounded-xl">
                  {mode === 'modele' ? 'Aucun modèle — marquez un produit avec ★.' : 'Aucun produit.'}
                </div>
              ) : (
                <select value={sourceId} onChange={e => onSourceChange(e.target.value === '' ? '' : Number(e.target.value))} className="ds-select">
                  <option value="">— Sélectionner —</option>
                  {sources.map(p => <option key={p.id} value={p.id}>{p.nom}{p.is_template ? ' ★' : ''}</option>)}
                </select>
              )}
            </div>
          )}

          {mode !== 'vierge' && sourceId !== '' && (
            <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="ds-label mb-2">Éléments à copier</div>
              <div className="flex flex-col gap-2">
                <CheckOption label="Critères DoD" checked={copyDod} onChange={setCopyDod} />
                <CheckOption label="Tâches / US (remises à zéro)" checked={copyTaches} onChange={setCopyTaches} />
                <CheckOption label="Sprints (remis en planifié)" checked={copySprints} onChange={setCopySprints} />
              </div>
            </div>
          )}

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

          <div className="mb-5">
            <label className="ds-label mb-1.5 block">Couleur</label>
            <div className="flex gap-2 flex-wrap">
              {BRAND_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setCouleur(c)}
                  className={cn('w-6 h-6 rounded-full transition-transform hover:scale-110', couleur === c && 'ring-2 ring-slate-700 ring-offset-2')}
                  style={{ background: c }} />
              ))}
            </div>
          </div>

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

// ── Panneau défauts qualité globaux ──────────────────────────────
function RagDefaultsPanel({ onClose }: { onClose: () => void }) {
  const { ragConfigDefault } = useAppSettings()
  const updateSettings = useUpdateAppSettings()
  const toast = useToast()
  const [config, setConfig] = useState<RagConfig>(() => ragConfigDefault)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await updateSettings.mutateAsync({ rag_config_default: config })
      toast('Paramètres qualité par défaut enregistrés')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 mb-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xs font-bold text-navy uppercase tracking-wider">Paramètres qualité par défaut</h2>
          <p className="text-[11px] text-subtle mt-0.5">Seuils appliqués à tous les produits sans config spécifique</p>
        </div>
        <button onClick={onClose} className="text-subtle hover:text-navy transition-colors">
          <X size={14} />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {([
          { key: 'avancement', label: 'Avancement', hint: '% en dessous du curseur' },
          { key: 'budget',     label: 'Budget',     hint: '% de dépassement' },
          { key: 'blocages',   label: 'Blocages',   hint: 'nb de blocages / risques' },
        ] as const).map(({ key, label, hint }) => (
          <div key={key} className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
            <div>
              <div className="text-xs font-semibold text-navy">{label}</div>
              <div className="text-[11px] text-subtle">{hint}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-amber-600 font-bold uppercase tracking-wide block mb-0.5">Attention ≥</label>
                <input type="number" min="0" step="1" value={config[key].amber}
                  onChange={e => setConfig(c => ({ ...c, [key]: { ...c[key], amber: Number(e.target.value) } }))}
                  className="ds-input text-xs text-center w-full" />
              </div>
              <div>
                <label className="text-[10px] text-rose-600 font-bold uppercase tracking-wide block mb-0.5">Critique ≥</label>
                <input type="number" min="0" step="1" value={config[key].red}
                  onChange={e => setConfig(c => ({ ...c, [key]: { ...c[key], red: Number(e.target.value) } }))}
                  className="ds-input text-xs text-center w-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-4">
        <button onClick={handleSave} disabled={saving}
          className="ds-btn-primary ds-btn-sm flex items-center gap-1.5 disabled:opacity-50">
          <Check size={13} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button onClick={onClose} className="ds-btn ds-btn-sm">Annuler</button>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────
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

  const [showCreate,      setShowCreate]      = useState(false)
  const [showWizard,      setShowWizard]      = useState(false)
  const [editingId,       setEditingId]       = useState<number | null>(null)
  const [showRagDefaults, setShowRagDefaults] = useState(false)
  const [showArchives,    setShowArchives]    = useState(false)
  const [search,          setSearch]          = useState('')
  const [sortBy,          setSortBy]          = useState<SortKey>(() => {
    try { return (localStorage.getItem('produits-sortBy') as SortKey) || 'nom' } catch { return 'nom' }
  })

  const produitsAccessibles = produits.filter(p =>
    p.actif && (isAdmin || getRoleForProduit(p.id) !== null)
  )
  const produitsInactifs = isAdmin ? produits.filter(p => !p.actif) : []

  const produitsFiltres = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = q
      ? produitsAccessibles.filter(p =>
          p.nom.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)
        )
      : [...produitsAccessibles]

    list.sort((a, b) => {
      if (sortBy === 'nom') return a.nom.localeCompare(b.nom, 'fr')
      if (sortBy === 'statut') {
        const getStatut = (p: Produit) => {
          const ts = Array.isArray(p.objectifs_trimestriels) ? p.objectifs_trimestriels : []
          return [...ts].reverse().find(t => !t.cloture && t.statut)?.statut ?? 'z'
        }
        const order: Record<string, number> = { 'Off track': 0, 'At risk': 1, 'On track': 2, 'En pause': 3, 'z': 4 }
        return (order[getStatut(a)] ?? 4) - (order[getStatut(b)] ?? 4)
      }
      if (sortBy === 'avancement') {
        const getPct = (p: Produit) => {
          const ts = Array.isArray(p.objectifs_trimestriels) ? p.objectifs_trimestriels : []
          const t = [...ts].reverse().find(tt => !tt.cloture && tt.objectifs?.length)
          return t ? (trimAvancement(t) ?? -1) : -1
        }
        return getPct(b) - getPct(a)
      }
      return 0
    })
    return list
  }, [produitsAccessibles, search, sortBy])

  function handleSortBy(k: SortKey) {
    setSortBy(k)
    try { localStorage.setItem('produits-sortBy', k) } catch {}
  }

  function roleLabel(pid: number) {
    if (isAdmin) return 'Admin'
    const r = getRoleForProduit(pid)
    if (r === 'po')      return 'PO'
    if (r === 'dev')     return 'Développeur'
    if (r === 'lecteur') return 'Lecteur'
    return ''
  }
  function roleColor(pid: number) {
    if (isAdmin) return 'bg-indigo-50 text-indigo-700'
    const r = getRoleForProduit(pid)
    if (r === 'po')      return 'bg-slate-100 text-slate-600'
    if (r === 'dev')     return 'bg-emerald-50 text-emerald-700'
    if (r === 'lecteur') return 'bg-slate-50 text-slate-500'
    return ''
  }

  function enterConfig(p: Produit) {
    setProduitActif({ id: p.id, nom: p.nom, couleur: p.couleur })
    navigate('/produit-config')
  }
  function enterDashboard(p: Produit) {
    setProduitActif({ id: p.id, nom: p.nom, couleur: p.couleur })
    navigate('/produit-dashboard')
  }

  async function handleCreate(f: ProduitForm) {
    if (!f.nom.trim()) { toast('Nom obligatoire', 'error'); return }
    const p = await createProduit.mutateAsync({ nom: f.nom.trim(), description: f.description || null, couleur: f.couleur, actif: true, is_template: false as boolean })
    toast(`Produit "${p.nom}" créé`)
    setShowCreate(false)
    setProduitActif({ id: p.id, nom: p.nom, couleur: p.couleur })
    navigate('/produit-config')
  }

  async function handleDuplicate(opts: Omit<DuplicateOptions, 'sourceId'> & { sourceId: number }) {
    if (!opts.nom.trim()) { toast('Nom obligatoire', 'error'); return }
    const p = await duplicateProduit.mutateAsync({ ...opts, nom: opts.nom.trim(), description: opts.description || null })
    toast(`Produit "${p.nom}" créé`)
    setShowCreate(false)
    setProduitActif({ id: p.id, nom: p.nom, couleur: p.couleur })
    navigate('/produit-config')
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

  async function handleToggleActif(p: Produit) {
    await updateProduit.mutateAsync({ id: p.id, updates: { actif: !p.actif } })
    if (!p.actif) {
      toast(`"${p.nom}" réactivé — visible dans toutes les vues`)
    } else {
      toast(`"${p.nom}" désactivé — masqué de toutes les vues`)
      if (produitActif?.id === p.id) setProduitActif(null)
    }
  }

  const isSaving  = createProduit.isPending || duplicateProduit.isPending
  const nbModeles = produitsAccessibles.filter(p => p.is_template).length

  if (isLoading) return <Layout><Spinner /></Layout>

  return (
    <Layout>
      {/* Topbar */}
      <div className="page-topbar -mx-3 -mt-3 mb-5 px-3 md:-mx-5 md:-mt-5 md:px-5">
        <h1 className="text-sm font-semibold text-navy">Produits</h1>
        <span className="text-xs text-subtle ml-1">
          {produitsAccessibles.length - nbModeles} produit{produitsAccessibles.length - nbModeles !== 1 ? 's' : ''}
          {nbModeles > 0 && ` · ${nbModeles} modèle${nbModeles !== 1 ? 's' : ''}`}
          {produitsInactifs.length > 0 && ` · ${produitsInactifs.length} archivé${produitsInactifs.length !== 1 ? 's' : ''}`}
        </span>

        {/* Recherche */}
        <div className="relative ml-2">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="ds-input text-xs pl-7 py-1 w-44 placeholder:text-slate-400"
          />
        </div>

        {/* Tri */}
        <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
          <span className="px-2 text-slate-400 border-r border-slate-200 py-1.5">
            <ArrowUpDown size={11} />
          </span>
          {([
            { k: 'nom',        label: 'Nom' },
            { k: 'statut',     label: 'Statut' },
            { k: 'avancement', label: 'Avancement' },
          ] as { k: SortKey; label: string }[]).map(({ k, label }) => (
            <button key={k} onClick={() => handleSortBy(k)}
              className={cn('px-2.5 py-1.5 border-l border-slate-200 transition-colors',
                sortBy === k ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              )}>
              {label}
            </button>
          ))}
        </div>

        {isAdmin && (
          <button onClick={() => setShowRagDefaults(v => !v)}
            className={cn('flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border transition-colors',
              showRagDefaults
                ? 'bg-slate-100 text-slate-600 border-slate-200'
                : 'text-subtle hover:text-navy border-transparent hover:border-border hover:bg-slate-50')}>
            <SlidersHorizontal size={12} /> Qualité par défaut
          </button>
        )}
        {isAdmin && (
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={() => setShowWizard(true)}
              className="ds-btn ds-btn-sm flex items-center gap-1.5">
              <Sparkles size={13} /> Créer avec assistant
            </button>
            <button onClick={() => { setShowCreate(true); setEditingId(null) }}
              className="ds-btn-primary ds-btn-sm flex items-center gap-1.5">
              <Plus size={13} /> Nouveau produit
            </button>
          </div>
        )}
      </div>

      {/* Panneau qualité par défaut */}
      {isAdmin && showRagDefaults && (
        <RagDefaultsPanel onClose={() => setShowRagDefaults(false)} />
      )}

      {/* Modale création */}
      {showCreate && (
        <CreateModal
          produits={produits}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
          onDuplicate={opts => handleDuplicate(opts)}
          loading={isSaving}
        />
      )}

      {/* Assistant de création complet */}
      {showWizard && (
        <CreateProduitWizard
          onClose={() => setShowWizard(false)}
          onDone={p => {
            setShowWizard(false)
            toast(`Produit "${p.nom}" prêt`)
            navigate('/produit-config')
          }}
        />
      )}

      {/* Grille */}
      {produitsAccessibles.length === 0 ? (
        <div className="text-center py-20 text-subtle">
          <Package size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="font-medium">Aucun produit accessible</p>
          <p className="text-xs mt-1">Contactez un administrateur pour obtenir un accès.</p>
        </div>
      ) : produitsFiltres.length === 0 ? (
        <div className="text-center py-16 text-subtle">
          <Search size={24} className="text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium">Aucun résultat pour "{search}"</p>
          <button onClick={() => setSearch('')} className="text-xs text-indigo-600 hover:underline mt-1">
            Effacer la recherche
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {produitsFiltres.map(p =>
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
                onEnterConfig={() => enterConfig(p)}
                onEnterDashboard={() => enterDashboard(p)}
                onEdit={() => { setEditingId(p.id); setShowCreate(false) }}
                onDelete={() => handleDelete(p)}
                onToggleTemplate={() => handleToggleTemplate(p)}
                onToggleActif={() => handleToggleActif(p)}
              />
            )
          )}
        </div>
      )}

      {/* Archivés */}
      {produitsInactifs.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowArchives(v => !v)}
            className="flex items-center gap-2 mb-4 text-subtle hover:text-navy transition-colors group">
            <ChevronDown size={14} className={cn('transition-transform duration-200', !showArchives && '-rotate-90')} />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Archivés ({produitsInactifs.length})
            </span>
            <span className="text-[11px] text-subtle/60">— désactivés, masqués de toutes les vues</span>
          </button>

          {showArchives && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {produitsInactifs.map(p => (
                <ProduitCard
                  key={p.id}
                  p={p}
                  isAdmin={isAdmin}
                  isActif={false}
                  roleLabel="Admin"
                  roleColor="bg-slate-100 text-slate-500"
                  onEnterConfig={() => {}}
                  onEnterDashboard={() => {}}
                  onEdit={() => {}}
                  onDelete={() => handleDelete(p)}
                  onToggleTemplate={() => {}}
                  onToggleActif={() => handleToggleActif(p)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <ToastContainer />
    </Layout>
  )
}
