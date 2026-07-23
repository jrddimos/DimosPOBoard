import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import {
  useProduits, useUpdateProduit,
  type Produit, type TrimObjectif, type TrimStatut, type TrimCheckItem, type ExpenseDetail, type EtpDetail,
  trimAvancement,
} from '@/hooks/useProduits'
import { useFinanceConfig, type FinanceConfig } from '@/hooks/useFinanceConfig'
import { TrimObjectifsChecklist } from '@/components/produit/TrimObjectifsChecklist'
import { trimEtpTotal, trimEtpCostEur } from '@/utils/produitMetrics'
import { useAppSettings } from '@/hooks/useAppSettings'
import { useProduit } from '@/contexts/ProduitContext'
import { useAuth } from '@/contexts/AuthContext'
import { useSprints } from '@/hooks/useSprints'
import { useTaches } from '@/hooks/useTaches'
import { useEquipes } from '@/hooks/useEquipes'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import { cn, formatSprintLabel } from '@/lib/utils'
import { BRAND_COLORS } from '@/constants'
import type { Sprint, Tache, RagConfig, Equipe } from '@/types'
import { RAG_CONFIG_DEFAULT } from '@/types'
import {
  Plus, Check, X, ChevronDown, ChevronLeft, ChevronRight, Lock, Unlock,
  Target, TrendingUp, Calendar, Activity, LayoutDashboard, Save,
  Layers, Play, Archive, RotateCcw, Pause,
} from 'lucide-react'

// ── Constantes ────────────────────────────────────────────────────
const NIVEAUX_RISQUE = ['Faible', 'Moyen', 'Élevé', 'Critique']
const TRIM_STATUTS: TrimStatut[] = ['On track', 'At risk', 'Off track', 'En pause']
const TRIM_STATUT_COLORS: Record<TrimStatut, string> = {
  'On track':  'bg-green/10 text-green',
  'At risk':   'bg-orange/10 text-orange',
  'Off track': 'bg-red/10 text-red',
  'En pause':  'bg-gray-100 text-gray-500',
}
const TRIM_STATUT_BAR: Record<TrimStatut, string> = {
  'On track':  'bg-green',
  'At risk':   'bg-orange',
  'Off track': 'bg-red',
  'En pause':  'bg-gray-400',
}

const JOURS_ETP_TRIM = 65

function newTrim(): TrimObjectif {
  return {
    id: crypto.randomUUID(), trimestre: '', objectifs: [],
    budget_etp: null, budget_invest: null, budget_achats: null,
    previsionnel_verrouille: false,
    sprints_ids: [],
    realise_etp: null, realise_invest: null, realise_achats: null,
    kpis: '', outcome_desc: '', outcome_euros: null,
    statut: null, lance: false, pause: false, cloture: false,
    jours_ouvres: undefined,
    budget_invest_details: undefined, realise_invest_details: undefined,
    budget_achats_details: undefined, realise_achats_details: undefined,
    budget_etp_detail: undefined, realise_etp_detail: undefined,
  }
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}
function ecartClass(v: number) {
  if (v > 0) return 'text-red font-bold'
  if (v < 0) return 'text-green font-semibold'
  return 'text-subtle'
}

// ── Cellule budget avec arbre de dépenses indépendant ─────────────
function BudgetCell({ details, total, disabled, expanded, colorTotal, onToggle, onAdd, onUpdate, onRemove }: {
  details:    ExpenseDetail[]
  total:      number | null
  disabled:   boolean
  expanded:   boolean
  colorTotal: string
  onToggle:   () => void
  onAdd:      () => void
  onUpdate:   (id: string, field: 'label' | 'montant', value: string | number) => void
  onRemove:   (id: string) => void
}) {
  return (
    <div className="space-y-1">
      {/* Ligne parent */}
      <div className="flex items-center gap-1">
        {details.length > 0 && (
          <button onClick={onToggle} className="text-subtle hover:text-navy shrink-0 transition-colors">
            {expanded ? <ChevronDown size={10}/> : <ChevronRight size={10}/>}
          </button>
        )}
        {details.length > 0
          ? <span className={cn('text-xs font-semibold tabular-nums flex-1 text-right', colorTotal)}>
              {fmt(total ?? 0)}
            </span>
          : <input type="number" min="0" step="1000" value={total ?? ''} placeholder="0"
              disabled={disabled}
              onChange={e => onUpdate('__total__', 'montant', e.target.value === '' ? 0 : Number(e.target.value))}
              className={cn('ds-input text-xs text-right w-full', disabled && 'bg-bg cursor-not-allowed opacity-60')} />
        }
        {!disabled && (
          <button onClick={onAdd} title="Détailler" className="text-subtle hover:text-blue transition-colors shrink-0">
            <Plus size={10}/>
          </button>
        )}
      </div>
      {/* Lignes détail */}
      {expanded && (
        <div className="space-y-0.5 pl-2 border-l-2 border-border/60 ml-1">
          {details.map(d => (
            <div key={d.id} className="flex items-center gap-1">
              <input type="text" value={d.label} placeholder="Libellé…"
                onChange={e => onUpdate(d.id, 'label', e.target.value)}
                className="ds-input text-xs flex-1 min-w-0 py-0.5" />
              <input type="number" min="0" step="100" value={d.montant || ''} placeholder="0"
                disabled={disabled}
                onChange={e => onUpdate(d.id, 'montant', Number(e.target.value) || 0)}
                className={cn('ds-input text-xs text-right w-20 shrink-0 py-0.5', disabled && 'opacity-60 cursor-not-allowed bg-bg')} />
              {!disabled && (
                <button onClick={() => onRemove(d.id)} className="text-subtle hover:text-red shrink-0 transition-colors">
                  <X size={9}/>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── TrimRow ───────────────────────────────────────────────────────
function TrimRow({ t, onChange, onDelete, isAdmin, sprints, taches, usedSprintIds, equipes, financeConfig }: {
  t: TrimObjectif
  onChange: (updated: TrimObjectif) => void
  onDelete: () => void
  isAdmin: boolean
  sprints: Sprint[]
  taches: Tache[]
  usedSprintIds: string[]   // numeros déjà rattachés à un autre trim
  equipes: Equipe[]
  financeConfig: FinanceConfig | undefined
}) {
  const isPause        = !!t.pause
  const isLance        = !!t.lance && !isPause   // actif = lancé ET pas en pause
  const isCloture      = !!t.cloture
  const wasLaunched    = !!t.lance               // a été lancé au moins une fois
  const prevVerrouille = !!t.previsionnel_verrouille
  const prevEditable   = isAdmin || !prevVerrouille
  const selectedIds    = t.sprints_ids ?? []

  // Tri ouvert par défaut si lancé (et non clôturé ni en pause)
  const [collapsed,      setCollapsed]      = useState(!isLance || isCloture || isPause)
  const [showPicker,     setShowPicker]     = useState(false)
  const [tempSelection,  setTempSelection]  = useState<string[]>([])
  const [expandPrevInvest,  setExpandPrevInvest]  = useState(() => (t.budget_invest_details  ?? []).length > 0)
  const [expandConsoInvest, setExpandConsoInvest] = useState(() => (t.realise_invest_details ?? []).length > 0)
  const [expandPrevAchats,  setExpandPrevAchats]  = useState(() => (t.budget_achats_details  ?? []).length > 0)
  const [expandConsoAchats, setExpandConsoAchats] = useState(() => (t.realise_achats_details ?? []).length > 0)
  // Buffer texte local pour budget_etp (pas de resync depuis `t` : `set()`
  // renvoie un nombre au parent, qui repasserait par ex. "2." → 2 et
  // effacerait le point décimal en cours de frappe, cf. bug déjà corrigé
  // sur l'effort dans TacheDetailPanel).
  const [etpText, setEtpText] = useState(() => t.budget_etp != null ? String(t.budget_etp) : '')
  // Même buffer, par ligne, pour la répartition ETP par équipe — en plus du
  // point décimal (même souci que ci-dessus), `d.etp || ''` effaçait aussi
  // le champ dès qu'on tapait un "0" en tête (ex. "0.2"), car 0 est falsy.
  const [etpDrafts, setEtpDrafts] = useState<Record<string, string>>({})

  function openPicker() {
    setTempSelection([...selectedIds])
    setShowPicker(true)
  }
  function validatePicker() {
    set('sprints_ids', tempSelection)
    setShowPicker(false)
  }
  function cancelPicker() { setShowPicker(false) }
  function toggleTemp(numero: string) {
    setTempSelection(prev =>
      prev.includes(numero) ? prev.filter(s => s !== numero) : [...prev, numero]
    )
  }

  function set<K extends keyof TrimObjectif>(k: K, v: TrimObjectif[K]) {
    onChange({ ...t, [k]: v })
  }

  // ── Dépenses détaillées ────────────────────────────────────────
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }
  function calcSum(arr: ExpenseDetail[]) { return arr.length ? arr.reduce((s, d) => s + d.montant, 0) : null }

  type DetailKey = 'budget_invest_details' | 'realise_invest_details' | 'budget_achats_details' | 'realise_achats_details'
  type TotalKey  = 'budget_invest' | 'realise_invest' | 'budget_achats' | 'realise_achats'

  function makeOps(dk: DetailKey, tk: TotalKey, setExpand: (v: boolean) => void) {
    const list = (t[dk] as ExpenseDetail[] | undefined) ?? []
    return {
      list,
      add() {
        const next = [...list, { id: newId(), label: '', montant: 0 }]
        onChange({ ...t, [dk]: next, [tk]: calcSum(next) })
        setExpand(true)
      },
      update(id: string, field: 'label' | 'montant', value: string | number) {
        if (id === '__total__') { onChange({ ...t, [tk]: value === '' || value === 0 ? null : Number(value) }); return }
        const next = list.map(d => d.id === id ? { ...d, [field]: value } : d)
        onChange({ ...t, [dk]: next, [tk]: calcSum(next) })
      },
      remove(id: string) {
        const next = list.filter(d => d.id !== id)
        onChange({ ...t, [dk]: next.length ? next : undefined, [tk]: calcSum(next) })
      },
    }
  }

  // ── Répartition ETP par équipe ──────────────────────────────────
  function calcEtpSum(arr: EtpDetail[]) { return arr.length ? arr.reduce((s, d) => s + (d.etp || 0), 0) : null }
  const etpDetailList = t.budget_etp_detail ?? []
  const etpOps = {
    list: etpDetailList,
    add() {
      const next = [...etpDetailList, { id: newId(), equipe_id: equipes[0]?.id ?? null, etp: 0 }]
      onChange({ ...t, budget_etp_detail: next, budget_etp: calcEtpSum(next) })
    },
    update(id: string, field: 'equipe_id' | 'etp', value: number | null) {
      const next = etpDetailList.map(d => d.id === id ? { ...d, [field]: value } : d)
      onChange({ ...t, budget_etp_detail: next, budget_etp: calcEtpSum(next) })
    },
    remove(id: string) {
      const next = etpDetailList.filter(d => d.id !== id)
      onChange({ ...t, budget_etp_detail: next.length ? next : undefined, budget_etp: calcEtpSum(next) })
      setEtpDrafts(prev => { const n = { ...prev }; delete n[id]; return n })
    },
  }
  const joursTrim   = financeConfig?.jours_par_trim ?? JOURS_ETP_TRIM
  const prevEtpCost = trimEtpCostEur(t, financeConfig, joursTrim)

  // Sprints disponibles : non rattachés à un autre trim, ou déjà dans celui-ci
  const availableSprints = sprints.filter(s =>
    !usedSprintIds.includes(s.numero) || selectedIds.includes(s.numero)
  )

  // ETP auto depuis les sprints sélectionnés
  // `ta.sprint` (l'ancien champ) porte une valeur par défaut ('S01' constaté
  // en base) sur la quasi-totalité des tâches — seul sprint_debut est fiable
  // (même bug corrigé dans sprintEligibility.ts).
  const faitAutoTaches     = taches.filter(ta => ta.type_tache !== 'Conteneur' && selectedIds.includes(ta.sprint_debut ?? '') && ta.statut === 'Fait')
  const totalJoursRealises = faitAutoTaches.reduce((s, ta) => s + (ta.effort_realise_j ?? 0), 0)
  const etpAutoCalc        = totalJoursRealises / JOURS_ETP_TRIM

  // Calculs budget
  const tjmMoyen  = (financeConfig?.equipe_tjms?.length ?? 0) > 0
    ? Math.round(financeConfig!.equipe_tjms.reduce((s, e) => s + e.tjm, 0) / financeConfig!.equipe_tjms.length)
    : 500
  const totalPrev = prevEtpCost + (t.budget_invest ?? 0) + (t.budget_achats ?? 0)
  const totalReal = (t.realise_etp ?? 0) * tjmMoyen * joursTrim + (t.realise_invest ?? 0) + (t.realise_achats ?? 0)
  const ecart     = totalReal - totalPrev
  const pct       = trimAvancement(t)
  const items     = t.objectifs ?? []
  const barColor  = t.statut ? TRIM_STATUT_BAR[t.statut] : 'bg-purple'

  function setItems(next: TrimCheckItem[]) { set('objectifs', next) }

  // Couleur de bordure selon l'état
  const borderCls = isCloture
    ? 'border-navy/20 opacity-75'
    : isPause
      ? 'border-orange/40'
      : isLance
        ? 'border-purple ring-1 ring-purple/20'
        : 'border-border'

  return (
    <div className={cn('border rounded-xl overflow-hidden', borderCls)}>

      {/* ── En-tête ──────────────────────────────────────── */}
      <div className={cn(
        'flex items-center gap-2 px-4 py-2.5',
        isCloture ? 'bg-brand/5' : isPause ? 'bg-orange/5' : isLance ? 'bg-purple/5' : 'bg-bg',
        !collapsed && 'border-b border-border'
      )}>
        <input
          value={t.trimestre}
          onChange={e => !isCloture && set('trimestre', e.target.value)}
          readOnly={isCloture}
          className={cn('flex-1 bg-transparent font-bold text-sm text-navy placeholder:text-subtle/50 outline-none', isCloture && 'cursor-default')}
          placeholder="Ex : Q3 2025, T4 2026…"
        />

        {/* Résumé compact (quand réduit) */}
        {collapsed && (
          <div className="flex items-center gap-2 shrink-0">
            {isLance && !isCloture && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-purple/15 text-purple font-bold flex items-center gap-1">
                <Play size={8} className="fill-purple"/> En cours
              </span>
            )}
            {isPause && !isCloture && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-orange/15 text-orange font-bold flex items-center gap-1">
                <Pause size={8}/> En pause
              </span>
            )}
            {t.statut && (
              <span className={cn('text-[11px] px-1.5 py-0.5 rounded-full font-semibold', TRIM_STATUT_COLORS[t.statut])}>
                {t.statut}
              </span>
            )}
            {pct !== null && (
              <>
                <div className="w-16 h-1.5 rounded-full bg-border overflow-hidden">
                  <div className={cn('h-full rounded-full', barColor)} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[11px] font-bold text-navy tabular-nums">{pct}%</span>
              </>
            )}
            {selectedIds.length > 0 && (
              <span className="text-[11px] text-subtle hidden sm:inline">
                {selectedIds.length} sprint{selectedIds.length > 1 ? 's' : ''}
                {totalReal > 0 && <> · Conso. {fmt(totalReal)}</>}
              </span>
            )}
          </div>
        )}

        {/* Badge clôturé */}
        {isCloture && (
          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-brand/15 text-navy font-bold shrink-0 flex items-center gap-1">
            <Archive size={9}/> Clôturé
          </span>
        )}

        {/* Badge prévisionnel verrouillé */}
        {prevVerrouille && !isCloture && (
          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-orange/10 text-orange font-semibold shrink-0 flex items-center gap-1">
            <Lock size={9}/> Budget verrouillé
          </span>
        )}

        {/* ── Boutons d'action ────────────────────────────── */}
        {/* Verrou prévisionnel (admin seulement) */}
        {!isCloture && isAdmin && (
          prevVerrouille ? (
            <button onClick={() => set('previsionnel_verrouille', false)}
              title="Déverrouiller le budget prévisionnel (admin)"
              className="p-1 rounded hover:bg-orange/5 text-orange hover:text-orange transition-colors shrink-0">
              <Unlock size={12} />
            </button>
          ) : (
            <button onClick={() => set('previsionnel_verrouille', true)}
              title="Verrouiller le budget prévisionnel"
              className="p-1 rounded hover:bg-orange/5 text-subtle hover:text-orange transition-colors shrink-0">
              <Lock size={12} />
            </button>
          )
        )}

        {/* Machine d'états : Planifié → En cours → En pause ↔ En cours → Clôturé */}
        {/* Planifié : Lancer */}
        {!isCloture && !wasLaunched && (
          <button onClick={() => set('lance', true)}
            title="Lancer ce trimestre"
            className="p-1 rounded hover:bg-purple/10 text-subtle hover:text-purple transition-colors shrink-0">
            <Play size={13} />
          </button>
        )}
        {/* En cours : Mettre en pause */}
        {!isCloture && isLance && (
          <button onClick={() => set('pause', true)}
            title="Mettre en pause"
            className="p-1 rounded hover:bg-orange/10 text-subtle hover:text-orange transition-colors shrink-0">
            <Pause size={13} />
          </button>
        )}
        {/* En pause : Reprendre */}
        {!isCloture && isPause && (
          <button onClick={() => set('pause', false)}
            title="Reprendre ce trimestre"
            className="p-1 rounded hover:bg-purple/10 text-subtle hover:text-purple transition-colors shrink-0">
            <Play size={13} />
          </button>
        )}
        {/* En cours ou En pause : Clôturer */}
        {!isCloture && wasLaunched && (
          <button onClick={() => set('cloture', true)}
            title="Clôturer ce trimestre"
            className="p-1 rounded hover:bg-brand/10 text-subtle hover:text-navy transition-colors shrink-0">
            <Archive size={13} />
          </button>
        )}
        {/* Clôturé : Rouvrir (admin) */}
        {isCloture && isAdmin && (
          <button onClick={() => { set('cloture', false); set('pause', false) }}
            title="Rouvrir ce trimestre (admin)"
            className="p-1 rounded hover:bg-orange/5 text-orange hover:text-orange transition-colors shrink-0">
            <RotateCcw size={12} />
          </button>
        )}

        <button onClick={() => setCollapsed(c => !c)}
          className="p-1 rounded hover:bg-border text-subtle hover:text-navy transition-colors shrink-0">
          <ChevronDown size={13} className={cn('transition-transform duration-200', !collapsed && 'rotate-180')} />
        </button>
        {!isCloture && !isLance && isAdmin && (
          <button onClick={onDelete}
            className="p-1 rounded hover:bg-red/10 text-subtle hover:text-red transition-colors shrink-0">
            <X size={13} />
          </button>
        )}
      </div>

      {/* ── Corps ────────────────────────────────────────── */}
      {!collapsed && (
        <div className={cn('p-4 space-y-3', isCloture && 'pointer-events-none select-none')}>

          {/* Statut + Objectifs */}
          <div className="grid grid-cols-[140px_1fr] gap-4 bg-bg/60 rounded-xl border border-border p-3">
            <div>
              <span className="text-[11px] font-bold text-navy/75 uppercase tracking-wide block mb-1 flex items-center gap-1"><Activity size={10}/> Statut</span>
              <select value={t.statut ?? ''} disabled={isCloture}
                onChange={e => set('statut', (e.target.value || null) as TrimStatut | null)}
                className="ds-select text-xs">
                <option value="">— Non défini</option>
                {TRIM_STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <TrimObjectifsChecklist items={items} onChange={setItems} isCloture={isCloture} barColor={barColor} />
          </div>

          {/* ── Sprints de ce trimestre ─────────────────────── */}
          <div className="space-y-2 bg-bg/60 rounded-xl border border-border p-3">
            <div className="flex items-center gap-2">
              <Layers size={12} className="text-navy/60 shrink-0" />
              <span className="text-[11px] font-bold text-navy/75 uppercase tracking-wide flex-1">Sprints de ce trimestre</span>
            </div>

            {/* Chips des sprints sélectionnés */}
            {selectedIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedIds.map(num => {
                  const sp = sprints.find(s => s.numero === num)
                  // `ta.sprint` (ancien champ) porte une valeur par défaut sur la
                  // quasi-totalité des tâches, y compris jamais planifiées — seul
                  // sprint_debut est fiable (même bug corrigé dans sprintEligibility.ts).
                  const faitN = sp ? taches.filter(ta => ta.type_tache !== 'Conteneur' && ta.sprint_debut === num && ta.statut === 'Fait').length : 0
                  return (
                    <div key={num} className="flex items-center gap-1 px-2 py-1 bg-purple/10 rounded-lg text-purple">
                      <span className="text-xs font-semibold">Sprint {num}</span>
                      {sp?.stats && (
                        <span className="text-[11px] opacity-60">{faitN}/{sp.stats.total}</span>
                      )}
                      {!isCloture && (
                        <button
                          onClick={() => set('sprints_ids', selectedIds.filter(s => s !== num))}
                          className="p-0.5 rounded hover:bg-red/10 text-purple/50 hover:text-red transition-colors ml-0.5">
                          <X size={9}/>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Bouton Ajouter sprint(s) */}
            {!isCloture && !showPicker && (
              availableSprints.filter(s => !selectedIds.includes(s.numero)).length > 0 ? (
                <button onClick={openPicker}
                  className="flex items-center gap-1.5 text-xs font-semibold text-purple hover:text-purple/80 transition-colors">
                  <Plus size={12}/> Ajouter sprint(s)
                </button>
              ) : selectedIds.length === 0 ? (
                <p className="text-xs text-subtle/60 italic">Aucun sprint disponible.</p>
              ) : null
            )}

            {/* Picker dépliable */}
            {showPicker && (
              <div className="border border-purple/30 rounded-xl overflow-hidden">
                <div className="divide-y divide-border/50 max-h-64 overflow-y-auto">
                  {availableSprints.filter(s => !selectedIds.includes(s.numero)).map(sprint => {
                    const sel = tempSelection.includes(sprint.numero)
                    const faitInSprint = taches.filter(ta => ta.type_tache !== 'Conteneur' && ta.sprint_debut === sprint.numero && ta.statut === 'Fait')
                    const effortReal   = faitInSprint.reduce((acc, ta) => acc + (ta.effort_realise_j ?? 0), 0)
                    return (
                      <div key={sprint.numero}
                        onClick={() => toggleTemp(sprint.numero)}
                        className={cn('flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors',
                          sel ? 'bg-purple/8' : 'hover:bg-bg/80')}>
                        <div className={cn('w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0',
                          sel ? 'bg-purple border-purple' : 'border-border')}>
                          {sel && <Check size={9} className="text-white"/>}
                        </div>
                        <span className="text-xs font-semibold text-navy flex-1">Sprint {formatSprintLabel(sprint.numero)}</span>
                        <div className="flex items-center gap-2 text-[11px] text-subtle shrink-0">
                          <span className={cn('px-1.5 py-0.5 rounded-full font-medium', {
                            'bg-brand/10 text-navy':        sprint.statut === 'cloture',
                            'bg-green/10 text-green': sprint.statut === 'en_cours',
                            'bg-orange/10 text-orange': sprint.statut === 'pause',
                            'bg-gray-100  text-gray-500':  sprint.statut === 'planifie',
                          })}>
                            {sprint.statut === 'cloture' ? 'Clôturé'
                              : sprint.statut === 'en_cours' ? 'En cours'
                              : sprint.statut === 'pause' ? 'En pause' : 'Planifié'}
                          </span>
                          {sprint.stats && <span>{sprint.stats.fait}/{sprint.stats.total} Fait</span>}
                          {effortReal > 0 && (
                            <span className="text-green font-semibold">{effortReal}j réal.</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Valider / Annuler */}
                <div className="flex items-center gap-2 px-3 py-2.5 bg-bg border-t border-border">
                  <button onClick={validatePicker}
                    className="ds-btn-primary ds-btn-sm flex items-center gap-1.5">
                    <Check size={12}/> Valider
                    {tempSelection.length > 0 && (
                      <span className="ml-0.5 px-1.5 py-0.5 bg-white/20 rounded-full text-[11px] font-bold">
                        +{tempSelection.length}
                      </span>
                    )}
                  </button>
                  <button onClick={cancelPicker} className="ds-btn ds-btn-sm">
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {/* Auto-calcul ETP */}
            {selectedIds.length > 0 && totalJoursRealises > 0 && (
              <div className="flex items-center justify-between p-2.5 bg-green/5 rounded-xl border border-green/20">
                <div className="text-xs">
                  <span className="font-semibold text-green">
                    {faitAutoTaches.length} Fait · {totalJoursRealises.toFixed(1)} j réalisés
                  </span>
                  <span className="text-green mx-1.5">→</span>
                  <span className="font-bold text-green">{etpAutoCalc.toFixed(2)} ETP</span>
                  <span className="text-[11px] text-green ml-1">(base {JOURS_ETP_TRIM}j)</span>
                </div>
                <button onClick={() => set('realise_etp', parseFloat(etpAutoCalc.toFixed(2)))}
                  className="text-[11px] font-semibold whitespace-nowrap text-green bg-green/10 hover:bg-green/20 px-2.5 py-1.5 rounded-lg transition-colors shrink-0">
                  → ETP consommé
                </button>
              </div>
            )}
            {selectedIds.length > 0 && totalJoursRealises === 0 && faitAutoTaches.length > 0 && (
              <p className="text-[11px] text-subtle italic">
                {faitAutoTaches.length} tâche{faitAutoTaches.length > 1 ? 's' : ''} Fait —
                renseigner l'<span className="font-semibold">Effort réalisé</span> sur les tâches pour calculer l'ETP.
              </p>
            )}
          </div>

          {/* ── Tableau Budget ─────────────────────────────── */}
          <div className="bg-bg/60 rounded-xl border border-border p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold text-navy/75 uppercase tracking-wide">Budget</span>
              {!isCloture && isAdmin && (
                <button
                  onClick={() => set('previsionnel_verrouille', !prevVerrouille)}
                  title={prevVerrouille ? 'Déverrouiller le budget' : 'Verrouiller le budget prévisionnel'}
                  className={cn(
                    'text-[11px] flex items-center gap-1 px-1.5 py-0.5 rounded-full transition-colors',
                    prevVerrouille
                      ? 'bg-orange/10 text-orange hover:bg-orange/5'
                      : 'bg-bg text-subtle hover:bg-orange/5 hover:text-orange'
                  )}>
                  {prevVerrouille ? <Lock size={9}/> : <Unlock size={9}/>}
                  {prevVerrouille ? 'Prévisionnel verrouillé' : 'Verrouiller le prévisionnel'}
                </button>
              )}
            </div>

            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-bg border-b border-border text-[11px] uppercase tracking-wider">
                    <th className="text-left px-3 py-2 text-subtle font-bold w-24"></th>
                    <th className="text-right px-3 py-2 font-bold">
                      <span className={cn(prevVerrouille ? 'text-orange' : 'text-navy', 'flex items-center justify-end gap-1')}>
                        {prevVerrouille && <Lock size={9}/>} Prévisionnel
                      </span>
                    </th>
                    <th className="text-right px-3 py-2 text-green font-bold">Consommé</th>
                    <th className="text-right px-3 py-2 text-subtle font-bold">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {/* ETP */}
                  <tr className="border-b border-border/50">
                    <td className="px-3 py-2 text-subtle font-medium align-top">ETP</td>
                    <td className="px-3 py-2 align-top">
                      {etpDetailList.length > 0 ? (
                        <div className="space-y-1">
                          {etpDetailList.map(d => (
                            <div key={d.id} className="flex items-center gap-1">
                              <select value={d.equipe_id ?? ''} disabled={!prevEditable || isCloture}
                                onChange={e => etpOps.update(d.id, 'equipe_id', e.target.value ? Number(e.target.value) : null)}
                                className={cn('ds-select text-[11px] flex-1', (!prevEditable || isCloture) && 'bg-bg cursor-not-allowed opacity-60')}>
                                <option value="">-- Équipe --</option>
                                {equipes.map(eq => <option key={eq.id} value={eq.id}>{eq.nom}</option>)}
                              </select>
                              <input type="number" min="0" step="0.1" value={etpDrafts[d.id] ?? (d.etp || '')} placeholder="0"
                                disabled={!prevEditable || isCloture}
                                onChange={e => {
                                  const raw = e.target.value
                                  setEtpDrafts(prev => ({ ...prev, [d.id]: raw }))
                                  if (raw === '') { etpOps.update(d.id, 'etp', 0); return }
                                  const num = Number(raw)
                                  if (Number.isFinite(num)) etpOps.update(d.id, 'etp', num)
                                }}
                                className={cn('ds-input text-xs text-right w-16 shrink-0', (!prevEditable || isCloture) && 'bg-bg cursor-not-allowed opacity-60')} />
                              {prevEditable && !isCloture && (
                                <button onClick={() => etpOps.remove(d.id)} className="text-subtle hover:text-red shrink-0"><X size={11}/></button>
                              )}
                            </div>
                          ))}
                          <div className="flex items-center justify-between pt-0.5 gap-2">
                            {prevEditable && !isCloture ? (
                              <button onClick={etpOps.add} className="text-[10px] text-blue hover:underline shrink-0">+ équipe</button>
                            ) : <span/>}
                            <span className="text-[11px] font-semibold text-navy text-right">{fmt(prevEtpCost)}</span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <input type="number" min="0" step="0.1" value={etpText} placeholder="0"
                            disabled={!prevEditable || isCloture}
                            onChange={e => {
                              if (!prevEditable) return
                              const raw = e.target.value
                              setEtpText(raw)
                              if (raw === '') { set('budget_etp', null); return }
                              const num = Number(raw)
                              if (Number.isFinite(num)) set('budget_etp', num)
                            }}
                            className={cn('ds-input text-xs text-right w-full', !prevEditable && 'bg-bg cursor-not-allowed opacity-60')} />
                          {!isCloture && prevEditable && (
                            <button onClick={etpOps.add} title="Détailler par équipe (TJM dédié)"
                              className="text-[10px] text-blue hover:underline mt-1">+ Détailler par équipe</button>
                          )}
                        </>
                      )}
                      {(t.budget_etp ?? 0) > 0 && (
                        <p className="text-[11px] text-subtle text-right mt-0.5">
                          = {Math.round((t.budget_etp ?? 0) * JOURS_ETP_TRIM)} j
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <input type="number" min="0" step="0.1" value={t.realise_etp ?? ''} placeholder="0"
                          disabled={isCloture}
                          onChange={e => set('realise_etp', e.target.value === '' ? null : Number(e.target.value))}
                          className="ds-input text-xs text-right flex-1" />
                        {selectedIds.length > 0 && totalJoursRealises > 0 && (
                          <button onClick={() => set('realise_etp', parseFloat(etpAutoCalc.toFixed(2)))}
                            title={`Auto : ${etpAutoCalc.toFixed(2)} ETP`}
                            className="shrink-0 text-[10px] px-1.5 py-1 bg-green/10 text-green rounded hover:bg-green/20 transition-colors font-bold whitespace-nowrap">
                            ={etpAutoCalc.toFixed(2)}
                          </button>
                        )}
                      </div>
                      {(t.realise_etp ?? 0) > 0 && (
                        <p className="text-[11px] text-green text-right mt-0.5">
                          = {Math.round((t.realise_etp ?? 0) * JOURS_ETP_TRIM)} j
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {(t.budget_etp != null || t.realise_etp != null) ? (() => {
                        const e = (t.realise_etp ?? 0) - (t.budget_etp ?? 0)
                        return (
                          <div className={ecartClass(e * tjmMoyen * joursTrim)}>
                            <div>{e >= 0 ? '+' : ''}{e.toFixed(1)} ETP</div>
                            <div className="text-[11px] font-normal">
                              {e >= 0 ? '+' : ''}{Math.round(e * JOURS_ETP_TRIM)} j
                            </div>
                          </div>
                        )
                      })() : <span className="text-subtle">—</span>}
                    </td>
                  </tr>
                  {/* ── Invest ── */}
                  {(() => {
                    const prevInvest  = makeOps('budget_invest_details',  'budget_invest',  setExpandPrevInvest)
                    const consoInvest = makeOps('realise_invest_details', 'realise_invest', setExpandConsoInvest)
                    return (
                      <tr className="border-b border-border/50">
                        <td className="px-3 py-2 text-subtle font-medium text-xs align-top">Invest (€)</td>
                        <td className="px-3 py-2 align-top">
                          <BudgetCell details={prevInvest.list} total={t.budget_invest}
                            disabled={!prevEditable || isCloture} expanded={expandPrevInvest}
                            colorTotal="text-navy"
                            onToggle={() => setExpandPrevInvest(v => !v)}
                            onAdd={prevInvest.add} onUpdate={prevInvest.update} onRemove={prevInvest.remove} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <BudgetCell details={consoInvest.list} total={t.realise_invest}
                            disabled={isCloture} expanded={expandConsoInvest}
                            colorTotal="text-green"
                            onToggle={() => setExpandConsoInvest(v => !v)}
                            onAdd={consoInvest.add} onUpdate={consoInvest.update} onRemove={consoInvest.remove} />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums align-top">
                          {(t.budget_invest != null || t.realise_invest != null) ? (() => {
                            const e = (t.realise_invest ?? 0) - (t.budget_invest ?? 0)
                            return <span className={ecartClass(e)}>{e >= 0 ? '+' : ''}{fmt(e)}</span>
                          })() : <span className="text-subtle">—</span>}
                        </td>
                      </tr>
                    )
                  })()}

                  {/* ── Achats ── */}
                  {(() => {
                    const prevAchats  = makeOps('budget_achats_details',  'budget_achats',  setExpandPrevAchats)
                    const consoAchats = makeOps('realise_achats_details', 'realise_achats', setExpandConsoAchats)
                    return (
                      <tr className="border-b border-border/50">
                        <td className="px-3 py-2 text-subtle font-medium text-xs align-top">Achats (€)</td>
                        <td className="px-3 py-2 align-top">
                          <BudgetCell details={prevAchats.list} total={t.budget_achats}
                            disabled={!prevEditable || isCloture} expanded={expandPrevAchats}
                            colorTotal="text-navy"
                            onToggle={() => setExpandPrevAchats(v => !v)}
                            onAdd={prevAchats.add} onUpdate={prevAchats.update} onRemove={prevAchats.remove} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <BudgetCell details={consoAchats.list} total={t.realise_achats}
                            disabled={isCloture} expanded={expandConsoAchats}
                            colorTotal="text-green"
                            onToggle={() => setExpandConsoAchats(v => !v)}
                            onAdd={consoAchats.add} onUpdate={consoAchats.update} onRemove={consoAchats.remove} />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums align-top">
                          {(t.budget_achats != null || t.realise_achats != null) ? (() => {
                            const e = (t.realise_achats ?? 0) - (t.budget_achats ?? 0)
                            return <span className={ecartClass(e)}>{e >= 0 ? '+' : ''}{fmt(e)}</span>
                          })() : <span className="text-subtle">—</span>}
                        </td>
                      </tr>
                    )
                  })()}
                  {/* Total */}
                  <tr className="bg-brand/5 font-bold">
                    <td className="px-3 py-2 text-navy text-xs">Total</td>
                    <td className="px-3 py-2 text-right text-navy tabular-nums text-xs">{totalPrev > 0 ? fmt(totalPrev) : '—'}</td>
                    <td className="px-3 py-2 text-right text-green tabular-nums text-xs">{totalReal > 0 ? fmt(totalReal) : '—'}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums text-xs',
                      (totalPrev > 0 || totalReal > 0) ? ecartClass(ecart) : 'text-subtle')}>
                      {(totalPrev > 0 || totalReal > 0) ? <>{ecart >= 0 ? '+' : ''}{fmt(ecart)}</> : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {totalPrev > 0 && <p className="text-[11px] text-subtle mt-1.5">ETP valorisé au TJM de l'équipe (ou TJM moyen si non détaillé)</p>}
          </div>

          {/* KPIs + Outcome */}
          <div className="grid grid-cols-2 gap-3 bg-bg/60 rounded-xl border border-border p-3">
            <div>
              <span className="text-[11px] font-bold text-navy/75 uppercase tracking-wide block mb-1 flex items-center gap-1"><TrendingUp size={10}/> KPIs</span>
              <textarea value={t.kpis} onChange={e => set('kpis', e.target.value)}
                disabled={isCloture} className="ds-textarea text-xs" rows={2}
                placeholder="NPS > 50, adoption > 30%…" />
            </div>
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-navy/75 uppercase tracking-wide block flex items-center gap-1"><TrendingUp size={10}/> Outcome</span>
              <textarea value={t.outcome_desc} onChange={e => set('outcome_desc', e.target.value)}
                disabled={isCloture} className="ds-textarea text-xs" rows={2}
                placeholder="Description de la valeur créée…" />
              <input type="number" min="0" step="1000" value={t.outcome_euros ?? ''} placeholder="Valeur financière (€)"
                disabled={isCloture}
                onChange={e => set('outcome_euros', e.target.value === '' ? null : Number(e.target.value))}
                className="ds-input text-xs" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────
export default function ProduitConfigPage() {
  const { produitActif, setProduitActif } = useProduit()
  const { data: produits = [] }           = useProduits()
  const updateProduit                     = useUpdateProduit()
  const { isAdmin }                       = useAuth()
  const { data: sprints = [] }            = useSprints()
  const { data: taches = [] }             = useTaches()
  const toast                             = useToast()
  const navigate                          = useNavigate()

  const produit  = produits.find(p => p.id === produitActif?.id)
  const { data: financeConfig } = useFinanceConfig()
  const { data: equipes = [] }  = useEquipes()
  const { ragConfigDefault }    = useAppSettings()

  const [nom,           setNom]     = useState('')
  const [description,   setDesc]    = useState('')
  const [couleur,       setCouleur] = useState(BRAND_COLORS[0])
  const [vision,        setVision]  = useState('')
  const [priorite,      setPrio]    = useState('')
  const [risque,        setRisque]  = useState('')
  const [dateLancement, setDate]    = useState('')
  const [trims,         setTrims]   = useState<TrimObjectif[]>([])
  const [ragConfig,     setRagConfig] = useState<RagConfig>(RAG_CONFIG_DEFAULT)
  const [saving,        setSaving]  = useState(false)
  const [dirty,         setDirty]   = useState(false)
  const [resumeMode,      setResumeMode]      = useState<'global' | 'trim'>('global')
  const [resumeTrimId,    setResumeTrimId]    = useState<string | null>(null)
  const [showTrimPicker,  setShowTrimPicker]  = useState(false)
  const [pickerYear,      setPickerYear]      = useState(new Date().getFullYear())

  useEffect(() => {
    if (!produit) return
    setNom(produit.nom)
    setDesc(produit.description ?? '')
    setCouleur(produit.couleur ?? BRAND_COLORS[0])
    setVision(produit.vision ?? '')
    setPrio(produit.priorite_strategique != null ? String(produit.priorite_strategique) : '')
    setRisque(produit.niveau_risque ?? '')
    setDate(produit.date_lancement_cible ?? '')
    const existing = Array.isArray(produit.objectifs_trimestriels) && produit.objectifs_trimestriels.length > 0
      ? produit.objectifs_trimestriels
      : [newTrim()]
    setTrims(existing)
    setRagConfig(produit.rag_config ?? ragConfigDefault)
    setDirty(false)
  // Ne réinitialise le formulaire qu'au changement de PRODUIT (id), pas à
  // chaque refetch de `produit` (même contenu, nouvelle référence) ni quand
  // `ragConfigDefault` (constante) change — sinon un refetch en arrière-plan
  // effacerait les modifications en cours de saisie.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produit?.id])

  function updateTrim(id: string, updated: TrimObjectif) {
    setTrims(ts => ts.map(t => t.id === id ? updated : t))
    setDirty(true)
  }
  function deleteTrim(id: string) {
    setTrims(ts => ts.filter(t => t.id !== id))
    setDirty(true)
  }

  const joursParTrim = financeConfig?.jours_par_trim ?? 65
  const tjmMoyenPage = (financeConfig?.equipe_tjms?.length ?? 0) > 0
    ? Math.round(financeConfig!.equipe_tjms.reduce((s, e) => s + e.tjm, 0) / financeConfig!.equipe_tjms.length)
    : 500
  const totalPrev    = trims.reduce((s, t) => s + trimEtpCostEur(t, financeConfig, joursParTrim) + (t.budget_invest ?? 0) + (t.budget_achats ?? 0), 0)
  const totalPrevEtp = trims.reduce((s, t) => s + trimEtpTotal(t), 0)
  const totalRealEtp = trims.reduce((s, t) => s + (t.realise_etp ?? 0), 0)
  const totalOutcome = trims.reduce((s, t) => s + (t.outcome_euros ?? 0), 0)

  async function handleSave() {
    if (!produit) return
    setSaving(true)
    try {
      const updates: Partial<Produit> = {
        nom:                    nom.trim() || produit.nom,
        description:            description.trim() || null,
        couleur,
        vision:                 vision.trim() || null,
        priorite_strategique:   priorite !== '' ? Number(priorite) : null,
        niveau_risque:          risque || null,
        date_lancement_cible:   dateLancement || null,
        objectifs_trimestriels: trims.filter(t => t.trimestre || t.objectifs?.length),
        rag_config: ragConfig,
      }
      await updateProduit.mutateAsync({ id: produit.id, updates })
      if (updates.nom !== produitActif?.nom || updates.couleur !== produitActif?.couleur) {
        setProduitActif({ id: produit.id, nom: updates.nom!, couleur: updates.couleur ?? null })
      }
      toast('Paramètres enregistrés')
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  if (!produit) return (
    <Layout>
      <div className="text-center py-20 text-subtle text-sm">Aucun produit actif</div>
    </Layout>
  )

  return (
    <Layout>
      {/* Topbar */}
      <div className="page-topbar -mx-3 -mt-3 mb-5 px-3 md:-mx-5 md:-mt-5 md:px-5">
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ background: couleur }} />
          <h1 className="text-sm font-semibold text-navy">{nom || produit.nom} — Paramètres</h1>
          {dirty && <span className="text-[11px] text-orange font-semibold">● Non sauvegardé</span>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => navigate('/produit-dashboard')}
            className="ds-btn ds-btn-sm flex items-center gap-1.5 text-xs">
            <LayoutDashboard size={13}/> Dashboard
          </button>
          <button onClick={handleSave} disabled={saving}
            className="ds-btn-primary ds-btn-sm flex items-center gap-1.5 disabled:opacity-50">
            <Save size={13}/> {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {/* Layout 2 colonnes */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">

        {/* ── Colonne gauche ─────────────────────────────── */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h2 className="text-xs font-bold text-navy uppercase tracking-wider">Général</h2>
            <div>
              <label className="ds-label mb-1 block">Nom</label>
              <input value={nom} onChange={e => { setNom(e.target.value); setDirty(true) }} className="ds-input" />
            </div>
            <div>
              <label className="ds-label mb-1 block">Description</label>
              <input value={description} onChange={e => { setDesc(e.target.value); setDirty(true) }} className="ds-input" placeholder="Description courte…" />
            </div>
            <div>
              <label className="ds-label mb-1.5 block">Couleur</label>
              <div className="flex gap-2 flex-wrap">
                {BRAND_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => { setCouleur(c); setDirty(true) }}
                    className={cn('w-6 h-6 rounded-full transition-transform hover:scale-110', couleur === c && 'ring-2 ring-navy ring-offset-2')}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <h2 className="text-xs font-bold text-navy uppercase tracking-wider">Stratégie</h2>
            <div>
              <label className="ds-label mb-1 flex items-center gap-1"><Target size={11}/> Vision</label>
              <textarea value={vision} onChange={e => { setVision(e.target.value); setDirty(true) }}
                className="ds-textarea text-sm leading-relaxed" rows={4}
                placeholder="Quel problème résout-il ? Pour qui ? Quelle valeur unique ?" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="ds-label mb-1 block">Priorité stratégique</label>
                <select value={priorite} onChange={e => { setPrio(e.target.value); setDirty(true) }} className="ds-select text-xs">
                  <option value="">—</option>
                  {[1,2,3,4,5].map(n => <option key={n} value={n}>{'★'.repeat(n)} — P{n}</option>)}
                </select>
              </div>
              <div>
                <label className="ds-label mb-1 block">Niveau de risque</label>
                <select value={risque} onChange={e => { setRisque(e.target.value); setDirty(true) }} className="ds-select text-xs">
                  <option value="">—</option>
                  {NIVEAUX_RISQUE.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="ds-label mb-1 flex items-center gap-1"><Calendar size={11}/> Date de lancement cible</label>
              <input type="date" value={dateLancement} onChange={e => { setDate(e.target.value); setDirty(true) }} className="ds-input text-xs" />
            </div>
          </div>

          {/* Paramètres qualité RAG */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-navy uppercase tracking-wider">Paramètres qualité</h2>
              <button onClick={() => { setRagConfig(ragConfigDefault); setDirty(true) }}
                className="text-[11px] text-subtle hover:text-navy transition-colors">
                Réinitialiser
              </button>
            </div>
            <p className="text-[11px] text-subtle -mt-2">Seuils d'alerte RAG (écart en points)</p>
            <div className="space-y-3">
              {([
                { key: 'avancement', label: 'Avancement', hint: '% en dessous du curseur' },
                { key: 'budget',     label: 'Budget',     hint: '% de dépassement' },
                { key: 'blocages',   label: 'Blocages',   hint: 'nombre de blocages/risques' },
              ] as const).map(({ key, label, hint }) => (
                <div key={key}>
                  <div className="text-[11px] font-semibold text-navy mb-1">{label} <span className="font-normal text-subtle">({hint})</span></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-orange font-bold uppercase tracking-wide block mb-0.5">Attention ≥</label>
                      <input type="number" min="0" step="1"
                        value={ragConfig[key].amber}
                        onChange={e => { setRagConfig(c => ({ ...c, [key]: { ...c[key], amber: Number(e.target.value) } })); setDirty(true) }}
                        className="ds-input text-xs text-center w-16" />
                    </div>
                    <div>
                      <label className="text-[10px] text-red font-bold uppercase tracking-wide block mb-0.5">Critique ≥</label>
                      <input type="number" min="0" step="1"
                        value={ragConfig[key].red}
                        onChange={e => { setRagConfig(c => ({ ...c, [key]: { ...c[key], red: Number(e.target.value) } })); setDirty(true) }}
                        className="ds-input text-xs text-center w-16" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Résumé financier */}
          {(totalPrevEtp > 0 || totalRealEtp > 0 || totalPrev > 0) && (() => {
            // Données selon le mode
            const activeTrim = resumeMode === 'trim'
              ? trims.find(t => t.id === resumeTrimId) ?? null
              : null

            const dPrevEtp  = activeTrim ? trimEtpTotal(activeTrim) : totalPrevEtp
            const dRealEtp  = activeTrim ? (activeTrim.realise_etp ?? 0) : totalRealEtp
            const dPrevJ    = Math.round(dPrevEtp * JOURS_ETP_TRIM)
            const dRealJ    = Math.round(dRealEtp * JOURS_ETP_TRIM)
            const dEcartEtp = dRealEtp - dPrevEtp

            // Dépenses externes (invest + achats) — indépendant de l'ETP
            const dPrevExt = activeTrim
              ? (activeTrim.budget_invest  ?? 0) + (activeTrim.budget_achats  ?? 0)
              : trims.reduce((s, t) => s + (t.budget_invest  ?? 0) + (t.budget_achats  ?? 0), 0)
            const dRealExt = activeTrim
              ? (activeTrim.realise_invest ?? 0) + (activeTrim.realise_achats ?? 0)
              : trims.reduce((s, t) => s + (t.realise_invest ?? 0) + (t.realise_achats ?? 0), 0)
            const dEcartExt = dRealExt - dPrevExt

            const dPrevEtpEur = activeTrim
              ? trimEtpCostEur(activeTrim, financeConfig, joursParTrim)
              : trims.reduce((s, t) => s + trimEtpCostEur(t, financeConfig, joursParTrim), 0)
            const dPrevTotal = dPrevEtpEur + dPrevExt
            const dOutcome   = activeTrim ? (activeTrim.outcome_euros ?? 0) : totalOutcome
            const dRoi       = dPrevTotal > 0 ? ((dOutcome - dPrevTotal) / dPrevTotal * 100) : null

            return (
              <div className="bg-brand/5 border border-navy/10 rounded-2xl p-5 space-y-3">
                {/* En-tête avec bascule */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex rounded-lg overflow-hidden border border-navy/20 text-[11px] font-semibold">
                    <button onClick={() => setResumeMode('global')}
                      className={cn('px-2.5 py-1 transition-colors', resumeMode === 'global' ? 'bg-brand text-white' : 'text-subtle hover:text-navy')}>
                      Global
                    </button>
                    <button onClick={() => { setResumeMode('trim'); if (!resumeTrimId && trims.length) setResumeTrimId(trims[0].id) }}
                      className={cn('px-2.5 py-1 transition-colors border-l border-navy/20', resumeMode === 'trim' ? 'bg-brand text-white' : 'text-subtle hover:text-navy')}>
                      Par trimestre
                    </button>
                  </div>
                  {resumeMode === 'trim' && (
                    <select value={resumeTrimId ?? ''} onChange={e => setResumeTrimId(e.target.value)}
                      className="ds-select text-[11px] py-0.5 flex-1 min-w-0">
                      {trims.map(t => (
                        <option key={t.id} value={t.id}>{t.trimestre || '(sans nom)'}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* ── Charge humaine (ETP) ── */}
                {(dPrevEtp > 0 || dRealEtp > 0) && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-subtle font-semibold uppercase tracking-wide">Charge humaine</p>
                    <div className="bg-card rounded-xl border border-border divide-y divide-border">
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-xs text-subtle font-medium">Prévisionnel</span>
                        <span className="text-xs font-bold text-navy tabular-nums">
                          {dPrevEtp.toFixed(1)} ETP <span className="text-subtle font-normal mx-1">·</span> {dPrevJ} j
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-xs text-green font-medium">Réalisé</span>
                        <span className="text-xs font-bold text-green tabular-nums">
                          {dRealEtp > 0
                            ? <>{dRealEtp.toFixed(1)} ETP <span className="text-green/40 font-normal mx-1">·</span> {dRealJ} j</>
                            : <span className="text-subtle font-normal">—</span>
                          }
                        </span>
                      </div>
                      {(dPrevEtp > 0 || dRealEtp > 0) && (
                        <div className="flex items-center justify-between px-3 py-2 bg-bg/50">
                          <span className="text-xs text-subtle font-medium">Écart</span>
                          <span className={cn('text-xs font-bold tabular-nums', dRealEtp > 0 ? ecartClass(dEcartEtp * tjmMoyenPage * joursParTrim) : 'text-subtle')}>
                            {dRealEtp > 0
                              ? <>{dEcartEtp >= 0 ? '+' : ''}{dEcartEtp.toFixed(1)} ETP <span className="font-normal mx-1">·</span> {dEcartEtp >= 0 ? '+' : ''}{Math.round(dEcartEtp * JOURS_ETP_TRIM)} j</>
                              : '—'
                            }
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Achats + Invest (dépenses externes) ── */}
                {(dPrevExt > 0 || dRealExt > 0) && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-subtle font-semibold uppercase tracking-wide">Achats + Invest (€)</p>
                    <div className="bg-card rounded-xl border border-border divide-y divide-border">
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-xs text-subtle font-medium">Prévisionnel</span>
                        <span className="text-xs font-bold text-navy tabular-nums">
                          {dPrevExt > 0 ? fmt(dPrevExt) : <span className="font-normal text-subtle">—</span>}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-xs text-green font-medium">Réalisé</span>
                        <span className="text-xs font-bold text-green tabular-nums">
                          {dRealExt > 0 ? fmt(dRealExt) : <span className="font-normal text-subtle">—</span>}
                        </span>
                      </div>
                      {dPrevExt > 0 && dRealExt > 0 && (
                        <div className="flex items-center justify-between px-3 py-2 bg-bg/50">
                          <span className="text-xs text-subtle font-medium">Écart</span>
                          <span className={cn('text-xs font-bold tabular-nums', ecartClass(dEcartExt))}>
                            {dEcartExt >= 0 ? '+' : ''}{fmt(dEcartExt)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Outcome / ROI ── */}
                {dOutcome > 0 && (
                  <div className="space-y-1.5 text-xs pt-1 border-t border-navy/10">
                    <div className="flex justify-between">
                      <span className="text-subtle">Outcome estimé</span>
                      <span className="font-semibold text-green">{fmt(dOutcome)}</span>
                    </div>
                    {dRoi !== null && (
                      <div className="flex justify-between font-bold">
                        <span className="text-navy">ROI estimé</span>
                        <span className={cn(dRoi >= 0 ? 'text-green' : 'text-red')}>
                          {dRoi >= 0 ? '+' : ''}{dRoi.toFixed(0)} %
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* ── Colonne droite : trimestres ──────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold text-navy uppercase tracking-wider">Trimestres</h2>
              <p className="text-[11px] text-subtle mt-0.5 flex items-center gap-3">
                <span className="flex items-center gap-1"><Play size={9} className="text-purple"/> Lancer</span>
                <span className="flex items-center gap-1"><Archive size={9}/> Clôturer</span>
                <span className="flex items-center gap-1"><Lock size={9} className="text-orange"/> Verrouiller le budget</span>
              </p>
            </div>
            <button onClick={() => setShowTrimPicker(true)}
              className="flex items-center gap-1 text-xs font-semibold text-purple hover:text-purple/80 transition-colors">
              <Plus size={13}/> Ajouter
            </button>
          </div>

          {/* Picker trimestre — année choisie puis Q1-Q4 proposés pour cette
              année ; les trimestres déjà écoulés (année passée, ou trimestre
              passé de l'année en cours) ne sont pas proposables : on ne
              dépend plus d'une pré-génération manuelle côté Finance pour
              pouvoir ajouter une année future (ex. 2027). */}
          {showTrimPicker && (() => {
            const usedLabels = new Set(trims.map(t => t.trimestre))
            const now = new Date()
            const curYear = now.getFullYear()
            const curQ = Math.floor(now.getMonth() / 3) + 1
            const quarters = [1, 2, 3, 4]
              .filter(q => pickerYear > curYear || q >= curQ)
              .map(q => {
                const label = `Q${q} ${pickerYear}`
                const preset = financeConfig?.trimestres.find(tc => tc.label === label)
                return { q, label, jours_ouvres: preset?.jours_ouvres ?? financeConfig?.jours_par_trim ?? 65, used: usedLabels.has(label) }
              })
            return (
              <div className="bg-card border border-purple/30 rounded-2xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-navy">Choisir un trimestre</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPickerYear(y => Math.max(curYear, y - 1))} disabled={pickerYear <= curYear}
                      className="p-1 rounded hover:bg-bg text-subtle hover:text-navy disabled:opacity-30 disabled:pointer-events-none">
                      <ChevronLeft size={12} />
                    </button>
                    <span className="text-xs font-bold text-navy tabular-nums w-10 text-center">{pickerYear}</span>
                    <button onClick={() => setPickerYear(y => y + 1)}
                      className="p-1 rounded hover:bg-bg text-subtle hover:text-navy">
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
                {quarters.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {quarters.map(({ q, label, jours_ouvres, used }) => (
                      <button key={q} disabled={used} onClick={() => {
                          const t = newTrim()
                          setTrims(ts => [...ts, { ...t, trimestre: label, jours_ouvres }])
                          setDirty(true)
                          setShowTrimPicker(false)
                        }}
                        className={cn('flex items-center justify-between px-3 py-2 rounded-xl border text-left transition-colors',
                          used ? 'border-border/50 opacity-40 cursor-not-allowed' : 'border-border hover:border-purple/50 hover:bg-purple/5')}>
                        <span className="text-xs font-semibold text-navy">{label}</span>
                        <span className="text-[11px] text-subtle">{used ? 'déjà ajouté' : `${jours_ouvres} j`}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-subtle text-center py-2">
                    Tous les trimestres de {pickerYear} sont déjà écoulés ou ajoutés.
                  </p>
                )}
                <div className="flex items-center gap-2 pt-1 border-t border-border">
                  <button onClick={() => {
                      setTrims(ts => [...ts, newTrim()])
                      setDirty(true)
                      setShowTrimPicker(false)
                    }}
                    className="text-xs text-subtle hover:text-navy transition-colors">
                    + Créer un trimestre libre
                  </button>
                  <button onClick={() => setShowTrimPicker(false)}
                    className="ml-auto text-xs text-subtle hover:text-red transition-colors">
                    Annuler
                  </button>
                </div>
              </div>
            )
          })()}

          {trims.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
              <p className="text-sm text-subtle">Aucun trimestre — cliquez sur + Ajouter</p>
            </div>
          ) : (
            <div className="space-y-3">
              {trims.map(t => {
                // Sprints déjà utilisés par les AUTRES trims
                const usedByOthers = trims
                  .filter(other => other.id !== t.id)
                  .flatMap(other => other.sprints_ids ?? [])

                return (
                  <TrimRow key={t.id} t={t} isAdmin={isAdmin}
                    sprints={sprints}
                    taches={taches}
                    usedSprintIds={usedByOthers}
                    equipes={equipes}
                    financeConfig={financeConfig}
                    onChange={updated => updateTrim(t.id, updated)}
                    onDelete={() => deleteTrim(t.id)} />
                )
              })}
            </div>
          )}
        </div>
      </div>

      <ToastContainer />
    </Layout>
  )
}
