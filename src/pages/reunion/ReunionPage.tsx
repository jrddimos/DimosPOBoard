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
  Target, Maximize2, Minimize2,
} from 'lucide-react'
import type { Produit, TrimObjectif } from '@/hooks/useProduits'
import type { Sprint } from '@/types'
import { ProduitDashboardBody } from '@/pages/produit-dashboard/ProduitDashboardBody'
import { ProduitBandeauRow }    from '@/pages/produit-dashboard/ProduitBandeauRow'
import type { BandeauScope }   from '@/pages/produit-dashboard/ProduitBandeauRow'


// ── Phases ────────────────────────────────────────────────────────
const PHASES = [
  { label: 'Revues produits',        minutes: 25, bg: 'bg-indigo-50',  border: 'border-indigo-200', text: 'text-indigo-700',  dot: 'bg-indigo-400',  timerBg: 'bg-indigo-50',  timerText: 'text-indigo-700' },
  { label: 'Synchro opérationnelle', minutes: 20, bg: 'bg-sky-50',     border: 'border-sky-200',    text: 'text-sky-700',     dot: 'bg-sky-400',     timerBg: 'bg-sky-50',     timerText: 'text-sky-700'    },
  { label: 'Rituels & process',      minutes: 10, bg: 'bg-amber-50',   border: 'border-amber-200',  text: 'text-amber-700',   dot: 'bg-amber-400',   timerBg: 'bg-amber-50',   timerText: 'text-amber-700'  },
  { label: 'Wrap-up',               minutes:  5, bg: 'bg-emerald-50', border: 'border-emerald-200',text: 'text-emerald-700', dot: 'bg-emerald-400', timerBg: 'bg-emerald-50', timerText: 'text-emerald-700'},
] as const

const STATUTS_PRESENTE = ['On track', 'At risk', 'Off track', 'En pause', 'Non présenté'] as const
const STATUT_COLORS: Record<string, string> = {
  'On track':     'bg-emerald-50 text-emerald-700 border border-emerald-200',
  'At risk':      'bg-amber-50 text-amber-700 border border-amber-200',
  'Off track':    'bg-rose-50 text-rose-700 border border-rose-200',
  'En pause':     'bg-slate-100 text-slate-500 border border-slate-200',
  'Non présenté': 'bg-slate-50 text-slate-400 border border-slate-100',
}
const TRIM_BAR: Record<string, string> = {
  'On track':  'bg-emerald-400',
  'At risk':   'bg-amber-400',
  'Off track': 'bg-rose-400',
  'En pause':  'bg-slate-300',
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


// ── Types locaux ──────────────────────────────────────────────────


interface RevueLocale {
  statut_presente: string
  blocages: number
  notes: string
  expanded: boolean
}
interface SujetLocale { id: string; type_tag: string; titre: string }

// ── Bloc objectif trimestriel (collapsible, mode flat ou carte) ───
function TrimBlock({
  trims, onToggle, flat = false,
}: {
  trims: TrimObjectif[]
  onToggle: (trimId: string, itemId: string, checked: boolean) => void
  flat?: boolean
}) {
  const [open, setOpen] = useState(false)
  const t = [...trims].reverse().find(x => x.objectifs?.length || x.statut)
  if (!t) return null

  const items    = t.objectifs ?? []
  const pct      = trimAvancement(t)
  const done     = items.filter(o => o.checked).length
  const barColor = t.statut ? (TRIM_BAR[t.statut] ?? 'bg-emerald-400') : 'bg-emerald-400'

  const inner = (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-border/20 transition-colors text-left"
      >
        <Target size={10} className="text-indigo-500 shrink-0" />
        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Objectif trim</span>
        {t.trimestre && <span className="text-[10px] text-slate-400">— {t.trimestre}</span>}
        <div className="flex items-center gap-1.5 ml-auto">
          {t.statut && (
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', STATUT_COLORS[t.statut] ?? 'bg-gray-100')}>
              {t.statut}
            </span>
          )}
          {pct !== null && <span className="text-[10px] font-bold text-slate-700 tabular-nums">{pct}%</span>}
          {open ? <ChevronUp size={10} className="text-subtle ml-1" /> : <ChevronDown size={10} className="text-subtle ml-1" />}
        </div>
      </button>

      {pct !== null && (
        <div className="px-3 pb-2 flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-border overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] text-subtle tabular-nums">{done}/{items.length}</span>
        </div>
      )}

      {open && items.length > 0 && (
        <div className="px-3 pb-2.5 space-y-1.5 border-t border-border/40 pt-2">
          {items.map(obj => (
            <button
              key={obj.id}
              onClick={() => onToggle(t.id, obj.id, !obj.checked)}
              className="w-full flex items-start gap-2 text-left group"
            >
              <div className={cn(
                'mt-0.5 w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all',
                obj.checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-200 group-hover:border-indigo-300'
              )}>
                {obj.checked && <Check size={8} className="text-white" />}
              </div>
              <span className={cn('text-xs leading-snug flex-1', obj.checked ? 'line-through text-slate-400' : 'text-slate-700')}>
                {obj.texte || <span className="italic text-subtle/40">Sans titre</span>}
              </span>
            </button>
          ))}
        </div>
      )}
      {open && items.length === 0 && (
        <p className="px-3 pb-2.5 text-xs text-subtle/40 italic border-t border-border/40 pt-2">Aucun objectif défini</p>
      )}
    </>
  )

  if (flat) return <>{inner}</>
  return <div className="rounded-lg border border-border bg-bg overflow-hidden">{inner}</div>
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
  p, revue, onChange, onToggleObjectif,
}: {
  p: Produit
  revue: RevueLocale
  onChange: (field: keyof RevueLocale, value: string | number | boolean) => void
  onToggleObjectif: (trimId: string, itemId: string, checked: boolean) => void
}) {
  const trims = Array.isArray(p.objectifs_trimestriels) ? p.objectifs_trimestriels : []

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
    <div className="border border-white rounded-2xl overflow-hidden bg-white shadow-md">
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
          <div className="flex items-center gap-1 text-rose-600 shrink-0">
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
                      scope === v ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50')}>
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
                  className="text-[9px] border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 font-semibold bg-white cursor-pointer focus:outline-none focus:border-indigo-300"
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
              className="flex items-center gap-1.5 px-4 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors shrink-0">
              {zoomed ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              {zoomed ? 'Réduire' : 'Zoom'}
            </button>
          }
        />
      </div>

      {/* Carte Objectifs & Review — même style que TrimBlock */}
      {!zoomed && ((scope === 'sprint' && !!effectiveSprintObj) || trims.length > 0) && (
        <div className="mx-4 mb-3 rounded-lg border border-border bg-bg overflow-hidden">

          {/* ─ En-tête principal ─ */}
          <button
            onClick={e => { e.stopPropagation(); setSprintDetailOpen(v => !v) }}
            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-border/20 transition-colors text-left"
          >
            <Target size={10} className="text-indigo-500 shrink-0" />
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
              {scope === 'sprint' && effectiveSprintObj
                ? `Objectifs & Review — S${effectiveSprintObj.numero}`
                : 'Objectifs & Review'}
            </span>
            {scope === 'sprint' && items.length > 0 && (
              <span className={cn('text-[10px] font-bold tabular-nums ml-auto', pct === 100 ? 'text-emerald-600' : 'text-slate-500')}>
                {doneCount}/{items.length} · {pct}%
              </span>
            )}
            {sprintDetailOpen
              ? <ChevronUp size={10} className="text-subtle ml-1 shrink-0" />
              : <ChevronDown size={10} className="text-subtle ml-1 shrink-0" />}
          </button>

          {/* ─ Barre sprint ─ */}
          {scope === 'sprint' && items.length > 0 && (
            <div className="px-3 pb-2 flex items-center gap-2">
              <div className="flex-1 h-1 rounded-full bg-border overflow-hidden">
                <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[10px] text-subtle tabular-nums">{doneCount}/{items.length}</span>
            </div>
          )}

          {/* ─ Contenu expandable ─ */}
          {sprintDetailOpen && (
            <div className="border-t border-border/40">

              {/* Sprint Objectifs & Review */}
              {scope === 'sprint' && effectiveSprintObj && (
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
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 shrink-0" />
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
                    <div className="text-[9px] font-bold text-subtle uppercase tracking-wider">Sprint Review</div>
                    {freeRev && (
                      <div className="text-xs text-navy/80 leading-relaxed whitespace-pre-line bg-white border border-border rounded-lg px-3 py-2">
                        {freeRev}
                      </div>
                    )}
                    {items.length > 0 && (
                      <>
                        <div className="flex items-center gap-2">
                          <div className="text-[9px] font-semibold text-subtle">Checklist objectifs</div>
                          <span className={cn('text-[9px] font-bold ml-auto', pct === 100 ? 'text-emerald-600' : 'text-slate-400')}>
                            {doneCount}/{items.length} · {pct}%
                          </span>
                        </div>
                        <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <ul className="flex flex-col gap-1.5">
                          {items.map(item => (
                            <li key={item} className={cn('flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs',
                              checks[item] ? 'bg-emerald-50 text-emerald-700' : 'bg-white border border-slate-100 text-slate-700')}>
                              <span className={cn('w-4 h-4 rounded flex items-center justify-center border shrink-0',
                                checks[item] ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 bg-white')}>
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
              )}

              {/* Objectif trim — flat, séparé si sprint aussi présent */}
              {trims.length > 0 && (
                <div className={cn(scope === 'sprint' && effectiveSprintObj && 'border-t border-border/40')}>
                  <TrimBlock
                    trims={trims}
                    onToggle={(trimId, itemId, checked) => onToggleObjectif(trimId, itemId, checked)}
                    flat
                  />
                </div>
              )}

            </div>
          )}

        </div>
      )}

      {/* Dashboard complet (zoom) */}
      {zoomed && (
        <div className="border-t border-border">
          <ProduitDashboardBody produit={p} />
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

  const activeProducts = produits.filter(p => p.actif && !p.is_template)

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
  }, [activeProducts.map(p => p.id).join(',')])

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
            <span className={cn('text-xs font-bold px-2', isCurrentWeek ? 'text-indigo-600' : 'text-slate-700')}>
              Semaine {semaine} — {annee}
            </span>
            <button onClick={() => navigateWeek(1)} className="p-1 rounded hover:bg-bg text-subtle hover:text-navy transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
          {!isCurrentWeek && (
            <button onClick={() => { setSemaine(initWeek.semaine); setAnnee(initWeek.annee) }}
              className="text-[10px] text-indigo-600 hover:underline">
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
                      'flex-1 flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl transition-all text-center border',
                      isCurrent ? `${ph.bg} ${ph.text} ${ph.border}` : isDone ? 'bg-slate-50 text-slate-400 border-slate-100' : 'hover:bg-slate-50 text-slate-400 border-transparent'
                    )}>
                    <div className={cn(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold shrink-0',
                      isCurrent ? `${ph.border} ${ph.text}` : isDone ? 'border-emerald-400 bg-emerald-400 text-white' : 'border-slate-200'
                    )}>
                      {isDone ? <Check size={10} /> : i + 1}
                    </div>
                    <span className="text-[10px] font-semibold leading-tight">{ph.label}</span>
                    <span className={cn('text-[9px]', isCurrent ? 'opacity-60' : 'text-slate-400')}>{ph.minutes} min</span>
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
                      <span className="ml-2 text-rose-600 font-semibold">
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
                    return (
                      <ProduitRevueCard
                        key={p.id}
                        p={p}
                        revue={revues[p.id] ?? { statut_presente: '', blocages: 0, notes: '', expanded: false }}
                        onChange={(f, v) => updateRevue(p.id, f, v)}
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
          <div className={cn('rounded-2xl border p-5 space-y-3', phase.timerBg, phase.border)}>
            <div className={cn('text-[10px] uppercase tracking-widest font-bold opacity-60 text-center', phase.timerText)}>
              Phase {currentPhase + 1}/{PHASES.length}
            </div>
            <div className={cn('text-5xl font-mono font-bold text-center tabular-nums', phase.timerText)}>
              {fmtTime(timeLeft)}
            </div>
            <div className="h-1.5 rounded-full bg-white/80 overflow-hidden">
              <div className={cn('h-full rounded-full transition-all', phase.dot)} style={{ width: `${phasePct}%` }} />
            </div>
            <div className={cn('text-[10px] text-center opacity-60', phase.timerText)}>{phase.label}</div>
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => goToPhase(Math.max(0, currentPhase - 1))}
                disabled={currentPhase === 0}
                className={cn('p-2 rounded-lg bg-white/60 hover:bg-white/90 disabled:opacity-30 transition-colors', phase.timerText)}>
                <SkipBack size={14} />
              </button>
              <button onClick={() => setIsRunning(r => !r)}
                className={cn('px-4 py-2 rounded-xl bg-white/60 hover:bg-white/90 font-semibold text-sm transition-colors flex items-center gap-1.5', phase.timerText)}>
                {isRunning
                  ? <><Pause size={14} /> Pause</>
                  : <><Play size={14} /> {timeLeft === phase.minutes * 60 ? 'Démarrer' : 'Reprendre'}</>
                }
              </button>
              <button onClick={() => goToPhase(Math.min(PHASES.length - 1, currentPhase + 1))}
                disabled={currentPhase === PHASES.length - 1}
                className={cn('p-2 rounded-lg bg-white/60 hover:bg-white/90 disabled:opacity-30 transition-colors', phase.timerText)}>
                <SkipForward size={14} />
              </button>
            </div>
          </div>

          {/* Progression */}
          <div className="bg-white rounded-2xl border border-border p-4 space-y-2">
            <div className="text-[10px] uppercase tracking-widest font-bold text-subtle mb-2">Progression</div>
            {PHASES.map((ph, i) => (
              <div key={i} className={cn('flex items-center gap-2 text-xs', i === currentPhase ? 'font-bold text-navy' : 'text-subtle')}>
                <div className={cn('w-2 h-2 rounded-full shrink-0', ph.dot, i > currentPhase && 'opacity-30')} />
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
                className="p-1 rounded hover:bg-slate-50 text-slate-400 hover:text-indigo-600 transition-colors">
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
                      className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors shrink-0 mt-0.5">
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
