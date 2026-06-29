import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Spinner } from '@/components/ui/Spinner'
import { useAllTaches } from '@/hooks/useTaches'
import { useSprintActif } from '@/hooks/useSprints'
import { useProduits } from '@/hooks/useProduits'
import { useFinanceConfig } from '@/hooks/useFinanceConfig'
import { useAuth } from '@/contexts/AuthContext'
import { useProduit } from '@/contexts/ProduitContext'
import { cn } from '@/lib/utils'
import { ChevronRight, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { ProduitDashboardBody } from '@/pages/produit-dashboard/ProduitDashboardBody'
import { Tooltip } from '@/components/ui/Tooltip'
import { computeProduitMetrics, scopedMetrics } from '@/utils/produitMetrics'
import type { Rag, MultiScope, ProduitMetrics } from '@/utils/produitMetrics'
import type { Produit } from '@/hooks/useProduits'
import type { Tache } from '@/types'

// ── UI helpers RAG ───────────────────────────────────────────────
const RAG_BG: Record<string, string> = { green: 'bg-green', amber: 'bg-orange', red: 'bg-red' }
const TRAJ_LABEL: Record<string, string> = { green: 'ON TRACK', amber: 'AT RISK', red: 'RETARD' }

function RagIcon({ rag, size = 12 }: { rag: Rag; size?: number }) {
  if (rag === 'green') return <CheckCircle  size={size} />
  if (rag === 'amber') return <AlertTriangle size={size} />
  if (rag === 'red')   return <XCircle      size={size} />
  return null
}
const TRAJ_CLS: Record<string, string> = {
  green: 'text-green  bg-green/10',
  amber: 'text-orange bg-orange/10',
  red:   'text-red    bg-red/10',
}

type DashMode = 'multi' | 'produit'

export default function DashboardPage() {
  const { data: produits = [], isLoading: loadProd } = useProduits()
  const { data: taches   = [], isLoading: loadTach } = useAllTaches()
  const { data: sprintActif }                        = useSprintActif()
  const { data: finConfig }                          = useFinanceConfig()
  const { isAdmin, getRoleForProduit }               = useAuth()
  const { produitActif, setProduitActif }            = useProduit()
  const navigate                                     = useNavigate()

  const [mode, setMode]             = useState<DashMode>('multi')
  const [scope, setScope]           = useState<MultiScope>('trim')
  const [viewProduitId, setViewProduitId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds]     = useState<Set<number> | null>(null)

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

  // Métriques par produit pour le mode multi
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

      {/* ── Barre de mode ─────────────────────────────────────── */}
      <div className="page-topbar -mx-3 -mt-3 mb-5 px-3 md:-mx-5 md:-mt-5 md:px-5 flex items-center gap-3 flex-wrap">
        <div className="flex gap-0.5 bg-bg border border-border rounded-lg p-0.5">
          <button onClick={() => setMode('multi')}
            className={cn('px-4 py-1.5 rounded-md text-xs font-semibold transition-all',
              mode === 'multi' ? 'bg-white shadow-sm text-navy' : 'text-subtle hover:text-navy')}>
            🌐 Multi-produits
          </button>
          <button onClick={() => setMode('produit')}
            className={cn('px-4 py-1.5 rounded-md text-xs font-semibold transition-all',
              mode === 'produit' ? 'bg-white shadow-sm text-navy' : 'text-subtle hover:text-navy')}>
            📦 Par produit
          </button>
        </div>

        {mode === 'produit' && (
          <div className="flex items-center gap-2 flex-wrap">
            {accessibles.map(p => (
              <button key={p.id} onClick={() => setViewProduitId(p.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border',
                  viewProduitId === p.id ? 'text-white border-transparent' : 'bg-white text-subtle border-border hover:border-navy/30'
                )}
                style={viewProduitId === p.id ? { background: p.couleur ?? '#4A4CC8' } : {}}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />
                {p.nom}
              </button>
            ))}
          </div>
        )}

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
        {sprintActif && <span className="ds-pill-stat pill-wip rounded-full">Sprint {sprintActif.numero}</span>}
      </div>

      {/* ══════════════════════════════════════════════════════════
          MODE MULTI-PRODUITS
      ══════════════════════════════════════════════════════════ */}
      {mode === 'multi' && (
        <>
          {accessibles.length === 0
            ? <div className="ds-card flex flex-col items-center py-12 text-subtle gap-2">
                <div className="text-3xl mb-2">📦</div>
                <p className="text-sm">Aucun produit accessible</p>
              </div>
            : <>
                <SyntheseTable
                  produits={accessibles}
                  metricsMap={metricsMap}
                  selectedIds={selectedIds}
                  scope={scope}
                  fmtDate={fmtDate}
                />
                <div className="text-sm font-semibold text-navy mb-3 mt-5">
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
          }
        </>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODE PAR PRODUIT
      ══════════════════════════════════════════════════════════ */}
      {mode === 'produit' && (
        viewProduit
          ? <ProduitDashboardBody produit={viewProduit} />
          : <div className="ds-card flex flex-col items-center py-16 text-subtle gap-3">
              <div className="text-3xl">📦</div>
              <p className="text-sm font-medium">Sélectionner un produit ci-dessus</p>
            </div>
      )}
    </Layout>
  )
}

// ── Composants utilitaires ───────────────────────────────────────

function MiniRagCell({ label, rag, tooltip }: { label: string; rag: Rag; tooltip?: string }) {
  return (
    <Tooltip content={tooltip}>
      <div className="flex flex-col rounded overflow-hidden border border-border cursor-help">
        <div className="text-[8px] font-bold text-subtle uppercase tracking-wide px-1 py-0.5 bg-bg text-center border-b border-border leading-tight">{label}</div>
        <div className={cn('flex items-center justify-center py-1', rag ? `${RAG_BG[rag]} text-white` : 'bg-bg text-subtle/30')}>
          {rag ? <RagIcon rag={rag} size={11} /> : <span className="text-[9px]">—</span>}
        </div>
      </div>
    </Tooltip>
  )
}

// ── Table de synthèse ────────────────────────────────────────────
function SyntheseTable({ produits, metricsMap, selectedIds, scope, fmtDate }: {
  produits: Produit[]; metricsMap: Map<number, ProduitMetrics>; selectedIds: Set<number> | null
  scope: MultiScope; fmtDate: (d: Date) => string
}) {
  return (
    <div className="mb-2">
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-bg/60 flex items-center justify-between">
          <span className="text-xs font-bold text-navy uppercase tracking-wider">Synthèse portefeuille</span>
          <span className="text-[9px] text-subtle font-medium">{scope === 'trim' ? 'Vue trimestre courant' : 'Vue globale (tous sprints)'}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <colgroup>
              <col className="min-w-[140px]" />
              <col className="min-w-[90px]" />
              <col className="min-w-[90px]" />
              <col className="min-w-[80px]" />
              <col className="min-w-[70px]" />
              <col className="min-w-[70px]" />
              <col className="min-w-[80px]" />
              <col className="min-w-[100px]" />
              <col className="min-w-[50px]" />
              <col className="min-w-[60px]" />
              <col className="min-w-[80px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-3 py-2 text-[9px] font-bold text-subtle uppercase tracking-wider bg-bg whitespace-nowrap">Produit</th>
                <th className="px-3 py-2 text-[9px] font-bold text-subtle uppercase tracking-wider bg-bg whitespace-nowrap">{scope === 'trim' ? 'Trimestre' : 'Scope'}</th>
                <th className="px-3 py-2 text-[9px] font-bold text-subtle uppercase tracking-wider bg-bg whitespace-nowrap">Trajectoire</th>
                <th className="px-3 py-2 text-[9px] font-bold text-subtle uppercase tracking-wider bg-bg whitespace-nowrap">Avancement</th>
                <th className="px-3 py-2 text-[9px] font-bold text-subtle uppercase tracking-wider bg-bg whitespace-nowrap">Budget</th>
                <th className="px-3 py-2 text-[9px] font-bold text-subtle uppercase tracking-wider bg-bg whitespace-nowrap">Délai</th>
                <th className="px-3 py-2 text-[9px] font-bold text-subtle uppercase tracking-wider bg-bg whitespace-nowrap">Blocages</th>
                <th className="px-3 py-2 text-[9px] font-bold text-subtle uppercase tracking-wider bg-bg whitespace-nowrap">Livraison est.</th>
                <th className="px-3 py-2 text-[9px] font-bold text-subtle uppercase tracking-wider bg-bg whitespace-nowrap text-center">US</th>
                <th className="px-3 py-2 text-[9px] font-bold text-subtle uppercase tracking-wider bg-bg whitespace-nowrap text-center">Risques</th>
                <th className="px-3 py-2 text-[9px] font-bold text-subtle uppercase tracking-wider bg-bg whitespace-nowrap text-center">Actions LOP</th>
              </tr>
            </thead>
            <tbody>
              {produits.map((p, i) => {
                const m = metricsMap.get(p.id)
                const s = m ? scopedMetrics(m, scope) : null
                const inScope = selectedIds === null || selectedIds.has(p.id)
                return (
                  <tr key={p.id} className={cn('border-b border-border/50 hover:bg-bg/30 transition-colors', !inScope && 'opacity-40', i % 2 === 1 && 'bg-bg/20')}>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />
                        <span className="font-semibold text-navy whitespace-nowrap">{p.nom}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-subtle whitespace-nowrap">
                      {scope === 'trim' ? (m?.trimLabel ?? '—') : 'Global'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <Tooltip content={s?.tipTraj}>
                        {s?.trajectoire
                          ? <span className={cn('text-[9px] font-black px-1.5 py-0.5 rounded whitespace-nowrap cursor-help', TRAJ_CLS[s.trajectoire])}>{TRAJ_LABEL[s.trajectoire]}</span>
                          : <span className="text-subtle">—</span>}
                      </Tooltip>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <Tooltip content={s?.tipA}>
                        {s?.ragA
                          ? <span className={cn('inline-flex items-center justify-center w-6 h-6 rounded cursor-help text-white', RAG_BG[s.ragA])}><RagIcon rag={s.ragA} size={12} /></span>
                          : <span className="text-subtle">—</span>}
                      </Tooltip>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <Tooltip content={s?.tipB}>
                        {s?.ragB
                          ? <span className={cn('inline-flex items-center justify-center w-6 h-6 rounded cursor-help text-white', RAG_BG[s.ragB])}><RagIcon rag={s.ragB} size={12} /></span>
                          : <span className="text-subtle">—</span>}
                      </Tooltip>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <Tooltip content={s?.tipD}>
                        {s?.ragD
                          ? <span className={cn('inline-flex items-center justify-center w-6 h-6 rounded cursor-help text-white', RAG_BG[s.ragD])}><RagIcon rag={s.ragD} size={12} /></span>
                          : <span className="text-subtle">—</span>}
                      </Tooltip>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <Tooltip content={s?.tipBl}>
                        {s?.ragBl
                          ? <span className={cn('inline-flex items-center justify-center w-6 h-6 rounded cursor-help text-white', RAG_BG[s.ragBl])}><RagIcon rag={s.ragBl} size={12} /></span>
                          : <span className="text-subtle">—</span>}
                      </Tooltip>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-subtle whitespace-nowrap">
                      <Tooltip content={s?.tipD}>
                        <span className="cursor-help">{m?.estimatedDeliveryDate ? fmtDate(m.estimatedDeliveryDate) : '—'}</span>
                      </Tooltip>
                    </td>
                    <td className="px-3 py-2.5 text-center font-semibold text-navy">{s?.total ?? 0}</td>
                    <td className="px-3 py-2.5 text-center">
                      {(m?.openRisques ?? 0) > 0
                        ? <span className="text-orange font-bold">{m!.openRisques}</span>
                        : <span className="text-subtle">0</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {(m?.openActions ?? 0) > 0
                        ? <span className="text-navy font-bold">{m!.openActions}</span>
                        : <span className="text-subtle">0</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Carte produit ────────────────────────────────────────────────
function ProduitCard({ p, metrics: m, scope, isActif, isInScope, role, fmtDate, onZoom, onEnter }: {
  p: Produit; metrics: ProduitMetrics | undefined; scope: MultiScope; isActif: boolean; isInScope: boolean; role: string
  fmtDate: (d: Date) => string; onZoom: () => void; onEnter: () => void
}) {
  const s = m ? scopedMetrics(m, scope) : null

  return (
    <div className={cn(
      'bg-white rounded-2xl border shadow-sm overflow-hidden transition-all flex flex-col',
      isActif ? 'border-purple ring-2 ring-purple/20' : 'border-border',
      !isInScope && 'opacity-40'
    )}>
      <div className="h-1.5 shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-bold text-navy text-sm truncate">{p.nom}</div>
            {p.description && <div className="text-xs text-subtle mt-0.5 line-clamp-1">{p.description}</div>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {role && <span className="text-[9px] font-semibold text-subtle">{role}</span>}
            {s?.trajectoire && (
              <Tooltip content={s.tipTraj}>
                <span className={cn('text-[9px] font-black px-1.5 py-0.5 rounded cursor-help', TRAJ_CLS[s.trajectoire])}>
                  {TRAJ_LABEL[s.trajectoire]}
                </span>
              </Tooltip>
            )}
          </div>
        </div>

        {s && (
          <div className="grid grid-cols-4 gap-1">
            <MiniRagCell label="Avancement" rag={s.ragA}  tooltip={s.tipA} />
            <MiniRagCell label="Budget"     rag={s.ragB}  tooltip={s.tipB} />
            <MiniRagCell label="Délai"      rag={s.ragD}  tooltip={s.tipD} />
            <MiniRagCell label="Blocages"   rag={s.ragBl} tooltip={s.tipBl} />
          </div>
        )}

        {s && (
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-subtle">{s.fait}/{s.total} US terminées</span>
              <span className="font-bold text-navy">{s.backlogPct}%</span>
            </div>
            <div className="h-1.5 bg-border rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${s.backlogPct}%`, background: p.couleur ?? '#4A4CC8' }} />
            </div>
          </div>
        )}

        {m && (
          <div className="flex items-center gap-3 text-xs flex-wrap">
            {m.openRisques > 0 && (
              <span className="flex items-center gap-0.5 text-orange">
                <AlertTriangle size={10} /> {m.openRisques} risque{m.openRisques > 1 ? 's' : ''}
              </span>
            )}
            {m.openActions > 0 && (
              <span className="text-subtle">📋 {m.openActions} action{m.openActions > 1 ? 's' : ''}</span>
            )}
            {m.estimatedDeliveryDate && (
              <span className="ml-auto text-subtle tabular-nums">🗓 {fmtDate(m.estimatedDeliveryDate)}</span>
            )}
          </div>
        )}

        {scope === 'trim' && m?.trimLabel && (
          <div className="text-[9px] text-subtle">
            {m.trimLabel}{m.cursorPct !== null && <span className="ml-1">· curseur {m.cursorPct}%</span>}
          </div>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-border mt-auto">
          <button onClick={onZoom}
            className="text-xs px-2 py-0.5 rounded-lg bg-purple/10 text-purple font-semibold hover:bg-purple/20 transition-colors">
            Zoom
          </button>
          <button onClick={onEnter}
            className="flex items-center gap-0.5 text-xs text-subtle hover:text-purple transition-colors font-medium">
            {isActif ? 'Actif' : 'Ouvrir'}<ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
