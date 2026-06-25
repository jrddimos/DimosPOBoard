import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Layout } from '@/components/layout/Layout'
import { useProduits, useUpdateProduit, trimAvancement } from '@/hooks/useProduits'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import {
  useReunionSemaine, useRevuesByReunion, useSujetsByReunion, useSauvegarderReunion,
} from '@/hooks/useReunions'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import {
  ChevronLeft, ChevronRight, Play, Pause, SkipBack, SkipForward,
  Plus, X, Check, Save, Printer, ChevronDown, ChevronUp, AlertTriangle,
  Target, Zap, Maximize2, Minimize2,
} from 'lucide-react'
import type { Produit, TrimObjectif } from '@/hooks/useProduits'
import type { Sprint } from '@/types'
import { ProduitDashboardBody } from '@/pages/produit-dashboard/ProduitDashboardBody'
import { ProduitBandeauRow }    from '@/pages/produit-dashboard/ProduitBandeauRow'
import type { BandeauScope }   from '@/pages/produit-dashboard/ProduitBandeauRow'


// ── Phases ────────────────────────────────────────────────────────
const PHASES = [
  { label: 'Revues produits',        minutes: 25, color: 'bg-purple',    text: 'text-purple'    },
  { label: 'Synchro opérationnelle', minutes: 20, color: 'bg-blue-500',  text: 'text-blue-500'  },
  { label: 'Rituels & process',      minutes: 10, color: 'bg-amber-500', text: 'text-amber-500' },
  { label: 'Wrap-up',               minutes:  5, color: 'bg-green-500', text: 'text-green-500' },
] as const

const STATUTS_PRESENTE = ['On track', 'At risk', 'Off track', 'En pause', 'Non présenté'] as const
const STATUT_COLORS: Record<string, string> = {
  'On track':     'bg-green-100 text-green-700',
  'At risk':      'bg-amber-100 text-amber-700',
  'Off track':    'bg-red-100 text-red-600',
  'En pause':     'bg-gray-100 text-gray-500',
  'Non présenté': 'bg-gray-50 text-gray-400',
}
const TRIM_BAR: Record<string, string> = {
  'On track':  'bg-green-500',
  'At risk':   'bg-amber-400',
  'Off track': 'bg-red-500',
  'En pause':  'bg-gray-400',
}

// ── Helpers ───────────────────────────────────────────────────────
function getISOWeek(date: Date): { semaine: number; annee: number } {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const semaine = 1 + Math.round(
    ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
  )
  return { semaine, annee: d.getFullYear() }
}

function shiftWeek(semaine: number, annee: number, delta: number): { semaine: number; annee: number } {
  const jan4  = new Date(annee, 0, 4)
  const dow   = jan4.getDay() || 7
  const monday = new Date(jan4)
  monday.setDate(jan4.getDate() - dow + 1 + (semaine - 1) * 7 + delta * 7)
  return getISOWeek(monday)
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// ── Types locaux ──────────────────────────────────────────────────
type SprintFull = Sprint & { produit_id: number }

interface RevueLocale {
  statut_presente: string
  blocages: number
  notes: string
  expanded: boolean
}
interface SujetLocale { id: string; type_tag: string; titre: string }

// ── Bloc objectif trimestriel (interactif) ────────────────────────
function TrimBlock({
  trims, onToggle,
}: {
  trims: TrimObjectif[]
  onToggle: (trimId: string, itemId: string, checked: boolean) => void
}) {
  const t = [...trims].reverse().find(x => x.objectifs?.length || x.statut)
  if (!t) return null

  const items = t.objectifs ?? []
  const pct   = trimAvancement(t)
  const done  = items.filter(o => o.checked).length
  const barColor = t.statut ? (TRIM_BAR[t.statut] ?? 'bg-green-500') : 'bg-green-500'

  return (
    <div className="rounded-lg border border-border bg-bg px-3 py-2.5 space-y-2">
      {/* Titre + statut + % */}
      <div className="flex items-center gap-2">
        <Target size={10} className="text-purple shrink-0" />
        <span className="text-[10px] font-bold text-navy uppercase tracking-wider">Objectif</span>
        {t.trimestre && <span className="text-[10px] text-subtle">— {t.trimestre}</span>}
        <div className="flex items-center gap-1.5 ml-auto">
          {t.statut && (
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', STATUT_COLORS[t.statut] ?? 'bg-gray-100')}>
              {t.statut}
            </span>
          )}
          {pct !== null && <span className="text-[10px] font-bold text-navy tabular-nums">{pct} %</span>}
        </div>
      </div>

      {/* Barre avancement */}
      {pct !== null && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] text-subtle tabular-nums">{done}/{items.length}</span>
        </div>
      )}

      {/* Checklist */}
      {items.length > 0 && (
        <div className="space-y-1.5 pt-0.5">
          {items.map(obj => (
            <button
              key={obj.id}
              onClick={() => onToggle(t.id, obj.id, !obj.checked)}
              className="w-full flex items-start gap-2 text-left group"
            >
              <div className={cn(
                'mt-0.5 w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all',
                obj.checked
                  ? 'bg-green-500 border-green-500'
                  : 'border-border group-hover:border-purple/60'
              )}>
                {obj.checked && <Check size={8} className="text-white" />}
              </div>
              <span className={cn(
                'text-xs leading-snug flex-1',
                obj.checked ? 'line-through text-subtle/60' : 'text-navy/80'
              )}>
                {obj.texte || <span className="italic text-subtle/40">Sans titre</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Bloc sprint ───────────────────────────────────────────────────
function SprintBlock({ sprint, label }: { sprint: SprintFull; label?: string }) {
  const stats   = sprint.stats
  const pct     = stats?.pct ?? null
  const bloque  = stats?.bloque ?? 0
  const isClosed = sprint.statut === 'cloture'

  return (
    <div className={cn(
      'rounded-lg border px-3 py-2 space-y-1.5',
      isClosed ? 'border-border bg-bg' : 'border-purple/30 bg-purple/5'
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-navy uppercase tracking-wider">
          <Zap size={10} className={isClosed ? 'text-subtle' : 'text-purple'} />
          {label ?? (isClosed ? 'Dernier sprint clôturé' : 'Sprint en cours')}
          <span className="font-normal text-subtle normal-case">— {sprint.numero}</span>
        </div>
        {isClosed && sprint.closed_at && (
          <span className="text-[10px] text-subtle shrink-0">clôt. {fmtDate(sprint.closed_at)}</span>
        )}
      </div>

      {/* Barre progression */}
      {pct !== null && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-500')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-navy shrink-0 tabular-nums">{pct} %</span>
          {stats && (
            <span className="text-[10px] text-subtle shrink-0">{stats.fait}/{stats.total}</span>
          )}
        </div>
      )}

      {/* Blocages */}
      {bloque > 0 && (
        <div className="flex items-center gap-1 text-red-600">
          <AlertTriangle size={11} />
          <span className="text-[10px] font-bold">{bloque} blocage{bloque > 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Review (sprint clôturé) */}
      {isClosed && sprint.review && (
        <p className="text-[10px] text-subtle leading-snug line-clamp-2 italic">"{sprint.review}"</p>
      )}
    </div>
  )
}


// ── Parse sprint (même logique que SetupPage) ─────────────────────
function parseSprint(s: Sprint | null | undefined) {
  if (!s) return { freeObj: '', items: [] as string[], checks: {} as Record<string, boolean>, freeRev: '' }
  const oLines = (s.objectifs ?? '').split('\n')
  const items  = oLines.filter(l => l.trimStart().startsWith('- ')).map(l => l.trimStart().slice(2).trim()).filter(Boolean)
  const freeObj = oLines.filter(l => !l.trimStart().startsWith('- ')).join('\n').trim()
  const rLines  = (s.review ?? '').split('\n')
  const checks: Record<string, boolean> = {}
  items.forEach(i => { checks[i] = false })
  rLines.filter(l => l.trim().startsWith('[x] ') || l.trim().startsWith('[ ] ')).forEach(l => {
    const ok = l.trim().startsWith('[x] '); const txt = l.trim().slice(4).trim(); checks[txt] = ok
  })
  const freeRev = rLines.filter(l => !l.trim().startsWith('[x] ') && !l.trim().startsWith('[ ] ')).join('\n').trim()
  return { freeObj, items, checks, freeRev }
}

// ── Carte produit dans la réunion ─────────────────────────────────
function ProduitRevueCard({
  p, revue, onChange, sprintActif, lastSprint, onToggleObjectif,
}: {
  p: Produit
  revue: RevueLocale
  onChange: (field: keyof RevueLocale, value: string | number | boolean) => void
  sprintActif: SprintFull | null
  lastSprint: SprintFull | null
  onToggleObjectif: (trimId: string, itemId: string, checked: boolean) => void
}) {
  const trims         = Array.isArray(p.objectifs_trimestriels) ? p.objectifs_trimestriels : []
  const displaySprint = sprintActif ?? lastSprint

  const [scope,            setScope]            = useState<BandeauScope>('sprint')
  const [zoomed,           setZoomed]           = useState(false)
  const [sprintDetailOpen, setSprintDetailOpen] = useState(false)
  const [selectedSprintNum, setSelectedSprintNum] = useState<string | null>(null)

  // Fetch all sprints pour ce produit (même cache que ProduitBandeauRow)
  const { data: allSprints = [] } = useQuery({
    queryKey: ['sprints', p.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sprints').select('*').eq('produit_id', p.id).order('numero')
      if (error) throw error
      return (data ?? []) as Sprint[]
    },
    staleTime: 30_000,
  })

  const sortedSprints = [...allSprints].sort((a, b) => Number(a.numero.replace(/\D/g,'')) - Number(b.numero.replace(/\D/g,'')))
  const effectiveSprintObj = selectedSprintNum
    ? (sortedSprints.find(s => s.numero === selectedSprintNum) ?? null)
    : (sortedSprints.find(s => s.statut === 'en_cours') ?? [...sortedSprints].reverse().find(s => s.statut === 'cloture') ?? null)

  const { freeObj, items, checks, freeRev } = parseSprint(effectiveSprintObj)
  const doneCount = items.filter(i => checks[i]).length
  const pct       = items.length > 0 ? Math.round(doneCount / items.length * 100) : 0

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-white">
      <div className="h-1 shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />

      {/* En-tête cliquable */}
      <button
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-bg/60 transition-colors text-left"
        onClick={() => onChange('expanded', !revue.expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-navy truncate">{p.nom}</span>
            {revue.statut_presente && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0',
                STATUT_COLORS[revue.statut_presente] ?? 'bg-gray-100')}>
                {revue.statut_presente}
              </span>
            )}
          </div>
        </div>
        {revue.blocages > 0 && (
          <div className="flex items-center gap-1 text-red-600 shrink-0">
            <AlertTriangle size={13} />
            <span className="text-xs font-bold">{revue.blocages}</span>
          </div>
        )}
        {revue.expanded ? <ChevronUp size={14} className="text-subtle shrink-0" /> : <ChevronDown size={14} className="text-subtle shrink-0" />}
      </button>

      {/* Bandeau RAG — miroir exact du dashboard */}
      <div className="border-t border-border/40">
        <ProduitBandeauRow
          produit={p}
          scope={scope}
          forceSprintNum={selectedSprintNum}
          extraLeft={
            <div className="flex items-center gap-2 shrink-0">
              {/* Scope toggle — Sprint en premier */}
              <div className="flex rounded border border-border overflow-hidden text-[9px]">
                {(['sprint', 'trim', 'global'] as BandeauScope[]).map(v => (
                  <button key={v} onClick={e => { e.stopPropagation(); setScope(v) }}
                    className={cn('px-2.5 py-1 font-semibold transition-colors',
                      scope === v ? 'bg-purple text-white' : 'text-subtle hover:bg-bg')}>
                    {v === 'sprint' ? 'Sprint' : v === 'trim' ? 'Trim' : 'Global'}
                  </button>
                ))}
              </div>
              {/* Sélecteur sprint (scope sprint seulement) */}
              {scope === 'sprint' && sortedSprints.length > 0 && (
                <select
                  value={selectedSprintNum ?? ''}
                  onChange={e => { e.stopPropagation(); setSelectedSprintNum(e.target.value || null) }}
                  onClick={e => e.stopPropagation()}
                  className="text-[9px] border border-border rounded px-1.5 py-0.5 text-navy font-semibold bg-white cursor-pointer focus:outline-none focus:border-purple"
                >
                  <option value="">Actif / Dernier</option>
                  {[...sortedSprints].reverse().map(s => (
                    <option key={s.numero} value={s.numero}>
                      S{s.numero} — {s.statut === 'en_cours' ? 'En cours' : s.statut === 'cloture' ? 'Clôturé' : s.statut === 'planifie' ? 'Planifié' : s.statut}
                    </option>
                  ))}
                </select>
              )}
            </div>
          }
          extraRight={
            <button onClick={e => { e.stopPropagation(); setZoomed(v => !v) }}
              className="flex items-center gap-1.5 px-4 text-[11px] font-semibold text-purple hover:text-purple/80 transition-colors shrink-0">
              {zoomed ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              {zoomed ? 'Réduire' : 'Zoom'}
            </button>
          }
        />
      </div>

      {/* Bouton détail sprint */}
      {scope === 'sprint' && effectiveSprintObj && (
        <button
          onClick={e => { e.stopPropagation(); setSprintDetailOpen(v => !v) }}
          className="flex items-center gap-1.5 w-full px-5 py-1.5 border-t border-border/40 text-[10px] font-semibold text-navy/60 hover:bg-bg/40 transition-colors text-left"
        >
          {sprintDetailOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          <span>Objectifs & Review — S{effectiveSprintObj.numero}</span>
          {items.length > 0 && (
            <span className={cn('ml-auto font-bold', pct === 100 ? 'text-green' : 'text-subtle')}>
              {doneCount}/{items.length} · {pct}%
            </span>
          )}
        </button>
      )}

      {/* Section détail sprint — miroir de SetupPage */}
      {scope === 'sprint' && sprintDetailOpen && effectiveSprintObj && (
        <div className="border-t border-border/40 bg-bg/10">
          <div className="grid grid-cols-2 divide-x divide-border/40">

            {/* Objectifs */}
            <div className="flex flex-col gap-2.5 p-4">
              <div className="text-[9px] font-bold text-subtle uppercase tracking-wider">
                Objectifs — S{effectiveSprintObj.numero}
              </div>
              {freeObj && (
                <div className="text-xs text-navy/80 leading-relaxed whitespace-pre-line bg-white border border-border rounded-lg px-3 py-2">
                  {freeObj}
                </div>
              )}
              {items.length > 0 && (
                <>
                  <div className="text-[9px] font-semibold text-subtle">Objectifs clés ({items.length})</div>
                  <ul className="flex flex-col gap-1">
                    {items.map(item => (
                      <li key={item} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white border border-border/40 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple/50 shrink-0" />
                        <span className="text-navy">{item}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {!freeObj && items.length === 0 && (
                <p className="text-xs text-subtle/40 italic">Aucun objectif défini pour ce sprint</p>
              )}
            </div>

            {/* Review + Checklist */}
            <div className="flex flex-col gap-2.5 p-4">
              <div className="text-[9px] font-bold text-subtle uppercase tracking-wider">
                Sprint Review
              </div>
              {freeRev && (
                <div className="text-xs text-navy/80 leading-relaxed whitespace-pre-line bg-white border border-border rounded-lg px-3 py-2">
                  {freeRev}
                </div>
              )}
              {items.length > 0 && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="text-[9px] font-semibold text-subtle">Checklist objectifs</div>
                    <span className={cn('text-[9px] font-bold ml-auto', pct === 100 ? 'text-green' : 'text-subtle')}>
                      {doneCount}/{items.length} · {pct}%
                    </span>
                  </div>
                  <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-green rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {items.map(item => (
                      <li key={item} className={cn('flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs',
                        checks[item] ? 'bg-green/10 text-green' : 'bg-white border border-border/40 text-navy')}>
                        <span className={cn('w-4 h-4 rounded flex items-center justify-center border shrink-0',
                          checks[item] ? 'bg-green border-green text-white' : 'border-border bg-white')}>
                          {checks[item] && <Check size={10} />}
                        </span>
                        <span className={cn('flex-1', checks[item] && 'line-through opacity-60')}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {!freeRev && items.length === 0 && (
                <p className="text-xs text-subtle/40 italic">Aucune review saisie pour ce sprint</p>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Dashboard complet (zoom) */}
      {zoomed && (
        <div className="border-t border-border">
          <ProduitDashboardBody produit={p} />
        </div>
      )}

      {/* Blocs avancement */}
      {!zoomed && (trims.length > 0 || displaySprint) && (
        <div className="px-4 pb-3 pt-2 space-y-2">
          {trims.length > 0 && (
            <TrimBlock trims={trims} onToggle={(trimId, itemId, checked) => onToggleObjectif(trimId, itemId, checked)} />
          )}
          {displaySprint && (
            <SprintBlock sprint={displaySprint} label={sprintActif ? 'Sprint en cours' : 'Dernier sprint clôturé'} />
          )}
        </div>
      )}

      {/* Détail expandable */}
      {!zoomed && revue.expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="ds-label mb-1 block">Statut présenté</label>
              <select value={revue.statut_presente} onChange={e => onChange('statut_presente', e.target.value)}
                className="ds-select text-xs">
                <option value="">— Non défini</option>
                {STATUTS_PRESENTE.map(st => <option key={st} value={st}>{st}</option>)}
              </select>
            </div>
            <div>
              <label className="ds-label mb-1 block">Blocages remontés</label>
              <input type="number" min="0" value={revue.blocages}
                onChange={e => onChange('blocages', Math.max(0, Number(e.target.value)))}
                className="ds-input text-xs" placeholder="0" />
            </div>
          </div>
          <div>
            <label className="ds-label mb-1 block">Notes de revue</label>
            <textarea value={revue.notes} onChange={e => onChange('notes', e.target.value)}
              className="ds-textarea text-xs" rows={3}
              placeholder="Points importants, décisions, actions…" />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────
export default function ReunionPage() {
  const { data: produits = [] } = useProduits()
  const { profile } = useAuth()
  const toast = useToast()
  const sauvegarder  = useSauvegarderReunion()
  const updateProduit = useUpdateProduit()

  const today    = new Date()
  const initWeek = getISOWeek(today)
  const [semaine, setSemaine] = useState(initWeek.semaine)
  const [annee,   setAnnee]   = useState(initWeek.annee)

  const { data: reunion }  = useReunionSemaine(semaine, annee)
  const { data: dbRevues } = useRevuesByReunion(reunion?.id ?? null)
  const { data: dbSujets } = useSujetsByReunion(reunion?.id ?? null)

  const activeProducts   = produits.filter(p => p.actif && !p.is_template)
  const activeProductIds = activeProducts.map(p => p.id)

  // Fetch sprints (actifs + dernier cloturé) pour tous les produits actifs
  const { data: allSprints = [] } = useQuery({
    queryKey: ['sprints-reunion', activeProductIds.join(',')],
    queryFn: async () => {
      if (activeProductIds.length === 0) return []
      const { data, error } = await supabase
        .from('sprints')
        .select('*')
        .in('produit_id', activeProductIds)
        .in('statut', ['en_cours', 'cloture'])
        .order('numero', { ascending: false })
      if (error) throw error
      return (data ?? []) as SprintFull[]
    },
    enabled: activeProductIds.length > 0,
    staleTime: 60_000,
  })

  function handleToggleObjectif(produitId: number, trimId: string, itemId: string, checked: boolean) {
    const produit = produits.find(p => p.id === produitId)
    if (!produit) return
    const newTrims = (produit.objectifs_trimestriels ?? []).map(t =>
      t.id === trimId
        ? { ...t, objectifs: (t.objectifs ?? []).map(o => o.id === itemId ? { ...o, checked } : o) }
        : t
    )
    updateProduit.mutate({ id: produitId, updates: { objectifs_trimestriels: newTrims } })
  }

  function getSprintInfo(produitId: number) {
    const ps       = allSprints.filter(s => s.produit_id === produitId)
    const actif    = ps.find(s => s.statut === 'en_cours') ?? null
    const lastClosed = ps.find(s => s.statut === 'cloture') ?? null
    return { actif, lastClosed }
  }

  // Timer
  const [currentPhase, setCurrentPhase] = useState(0)
  const [isRunning,    setIsRunning]    = useState(false)
  const [timeLeft,     setTimeLeft]     = useState(PHASES[0].minutes * 60)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Contenu
  const [animateur,   setAnimateur]   = useState(profile?.display_name ?? '')
  const [notesSeance, setNotesSeance] = useState('')
  const [phaseNotes,  setPhaseNotes]  = useState(['', '', '', ''])
  const [revues, setRevues] = useState<Record<number, RevueLocale>>({})
  const [sujets, setSujets] = useState<SujetLocale[]>([])

  // Init revues pour chaque produit actif
  useEffect(() => {
    setRevues(prev => {
      const next = { ...prev }
      for (const p of activeProducts) {
        if (!next[p.id]) next[p.id] = { statut_presente: '', blocages: 0, notes: '', expanded: false }
      }
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProductIds.join(',')])

  // Charger données DB → état local
  useEffect(() => {
    if (reunion) {
      setAnimateur(reunion.animateur ?? profile?.display_name ?? '')
      setNotesSeance(reunion.notes_seance ?? '')
    } else {
      setAnimateur(profile?.display_name ?? '')
      setNotesSeance('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reunion?.id])

  useEffect(() => {
    if (dbRevues?.length) {
      setRevues(prev => {
        const next = { ...prev }
        for (const r of dbRevues) {
          next[r.produit_id] = {
            statut_presente: r.statut_presente ?? '',
            blocages: r.blocages ?? 0,
            notes: r.notes ?? '',
            expanded: next[r.produit_id]?.expanded ?? false,
          }
        }
        return next
      })
    }
  }, [dbRevues])

  useEffect(() => {
    if (dbSujets) {
      setSujets(dbSujets.map(s => ({ id: String(s.id), type_tag: s.type_tag ?? '', titre: s.titre })))
    }
  }, [dbSujets])

  // Timer countdown
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) { setIsRunning(false); return 0 }
          return prev - 1
        })
      }, 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isRunning])

  function goToPhase(idx: number) {
    setIsRunning(false)
    setCurrentPhase(idx)
    setTimeLeft(PHASES[idx].minutes * 60)
  }

  function navigateWeek(delta: number) {
    const next = shiftWeek(semaine, annee, delta)
    setSemaine(next.semaine)
    setAnnee(next.annee)
    setCurrentPhase(0)
    setIsRunning(false)
    setTimeLeft(PHASES[0].minutes * 60)
    setNotesSeance('')
    setPhaseNotes(['', '', '', ''])
    setRevues({})
    setSujets([])
  }

  function updateRevue(produitId: number, field: keyof RevueLocale, value: string | number | boolean) {
    setRevues(prev => ({ ...prev, [produitId]: { ...prev[produitId], [field]: value } }))
  }

  function updatePhaseNote(idx: number, val: string) {
    setPhaseNotes(prev => prev.map((n, i) => i === idx ? val : n))
  }

  async function handleSave() {
    await sauvegarder.mutateAsync({
      semaine, annee,
      animateur: animateur || null,
      notes_seance: notesSeance || null,
      revues: activeProducts
        .map(p => ({
          produit_id: p.id,
          statut_presente: revues[p.id]?.statut_presente || null,
          blocages: revues[p.id]?.blocages ?? 0,
          notes: revues[p.id]?.notes || null,
        }))
        .filter(r => r.statut_presente || r.blocages > 0 || r.notes),
      sujets: sujets.filter(s => s.titre.trim()).map(s => ({
        type_tag: s.type_tag || null,
        titre: s.titre,
      })),
    })
    toast('Réunion sauvegardée')
  }

  const isCurrentWeek  = semaine === initWeek.semaine && annee === initWeek.annee
  const phase          = PHASES[currentPhase]
  const phasePct       = Math.round((1 - timeLeft / (phase.minutes * 60)) * 100)
  const totalBlockages = activeProducts.reduce((s, p) => s + (revues[p.id]?.blocages ?? 0), 0)

  return (
    <Layout>
      {/* Topbar */}
      <div className="page-topbar -mx-3 -mt-3 mb-5 px-3 md:-mx-5 md:-mt-5 md:px-5 print:hidden">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-navy">Réunion hebdo</h1>
          <div className="flex items-center gap-1">
            <button onClick={() => navigateWeek(-1)} className="p-1 rounded hover:bg-bg text-subtle hover:text-navy transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className={cn('text-xs font-bold px-2', isCurrentWeek ? 'text-purple' : 'text-navy')}>
              Semaine {semaine} — {annee}
            </span>
            <button onClick={() => navigateWeek(1)} className="p-1 rounded hover:bg-bg text-subtle hover:text-navy transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
          {!isCurrentWeek && (
            <button onClick={() => { setSemaine(initWeek.semaine); setAnnee(initWeek.annee) }}
              className="text-[10px] text-purple hover:underline">
              Cette semaine
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <input
            value={animateur}
            onChange={e => setAnimateur(e.target.value)}
            className="ds-input text-xs w-36"
            placeholder="Animateur…"
          />
          <button onClick={() => window.print()} className="ds-btn ds-btn-sm flex items-center gap-1.5">
            <Printer size={13} /> PDF
          </button>
          <button onClick={handleSave} disabled={sauvegarder.isPending}
            className="ds-btn-primary ds-btn-sm flex items-center gap-1.5 disabled:opacity-50">
            <Save size={13} /> {sauvegarder.isPending ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-6">
        <h1 className="text-xl font-bold text-navy">Réunion hebdo — Semaine {semaine} / {annee}</h1>
        {animateur && <p className="text-sm text-gray-600">Animateur : {animateur}</p>}
      </div>

      <div className="flex gap-5 items-start">
        {/* ── Contenu principal ──────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Stepper phases */}
          <div className="bg-white rounded-2xl border border-border p-3 print:hidden">
            <div className="flex items-stretch gap-1">
              {PHASES.map((ph, i) => {
                const isDone    = i < currentPhase
                const isCurrent = i === currentPhase
                return (
                  <button key={i} onClick={() => goToPhase(i)}
                    className={cn(
                      'flex-1 flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl transition-all text-center',
                      isCurrent ? `${ph.color} text-white` : isDone ? 'bg-bg text-navy/50' : 'hover:bg-bg text-subtle'
                    )}>
                    <div className={cn(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold shrink-0',
                      isCurrent ? 'border-white text-white' : isDone ? 'border-green-500 bg-green-500 text-white' : 'border-border'
                    )}>
                      {isDone ? <Check size={10} /> : i + 1}
                    </div>
                    <span className="text-[10px] font-semibold leading-tight">{ph.label}</span>
                    <span className={cn('text-[9px]', isCurrent ? 'text-white/70' : 'text-subtle/60')}>{ph.minutes} min</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Contenu de la phase */}
          {currentPhase === 0 ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-navy flex items-center gap-2">
                  Ordre du jour — Revues produits
                  <span className="text-[10px] font-normal text-subtle">
                    {activeProducts.length} produit{activeProducts.length > 1 ? 's' : ''}
                    {totalBlockages > 0 && (
                      <span className="ml-2 text-red-600 font-semibold">
                        · {totalBlockages} blocage{totalBlockages > 1 ? 's' : ''}
                      </span>
                    )}
                  </span>
                </h2>
                <button
                  onClick={() => {
                    const allExp = activeProducts.every(p => revues[p.id]?.expanded)
                    activeProducts.forEach(p => updateRevue(p.id, 'expanded', !allExp))
                  }}
                  className="text-xs text-subtle hover:text-navy transition-colors">
                  {activeProducts.every(p => revues[p.id]?.expanded) ? 'Tout réduire' : 'Tout développer'}
                </button>
              </div>
              <div className="space-y-2">
                {activeProducts.length === 0 ? (
                  <div className="text-center py-10 text-subtle text-sm">Aucun produit actif</div>
                ) : (
                  activeProducts.map(p => {
                    const { actif, lastClosed } = getSprintInfo(p.id)
                    return (
                      <ProduitRevueCard
                        key={p.id}
                        p={p}
                        revue={revues[p.id] ?? { statut_presente: '', blocages: 0, notes: '', expanded: false }}
                        onChange={(f, v) => updateRevue(p.id, f, v)}
                        sprintActif={actif}
                        lastSprint={lastClosed}
                        onToggleObjectif={(trimId, itemId, checked) =>
                          handleToggleObjectif(p.id, trimId, itemId, checked)
                        }
                      />
                    )
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-border p-5">
              <h2 className="text-sm font-bold text-navy mb-3">{phase.label}</h2>
              <textarea
                value={phaseNotes[currentPhase]}
                onChange={e => updatePhaseNote(currentPhase, e.target.value)}
                className="ds-textarea text-sm w-full"
                rows={12}
                placeholder={
                  currentPhase === 1 ? 'Points de synchronisation, dépendances inter-équipes, décisions…'
                  : currentPhase === 2 ? 'Processus, rituels agile, amélioration continue, rétrospective…'
                  : 'Récap des décisions, actions à suivre, prochaine réunion…'
                }
              />
            </div>
          )}

          {/* Notes de séance */}
          <div className="bg-white rounded-2xl border border-border p-5">
            <h2 className="text-sm font-bold text-navy mb-3">Notes de séance</h2>
            <textarea
              value={notesSeance}
              onChange={e => setNotesSeance(e.target.value)}
              className="ds-textarea text-sm w-full"
              rows={4}
              placeholder="Résumé global, décisions clés, actions de suivi…"
            />
          </div>
        </div>

        {/* ── Panneau droit ──────────────────────────────────────── */}
        <div className="w-60 shrink-0 space-y-4 print:hidden">

          {/* Timer */}
          <div className={cn('rounded-2xl text-white p-5 space-y-3', phase.color)}>
            <div className="text-[10px] uppercase tracking-widest font-bold opacity-70 text-center">
              Phase {currentPhase + 1}/{PHASES.length}
            </div>
            <div className="text-5xl font-mono font-bold text-center tabular-nums">
              {fmtTime(timeLeft)}
            </div>
            <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
              <div className="h-full rounded-full bg-white/80 transition-all" style={{ width: `${phasePct}%` }} />
            </div>
            <div className="text-[10px] text-white/60 text-center">{phase.label}</div>
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => goToPhase(Math.max(0, currentPhase - 1))}
                disabled={currentPhase === 0}
                className="p-2 rounded-lg bg-white/20 hover:bg-white/30 disabled:opacity-30 transition-colors">
                <SkipBack size={14} />
              </button>
              <button onClick={() => setIsRunning(r => !r)}
                className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 font-semibold text-sm transition-colors flex items-center gap-1.5">
                {isRunning
                  ? <><Pause size={14} /> Pause</>
                  : <><Play size={14} /> {timeLeft === phase.minutes * 60 ? 'Démarrer' : 'Reprendre'}</>
                }
              </button>
              <button onClick={() => goToPhase(Math.min(PHASES.length - 1, currentPhase + 1))}
                disabled={currentPhase === PHASES.length - 1}
                className="p-2 rounded-lg bg-white/20 hover:bg-white/30 disabled:opacity-30 transition-colors">
                <SkipForward size={14} />
              </button>
            </div>
          </div>

          {/* Progression */}
          <div className="bg-white rounded-2xl border border-border p-4 space-y-2">
            <div className="text-[10px] uppercase tracking-widest font-bold text-subtle mb-2">Progression</div>
            {PHASES.map((ph, i) => (
              <div key={i} className={cn('flex items-center gap-2 text-xs', i === currentPhase ? 'font-bold text-navy' : 'text-subtle')}>
                <div className={cn('w-2 h-2 rounded-full shrink-0', ph.color, i > currentPhase && 'opacity-30')} />
                <span className="flex-1 truncate">{ph.label}</span>
                <span className="tabular-nums">{ph.minutes}'</span>
              </div>
            ))}
            <div className="border-t border-border pt-2 flex justify-between text-xs text-subtle">
              <span>Total</span>
              <span className="font-bold text-navy">60'</span>
            </div>
          </div>

          {/* Sujets transverses */}
          <div className="bg-white rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-widest font-bold text-subtle">Sujets transverses</span>
              <button onClick={() => setSujets(prev => [...prev, { id: crypto.randomUUID(), type_tag: '', titre: '' }])}
                className="p-1 rounded hover:bg-bg text-subtle hover:text-purple transition-colors">
                <Plus size={13} />
              </button>
            </div>
            {sujets.length === 0 ? (
              <p className="text-xs text-subtle/50 text-center py-2">Aucun sujet</p>
            ) : (
              <div className="space-y-2">
                {sujets.map(s => (
                  <div key={s.id} className="flex items-start gap-1.5">
                    <input
                      value={s.type_tag}
                      onChange={e => setSujets(prev => prev.map(x => x.id === s.id ? { ...x, type_tag: e.target.value } : x))}
                      className="ds-input text-[10px] w-14 shrink-0 px-1.5 py-1"
                      placeholder="Tag"
                    />
                    <input
                      value={s.titre}
                      onChange={e => setSujets(prev => prev.map(x => x.id === s.id ? { ...x, titre: e.target.value } : x))}
                      className="ds-input text-xs flex-1 py-1"
                      placeholder="Sujet…"
                    />
                    <button onClick={() => setSujets(prev => prev.filter(x => x.id !== s.id))}
                      className="p-1 rounded hover:bg-red/10 text-subtle hover:text-red transition-colors shrink-0 mt-0.5">
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
