import { useState } from 'react'
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
  Power, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BRAND_COLORS } from '@/constants'
import type { TrimStatut } from '@/hooks/useProduits'
import type { RagConfig } from '@/types'

// ── Constantes ────────────────────────────────────────────────────
const TRIM_STATUT_COLORS: Record<TrimStatut, string> = {
  'On track':  'bg-green/10 text-green',
  'At risk':   'bg-orange/10 text-orange',
  'Off track': 'bg-red/10 text-red',
  'En pause':  'bg-subtle/10 text-subtle',
}
const TRIM_STATUT_BAR: Record<TrimStatut, string> = {
  'On track':  'bg-green',
  'At risk':   'bg-orange',
  'Off track': 'bg-red',
  'En pause':  'bg-subtle',
}
const RISQUE_COLORS: Record<string, string> = {
  Faible:   'bg-green/10 text-green',
  Moyen:    'bg-orange/10 text-orange',
  Élevé:    'bg-orange/15 text-orange',
  Critique: 'bg-red/10 text-red',
}

interface ProduitForm { nom: string; description: string; couleur: string }
type CreateMode = 'vierge' | 'dupliquer' | 'modele'

// ── Carte produit (preview enrichie) ─────────────────────────────
function ProduitCard({ p, isAdmin, isActif, roleLabel, roleColor, onEnterConfig, onEnterDashboard, onEdit, onDelete, onToggleTemplate, onToggleActif }: {
  p: Produit; isAdmin: boolean; isActif: boolean
  roleLabel: string; roleColor: string
  onEnterConfig: () => void
  onEnterDashboard: () => void
  onEdit: () => void; onDelete: () => void
  onToggleTemplate: () => void
  onToggleActif: () => void
}) {
  // Dernier trimestre actif (non clôturé)
  const trims    = Array.isArray(p.objectifs_trimestriels) ? p.objectifs_trimestriels : []
  const activeTrim = [...trims].reverse().find(t => !t.cloture && (t.trimestre || t.statut != null || t.objectifs?.length))
  const lastTrim   = [...trims].reverse().find(t => t.trimestre || t.statut != null || t.objectifs?.length)
  const displayTrim = activeTrim ?? lastTrim
  const trimPct     = displayTrim ? trimAvancement(displayTrim) : null
  const barCls      = displayTrim?.statut ? (TRIM_STATUT_BAR[displayTrim.statut] ?? 'bg-purple') : 'bg-purple'

  // Délai lancement
  const diffJours = p.date_lancement_cible
    ? Math.floor((Date.now() - new Date(p.date_lancement_cible).getTime()) / 86400000)
    : null
  const enRetard = diffJours !== null && diffJours > 0

  const nbTrims   = trims.length
  const nbCloture = trims.filter(t => t.cloture).length

  // Budget ETP global (tous trimestres)
  const totalPrevEtp = trims.reduce((s, t) => s + (t.budget_etp   ?? 0), 0)
  const totalRealEtp = trims.reduce((s, t) => s + (t.realise_etp  ?? 0), 0)
  const totalPrevJ   = Math.round(totalPrevEtp * 65)
  const totalRealJ   = Math.round(totalRealEtp * 65)
  const ecartEtp     = totalRealEtp - totalPrevEtp
  const hasBudget    = totalPrevEtp > 0 || totalRealEtp > 0

  return (
    <div className={cn(
      'group bg-white rounded-2xl border overflow-hidden transition-all',
      p.actif ? 'cursor-pointer' : 'cursor-default opacity-60 grayscale-[40%]',
      isActif ? 'border-purple ring-2 ring-purple/20 shadow-md' : 'border-border hover:shadow-md hover:-translate-y-0.5',
      p.is_template && 'ring-1 ring-orange/30',
    )} onClick={p.actif ? onEnterConfig : undefined}>
      {/* Barre couleur */}
      <div className="h-2 shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />

      <div className="p-4">
        {/* Header : nom + actions */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="font-bold text-navy text-sm truncate">{p.nom}</span>
              {p.is_template && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-orange/10 text-orange rounded-full text-[10px] font-bold shrink-0">
                  <Star size={8} className="fill-orange stroke-orange" /> Modèle
                </span>
              )}
              {isActif && (
                <span className="text-[10px] px-1.5 py-0.5 bg-purple/10 text-purple font-bold rounded-full shrink-0">Actif</span>
              )}
              {!p.actif && (
                <span className="text-[10px] px-1.5 py-0.5 bg-subtle/10 text-subtle font-bold rounded-full shrink-0">Inactif</span>
              )}
            </div>
            {p.description && (
              <p className="text-xs text-subtle line-clamp-1">{p.description}</p>
            )}
          </div>
          {/* Actions — stoppent la propagation du clic carte */}
          <div className="flex gap-1 ml-2 shrink-0" onClick={e => e.stopPropagation()}>
            {p.actif && (
              <button onClick={onEnterDashboard} title="Voir le dashboard"
                className="p-1.5 rounded-lg hover:bg-bg text-subtle hover:text-purple transition-colors">
                <LayoutDashboard size={13} />
              </button>
            )}
            {isAdmin && (
              <>
                {p.actif && (
                  <button onClick={onToggleTemplate} title={p.is_template ? 'Retirer le statut modèle' : 'Marquer comme modèle'}
                    className={cn('p-1.5 rounded-lg transition-colors',
                      p.is_template ? 'text-orange bg-orange/5 hover:bg-orange/10' : 'text-subtle hover:bg-bg hover:text-orange')}>
                    <Star size={13} className={p.is_template ? 'fill-amber-400 stroke-amber-500' : ''} />
                  </button>
                )}
                {p.actif && (
                  <button onClick={onEdit}
                    className="p-1.5 rounded-lg hover:bg-bg text-subtle hover:text-navy transition-colors">
                    <Settings2 size={13} />
                  </button>
                )}
                <button
                  onClick={onToggleActif}
                  title={p.actif ? 'Désactiver ce produit' : 'Réactiver ce produit'}
                  className={cn('p-1.5 rounded-lg transition-colors',
                    p.actif
                      ? 'text-subtle hover:bg-orange/10 hover:text-orange'
                      : 'text-green bg-green/10 hover:bg-green/20')}>
                  <Power size={13} />
                </button>
                {p.actif && (
                  <button onClick={onDelete}
                    className="p-1.5 rounded-lg hover:bg-red/10 text-subtle hover:text-red transition-colors">
                    <X size={13} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Vision */}
        {p.vision && (
          <p className="text-xs text-navy/70 leading-snug line-clamp-2 mb-3 border-l-2 border-purple/30 pl-2">
            {p.vision}
          </p>
        )}

        {/* Badges : priorité / risque / thème */}
        {(p.theme || p.niveau_risque || p.priorite_strategique) && (
          <div className="flex flex-wrap gap-1 mb-3">
            {p.theme && (
              <span className="text-[10px] px-1.5 py-0.5 bg-purple/10 text-purple rounded-full font-medium">{p.theme}</span>
            )}
            {p.niveau_risque && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5', RISQUE_COLORS[p.niveau_risque] ?? 'bg-gray-100 text-gray-600')}>
                <AlertTriangle size={8}/> {p.niveau_risque}
              </span>
            )}
            {p.priorite_strategique && (
              <span className="text-[10px] px-1.5 py-0.5 bg-navy/10 text-navy rounded-full font-medium">
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
                  <span className="text-[10px] text-subtle font-medium">{displayTrim.trimestre}</span>
                )}
                {displayTrim.cloture && (
                  <span className="text-[10px] text-navy/50 font-medium">(Clôturé)</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {displayTrim.statut && (
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', TRIM_STATUT_COLORS[displayTrim.statut])}>
                    {displayTrim.statut}
                  </span>
                )}
                {trimPct !== null && (
                  <span className="text-[10px] font-bold text-navy tabular-nums">{trimPct} %</span>
                )}
              </div>
            </div>
            {trimPct !== null && (
              <div className="h-1.5 rounded-full bg-border overflow-hidden">
                <div className={cn('h-full rounded-full transition-all', barCls)} style={{ width: `${trimPct}%` }} />
              </div>
            )}
          </div>
        )}

        {/* Budget ETP + jours */}
        {hasBudget && (
          <div className="mb-3 bg-bg rounded-xl border border-border/50 px-3 py-2 space-y-1.5">
            {/* Prévisionnel */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-subtle font-semibold uppercase tracking-wide">Prév.</span>
              <span className="text-xs font-bold text-navy tabular-nums">
                {totalPrevEtp > 0 ? (
                  <>{totalPrevEtp.toFixed(1)} ETP <span className="font-normal text-subtle">·</span> {totalPrevJ} j</>
                ) : '—'}
              </span>
            </div>
            {/* Consommé */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-green font-semibold uppercase tracking-wide">Conso.</span>
              <span className={cn('text-xs font-bold tabular-nums', totalRealEtp > 0 ? 'text-green' : 'text-subtle')}>
                {totalRealEtp > 0 ? (
                  <>{totalRealEtp.toFixed(1)} ETP <span className="font-normal text-green/50">·</span> {totalRealJ} j</>
                ) : '—'}
              </span>
            </div>
            {/* Écart (si les deux sont renseignés) */}
            {totalPrevEtp > 0 && totalRealEtp > 0 && (
              <div className="flex items-center justify-between border-t border-border/60 pt-1.5">
                <span className="text-[10px] text-subtle font-semibold uppercase tracking-wide">Écart</span>
                <span className={cn('text-xs font-bold tabular-nums flex items-center gap-0.5',
                  ecartEtp > 0 ? 'text-red' : ecartEtp < 0 ? 'text-green' : 'text-subtle')}>
                  {ecartEtp > 0 ? <TrendingUp size={9}/> : ecartEtp < 0 ? <TrendingDown size={9}/> : null}
                  {ecartEtp >= 0 ? '+' : ''}{ecartEtp.toFixed(1)} ETP
                  <span className="font-normal text-subtle mx-0.5">·</span>
                  {ecartEtp >= 0 ? '+' : ''}{Math.round(ecartEtp * 65)} j
                </span>
              </div>
            )}
          </div>
        )}

        {/* Footer : role + date + trimestres */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <div className="flex items-center gap-2">
            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', roleColor)}>
              {roleLabel}
            </span>
            {nbTrims > 0 && (
              <span className="text-[10px] text-subtle">
                {nbTrims} trim.{nbCloture > 0 && ` · ${nbCloture} clôt.`}
              </span>
            )}
            {p.date_lancement_cible && (
              <span className={cn('text-[10px] font-medium', enRetard ? 'text-red-600' : 'text-subtle')}>
                {enRetard ? `⚠ +${diffJours}j` : `🗓 ${new Date(p.date_lancement_cible).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 text-subtle group-hover:text-purple transition-colors">
            <span className="text-[10px] font-medium">Paramètres</span>
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

// ── CheckOption ───────────────────────────────────────────────────
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="h-2" style={{ background: couleur }} />
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-navy">Nouveau produit</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg text-subtle hover:text-navy transition-colors">
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
                    mode === opt.id ? 'border-purple bg-purple/5 text-purple' : 'border-border text-subtle hover:border-navy/30 hover:text-navy'
                  )}>
                  {opt.icon}
                  <span className="font-semibold">{opt.label}</span>
                  <span className="text-[10px] opacity-70">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {mode !== 'vierge' && (
            <div className="mb-4">
              <label className="ds-label mb-1 block">{mode === 'modele' ? 'Modèle à utiliser' : 'Produit à dupliquer'}</label>
              {sources.length === 0 ? (
                <div className="text-xs text-subtle italic px-3 py-2 bg-bg rounded-xl">
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
            <div className="mb-4 p-3 bg-bg rounded-xl border border-border">
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
              <input value={nom} onChange={e => setNom(e.target.value)} className="ds-input" placeholder="Ex: Dimos D4X" autoFocus={mode === 'vierge'} />
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
                  className={cn('w-6 h-6 rounded-full transition-transform hover:scale-110', couleur === c && 'ring-2 ring-navy ring-offset-2')}
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
    <div className="bg-white border border-border rounded-2xl p-5 mb-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xs font-bold text-navy uppercase tracking-wider">Paramètres qualité par défaut</h2>
          <p className="text-[10px] text-subtle mt-0.5">Seuils appliqués à tous les produits sans config spécifique</p>
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
          <div key={key} className="bg-bg rounded-xl border border-border p-3 space-y-2">
            <div>
              <div className="text-xs font-semibold text-navy">{label}</div>
              <div className="text-[10px] text-subtle">{hint}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-orange font-bold uppercase tracking-wide block mb-0.5">Attention ≥</label>
                <input type="number" min="0" step="1" value={config[key].amber}
                  onChange={e => setConfig(c => ({ ...c, [key]: { ...c[key], amber: Number(e.target.value) } }))}
                  className="ds-input text-xs text-center w-full" />
              </div>
              <div>
                <label className="text-[9px] text-red font-bold uppercase tracking-wide block mb-0.5">Critique ≥</label>
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
  const [editingId,       setEditingId]       = useState<number | null>(null)
  const [showRagDefaults, setShowRagDefaults] = useState(false)
  const [showArchives,    setShowArchives]    = useState(false)

  // Produits accessibles (actifs) — vue normale
  const produitsAccessibles = produits.filter(p =>
    p.actif && (isAdmin || getRoleForProduit(p.id) !== null)
  )
  // Produits inactifs (admin uniquement)
  const produitsInactifs = isAdmin ? produits.filter(p => !p.actif) : []

  function roleLabel(pid: number) {
    if (isAdmin) return 'Admin'
    const r = getRoleForProduit(pid)
    if (r === 'po')      return 'PO'
    if (r === 'dev')     return 'Développeur'
    if (r === 'lecteur') return 'Lecteur'
    return ''
  }
  function roleColor(pid: number) {
    if (isAdmin) return 'bg-purple/10 text-purple'
    const r = getRoleForProduit(pid)
    if (r === 'po')      return 'bg-navy/10 text-navy'
    if (r === 'dev')     return 'bg-green/10 text-green'
    if (r === 'lecteur') return 'bg-subtle/10 text-subtle'
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

  const isSaving   = createProduit.isPending || duplicateProduit.isPending
  const nbModeles  = produitsAccessibles.filter(p => p.is_template).length

  if (isLoading) return <Layout><Spinner /></Layout>

  return (
    <Layout>
      {/* Topbar */}
      <div className="page-topbar -mx-3 -mt-3 mb-5 px-3 md:-mx-5 md:-mt-5 md:px-5">
        <h1 className="text-sm font-semibold text-navy">Produits</h1>
        <span className="text-xs text-subtle ml-2">
          {produitsAccessibles.length - nbModeles} produit{produitsAccessibles.length - nbModeles !== 1 ? 's' : ''}
          {nbModeles > 0 && ` · ${nbModeles} modèle${nbModeles !== 1 ? 's' : ''}`}
          {produitsInactifs.length > 0 && ` · ${produitsInactifs.length} archivé${produitsInactifs.length !== 1 ? 's' : ''}`}
        </span>
        {isAdmin && (
          <button onClick={() => setShowRagDefaults(v => !v)}
            className={cn('flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border transition-colors',
              showRagDefaults
                ? 'bg-navy/5 text-navy border-border'
                : 'text-subtle hover:text-navy border-transparent hover:border-border hover:bg-bg')}>
            <SlidersHorizontal size={12} /> Qualité par défaut
          </button>
        )}
        {isAdmin && (
          <button onClick={() => { setShowCreate(true); setEditingId(null) }}
            className="ml-auto ds-btn-primary ds-btn-sm flex items-center gap-1.5">
            <Plus size={13} /> Nouveau produit
          </button>
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

      {/* Grille produits actifs */}
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

      {/* Section produits archivés (admin uniquement) */}
      {produitsInactifs.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowArchives(v => !v)}
            className="flex items-center gap-2 mb-4 text-subtle hover:text-navy transition-colors group">
            <ChevronDown size={14} className={cn('transition-transform duration-200', !showArchives && '-rotate-90')} />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Archivés ({produitsInactifs.length})
            </span>
            <span className="text-[10px] text-subtle/60">— désactivés, masqués de toutes les vues</span>
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
                  roleColor="bg-subtle/10 text-subtle"
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
