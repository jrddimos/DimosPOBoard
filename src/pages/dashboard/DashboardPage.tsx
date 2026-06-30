import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Spinner } from '@/components/ui/Spinner'
import { useAllTaches } from '@/hooks/useTaches'
import { useProduits } from '@/hooks/useProduits'
import { useFinanceConfig } from '@/hooks/useFinanceConfig'
import { useAuth } from '@/contexts/AuthContext'
import { useProduit } from '@/contexts/ProduitContext'
import { cn } from '@/lib/utils'
import {
  ChevronRight, AlertTriangle, CheckCircle2, XCircle,
  LayoutGrid, Package, CalendarDays, ClipboardList,
  TrendingUp, ShieldAlert, Clock
} from 'lucide-react'
import { ProduitDashboardBody } from '@/pages/produit-dashboard/ProduitDashboardBody'
import { Tooltip } from '@/components/ui/Tooltip'
import { computeProduitMetrics, scopedMetrics } from '@/utils/produitMetrics'
import type { Rag, MultiScope, ProduitMetrics } from '@/utils/produitMetrics'
import type { Produit } from '@/hooks/useProduits'
import type { Tache } from '@/types'

// ── Palette RAG pastel ────────────────────────────────────────
const RAG_CFG: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
  green: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: <CheckCircle2 size={12} /> },
  amber: { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   icon: <AlertTriangle size={12} /> },
  red:   { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    icon: <XCircle size={12} /> },
}

const TRAJ_CFG: Record<string, { bg: string; text: string; label: string }> = {
  green: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'En cours'  },
  amber: { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'À risque'  },
  red:   { bg: 'bg-rose-50',    text: 'text-rose-700',    label: 'En retard' },
}

function RagPill({ rag, tooltip }: { rag: Rag; tooltip?: string }) {
  const cfg = rag ? RAG_CFG[rag] : null
  if (!cfg) return <span className="text-slate-300 text-xs">—</span>
  return (
    <Tooltip content={tooltip}>
      <span className={cn(
        'inline-flex items-center justify-center w-7 h-7 rounded-lg border cursor-help transition-colors',
        cfg.bg, cfg.border
      )}>
        <span className={cfg.text}>{cfg.icon}</span>
      </span>
    </Tooltip>
  )
}

type DashMode = 'multi' | 'produit'

export default function DashboardPage() {
  const { data: produits = [], isLoading: loadProd } = useProduits()
  const { data: taches   = [], isLoading: loadTach } = useAllTaches()
  const { data: finConfig }                          = useFinanceConfig()
  const { isAdmin, getRoleForProduit }               = useAuth()
  const { produitActif, setProduitActif }            = useProduit()
  const navigate                                     = useNavigate()

  const [mode, setMode]               = useState<DashMode>('multi')
  const [scope, setScope]             = useState<MultiScope>('trim')
  const [viewProduitId, setViewProduitId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number> | null>(null)

  const today   = useMemo(() => new Date(), [])
  const fmtDate = (d: Date) => d.toLocaleDateString('fr-FR')

  const accessibles = produits.filter(p =>
    p.actif && !p.is_template && (isAdmin || getRoleForProduit(p.id) !== null)
  )
  const templateIds = new Set(produits.filter(p => p.is_template).map(p => p.id))

  useEffect(() => {
    if (accessibles.length > 0 && selectedIds === null)
      setSelectedIds(new Set(accessibles.map(p => p.id)))
  }, [accessibles.length])

  useEffect(() => {
    if (mode === 'produit' && produitActif && !viewProduitId)
      setViewProduitId(produitActif.id)
  }, [mode])

  const allParents = useMemo(
    () => taches.filter((t: Tache) => !t.parent_id && !templateIds.has(t.produit_id as number)),
    [taches, produits]
  )

  const metricsMap = useMemo(() => {
    const map = new Map<number, ProduitMetrics>()
    accessibles.forEach(p => {
      map.set(p.id, computeProduitMetrics(p, allParents.filter((t: Tache) => t.produit_id === p.id), finConfig, today))
    })
    return map
  }, [accessibles, allParents, finConfig, today])

  function toggleProduit(id: number) {
    setSelectedIds(prev => {
      const base = prev ?? new Set(accessibles.map(p => p.id))
      const next = new Set(base)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function roleLabel(pid: number) {
    if (isAdmin) return 'Admin'
    const r = getRoleForProduit(pid)
    return r === 'po' ? 'PO' : r === 'dev' ? 'Dev' : r === 'lecteur' ? 'Lecteur' : ''
  }

  function enter(p: Produit) {
    setProduitActif({ id: p.id, nom: p.nom, couleur: p.couleur })
    navigate('/sprint')
  }

  function zoomProduit(p: Produit) {
    setViewProduitId(p.id)
    setMode('produit')
  }

  if (loadProd || loadTach) return <Layout><Spinner /></Layout>

  const viewProduit = accessibles.find(p => p.id === viewProduitId) ?? null

  return (
    <Layout title="Dashboard">

      {/* ── Topbar ──────────────────────────────────────────── */}
      <div className="page-topbar -mx-3 -mt-3 mb-5 px-3 md:-mx-5 md:-mt-5 md:px-5 flex items-center gap-3 flex-wrap">

        {/* Toggle mode */}
        <div className="flex gap-0.5 bg-bg border border-border rounded-lg p-0.5">
          <button onClick={() => setMode('multi')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all',
              mode === 'multi' ? 'bg-white shadow-sm text-navy' : 'text-subtle hover:text-navy')}>
            <LayoutGrid size={13} />
            Multi-produits
          </button>
          <button onClick={() => setMode('produit')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all',
              mode === 'produit' ? 'bg-white shadow-sm text-navy' : 'text-subtle hover:text-navy')}>
            <Package size={13} />
            Par produit
          </button>
        </div>

        {/* Sélecteur produit (mode par produit) */}
        {mode === 'produit' && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {accessibles.map(p => (
              <button key={p.id} onClick={() => setViewProduitId(p.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border',
                  viewProduitId === p.id ? 'text-white border-transparent' : 'bg-white text-subtle border-border hover:border-navy/30'
                )}
                style={viewProduitId === p.id ? { background: p.couleur ?? '#4A4CC8' } : {}}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />
                {p.nom}
              </button>
            ))}
          </div>
        )}

        {/* Filtre périmètre (mode multi) */}
        {mode === 'multi' && accessibles.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-subtle font-medium">Périmètre :</span>
            {accessibles.map(p => {
              const on = selectedIds === null || selectedIds.has(p.id)
              return (
                <button key={p.id} onClick={() => toggleProduit(p.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all border',
                    on ? 'text-white border-transparent' : 'bg-white text-subtle border-border hover:border-navy/30'
                  )}
                  style={on ? { background: p.couleur ?? '#4A4CC8' } : {}}>
                  {p.nom}
                </button>
              )
            })}
            {selectedIds !== null && selectedIds.size < accessibles.length && (
              <button onClick={() => setSelectedIds(new Set(accessibles.map(p => p.id)))}
                className="px-2.5 py-1 rounded-full text-xs text-subtle hover:text-navy border border-dashed border-border">
                Tout
              </button>
            )}
          </div>
        )}

        {/* Toggle scope (mode multi) */}
        {mode === 'multi' && (
          <div className="flex gap-0.5 bg-bg border border-border rounded-lg p-0.5 ml-auto">
            <button onClick={() => setScope('global')}
              className={cn('px-3 py-1 rounded-md text-xs font-semibold transition-all',
                scope === 'global' ? 'bg-white shadow-sm text-navy' : 'text-subtle hover:text-navy')}>
              Global
            </button>
            <button onClick={() => setScope('trim')}
              className={cn('px-3 py-1 rounded-md text-xs font-semibold transition-all',
                scope === 'trim' ? 'bg-white shadow-sm text-navy' : 'text-subtle hover:text-navy')}>
              Trimestre
            </button>
          </div>
        )}
      </div>

      {/* ══ MODE MULTI-PRODUITS ══════════════════════════════════ */}
      {mode === 'multi' && (
        <>
          {accessibles.length === 0 ? (
            <div className="bg-white border border-border rounded-2xl flex flex-col items-center py-16 text-subtle gap-3 shadow-sm">
              <Package size={32} className="opacity-20" />
              <p className="text-sm font-medium">Aucun produit accessible</p>
            </div>
          ) : (
            <>
              <SyntheseTable
                produits={accessibles}
                metricsMap={metricsMap}
                selectedIds={selectedIds}
                scope={scope}
                fmtDate={fmtDate}
              />
              <div className="text-xs font-bold text-navy uppercase tracking-wider mb-3 mt-6 px-1">
                {accessibles.length} produit{accessibles.length !== 1 ? 's' : ''}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {accessibles.map(p => (
                  <ProduitCard
                    key={p.id}
                    p={p}
                    metrics={metricsMap.get(p.id)}
                    scope={scope}
                    isActif={produitActif?.id === p.id}
                    isInScope={selectedIds === null || selectedIds.has(p.id)}
                    role={roleLabel(p.id)}
                    fmtDate={fmtDate}
                    onZoom={() => zoomProduit(p)}
                    onEnter={() => enter(p)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ══ MODE PAR PRODUIT ════════════════════════════════════ */}
      {mode === 'produit' && (
        viewProduit
          ? <ProduitDashboardBody produit={viewProduit} />
          : <div className="bg-white border border-border rounded-2xl flex flex-col items-center py-16 text-subtle gap-3 shadow-sm">
              <Package size={32} className="opacity-20" />
              <p className="text-sm font-medium">Sélectionner un produit ci-dessus</p>
            </div>
      )}
    </Layout>
  )
}

// ── Table synthèse portefeuille ──────────────────────────────
function SyntheseTable({ produits, metricsMap, selectedIds, scope, fmtDate }: {
  produits: Produit[]; metricsMap: Map<number, ProduitMetrics>; selectedIds: Set<number> | null
  scope: MultiScope; fmtDate: (d: Date) => string
}) {
  return (
    <div className="bg-white border border-white rounded-2xl overflow-hidden shadow-md mb-2">
      <div className="px-4 py-3 border-b border-border bg-slate-50 flex items-center justify-between">
        <span className="text-xs font-bold text-navy uppercase tracking-wider">Synthèse portefeuille</span>
        <span className="text-[10px] text-subtle font-medium">
          {scope === 'trim' ? 'Trimestre courant' : 'Vue globale'}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/60 bg-slate-50/50">
              {['Produit', scope === 'trim' ? 'Trimestre' : 'Scope', 'Trajectoire', 'Avancement', 'Budget', 'Délai', 'Blocages', 'Livraison est.', 'US', 'Risques', 'Actions LOP'].map(h => (
                <th key={h} className="px-3 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {produits.map((p, i) => {
              const m = metricsMap.get(p.id)
              const s = m ? scopedMetrics(m, scope) : null
              const inScope = selectedIds === null || selectedIds.has(p.id)
              const traj = s?.trajectoire ? TRAJ_CFG[s.trajectoire] : null
              return (
                <tr key={p.id} className={cn(
                  'border-b border-border/40 hover:bg-slate-50/60 transition-colors',
                  !inScope && 'opacity-40',
                  i % 2 === 1 && 'bg-slate-50/30'
                )}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />
                      <span className="font-semibold text-navy whitespace-nowrap">{p.nom}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap text-[11px]">
                    {scope === 'trim' ? (m?.trimLabel ?? '—') : 'Global'}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <Tooltip content={s?.tipTraj}>
                      {traj
                        ? <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full cursor-help', traj.bg, traj.text)}>{traj.label}</span>
                        : <span className="text-slate-300">—</span>}
                    </Tooltip>
                  </td>
                  <td className="px-3 py-2.5"><RagPill rag={s?.ragA  ?? null} tooltip={s?.tipA} /></td>
                  <td className="px-3 py-2.5"><RagPill rag={s?.ragB  ?? null} tooltip={s?.tipB} /></td>
                  <td className="px-3 py-2.5"><RagPill rag={s?.ragD  ?? null} tooltip={s?.tipD} /></td>
                  <td className="px-3 py-2.5"><RagPill rag={s?.ragBl ?? null} tooltip={s?.tipBl} /></td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-400 whitespace-nowrap text-[11px]">
                    <Tooltip content={s?.tipD}>
                      <span className="cursor-help">{m?.estimatedDeliveryDate ? fmtDate(m.estimatedDeliveryDate) : '—'}</span>
                    </Tooltip>
                  </td>
                  <td className="px-3 py-2.5 text-center font-semibold text-navy">{s?.total ?? 0}</td>
                  <td className="px-3 py-2.5 text-center">
                    {(m?.openRisques ?? 0) > 0
                      ? <span className="text-amber-600 font-bold">{m!.openRisques}</span>
                      : <span className="text-slate-300">0</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {(m?.openActions ?? 0) > 0
                      ? <span className="text-indigo-600 font-bold">{m!.openActions}</span>
                      : <span className="text-slate-300">0</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Carte produit ────────────────────────────────────────────
function ProduitCard({ p, metrics: m, scope, isActif, isInScope, role, fmtDate, onZoom, onEnter }: {
  p: Produit; metrics: ProduitMetrics | undefined; scope: MultiScope
  isActif: boolean; isInScope: boolean; role: string
  fmtDate: (d: Date) => string; onZoom: () => void; onEnter: () => void
}) {
  const s = m ? scopedMetrics(m, scope) : null
  const traj = s?.trajectoire ? TRAJ_CFG[s.trajectoire] : null

  return (
    <div className={cn(
      'bg-white rounded-2xl border shadow-md overflow-hidden transition-all flex flex-col',
      isActif ? 'border-indigo-200 ring-2 ring-indigo-100' : 'border-white hover:shadow-lg',
      !isInScope && 'opacity-40'
    )}>
      {/* Bande couleur produit */}
      <div className="h-2 shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />

      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-bold text-navy text-sm truncate">{p.nom}</div>
            {p.description && <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{p.description}</div>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {role && (
              <span className="text-[9px] font-bold text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-full">
                {role}
              </span>
            )}
            {traj && (
              <Tooltip content={s?.tipTraj}>
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full cursor-help', traj.bg, traj.text)}>
                  {traj.label}
                </span>
              </Tooltip>
            )}
          </div>
        </div>

        {/* RAG grid */}
        {s && (
          <div className="grid grid-cols-4 gap-1.5">
            {([
              { label: 'Avancement', rag: s.ragA,  tip: s.tipA,  icon: <TrendingUp size={10} /> },
              { label: 'Budget',     rag: s.ragB,  tip: s.tipB,  icon: <ClipboardList size={10} /> },
              { label: 'Délai',      rag: s.ragD,  tip: s.tipD,  icon: <Clock size={10} /> },
              { label: 'Blocages',   rag: s.ragBl, tip: s.tipBl, icon: <ShieldAlert size={10} /> },
            ]).map(({ label, rag, tip, icon }) => {
              const cfg = rag ? RAG_CFG[rag] : null
              return (
                <Tooltip key={label} content={tip}>
                  <div className={cn(
                    'flex flex-col items-center gap-1 rounded-xl border py-2 cursor-help transition-colors',
                    cfg ? cn(cfg.bg, cfg.border) : 'bg-slate-50 border-slate-100'
                  )}>
                    <span className={cfg ? cfg.text : 'text-slate-300'}>{icon}</span>
                    <span className={cn('text-[8px] font-bold uppercase tracking-wide', cfg ? cfg.text : 'text-slate-300')}>
                      {label}
                    </span>
                    <span className={cfg ? cfg.text : 'text-slate-200'}>
                      {rag ? (rag === 'green' ? <CheckCircle2 size={11} /> : rag === 'amber' ? <AlertTriangle size={11} /> : <XCircle size={11} />) : <span className="text-[10px]">—</span>}
                    </span>
                  </div>
                </Tooltip>
              )
            })}
          </div>
        )}

        {/* Barre d'avancement */}
        {s && (
          <div>
            <div className="flex items-center justify-between text-[11px] mb-1.5">
              <span className="text-slate-400">{s.fait}/{s.total} US terminées</span>
              <span className="font-bold text-navy">{s.backlogPct}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${s.backlogPct}%`, background: p.couleur ?? '#4A4CC8', opacity: 0.7 }} />
            </div>
          </div>
        )}

        {/* Risques + actions + date */}
        {m && (m.openRisques > 0 || m.openActions > 0 || m.estimatedDeliveryDate) && (
          <div className="flex items-center gap-3 flex-wrap">
            {m.openRisques > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                <AlertTriangle size={11} /> {m.openRisques} risque{m.openRisques > 1 ? 's' : ''}
              </span>
            )}
            {m.openActions > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-indigo-500 font-medium">
                <ClipboardList size={11} /> {m.openActions} action{m.openActions > 1 ? 's' : ''}
              </span>
            )}
            {m.estimatedDeliveryDate && (
              <span className="flex items-center gap-1 text-[11px] text-slate-400 ml-auto tabular-nums">
                <CalendarDays size={11} /> {fmtDate(m.estimatedDeliveryDate)}
              </span>
            )}
          </div>
        )}

        {scope === 'trim' && m?.trimLabel && (
          <div className="text-[10px] text-slate-400">
            {m.trimLabel}{m.cursorPct !== null && <span className="ml-1">· curseur {m.cursorPct}%</span>}
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center gap-2 pt-2 mt-auto border-t border-slate-100">
          <button onClick={onZoom}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors">
            Dashboard
          </button>
          <button onClick={onEnter}
            className="flex items-center gap-1 text-xs font-semibold text-indigo-500 hover:text-indigo-700 transition-colors ml-auto">
            {isActif ? 'Sprint actif' : 'Ouvrir sprint'}
            <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
