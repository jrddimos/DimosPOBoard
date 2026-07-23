import { useState, useMemo, useEffect, useCallback, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Spinner } from '@/components/ui/Spinner'
import { useAllTaches } from '@/hooks/useTaches'
import { useProduits, useRequestProduitAccess } from '@/hooks/useProduits'
import { useFinanceConfig } from '@/hooks/useFinanceConfig'
import { useAllFaitTransitions } from '@/hooks/useActivityLog'
import { useAuth } from '@/contexts/AuthContext'
import { useProduit } from '@/contexts/ProduitContext'
import { useToast } from '@/hooks/useToast'
import { cn, buildTacheIndex, buildChildMap, isUS } from '@/lib/utils'
import {
  LayoutGrid, Package, LayoutDashboard,
} from 'lucide-react'
import { PageTitle } from '@/components/ui/PageTitle'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { ProduitDashboardBody } from '@/pages/produit-dashboard/ProduitDashboardBody'

// Le cockpit embarque react-grid-layout + framer-motion : chargé à la demande
const CockpitView        = lazy(() => import('@/pages/dashboard/cockpit/CockpitView'))
import { computeProduitMetrics } from '@/utils/produitMetrics'
import type { MultiScope, ProduitMetrics } from '@/utils/produitMetrics'
import type { Produit } from '@/hooks/useProduits'
import type { Tache } from '@/types'

type DashMode = 'multi' | 'produit'

export default function DashboardPage() {
  const { data: produits = [], isLoading: loadProd } = useProduits()
  const { data: taches   = [], isLoading: loadTach } = useAllTaches()
  const { data: finConfig }                          = useFinanceConfig()
  // Fenêtre large (~1 trimestre) : couvre le trimestre en cours de n'importe
  // quel produit sans avoir à connaître sa date de début à l'avance.
  const sinceBurnup = useMemo(() => new Date(Date.now() - 100 * 86400000).toISOString(), [])
  const { data: faitTransitions = [] } = useAllFaitTransitions(sinceBurnup)
  const { isAdmin, getRoleForProduit }               = useAuth()
  const { produitActif, setProduitActif }            = useProduit()
  const navigate                                     = useNavigate()

  const [mode, setMode]               = useState<DashMode>('multi')
  const [scope, setScope]             = useState<MultiScope>('trim')
  const [viewProduitId, setViewProduitId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number> | null>(null)

  const today   = useMemo(() => new Date(), [])
  const fmtDate = useCallback((d: Date) => d.toLocaleDateString('fr-FR'), [])

  const accessibles = produits.filter(p =>
    p.actif && !p.is_template && (isAdmin || getRoleForProduit(p.id) !== null)
  )
  const templateIds = new Set(produits.filter(p => p.is_template).map(p => p.id))

  // Initialisation une seule fois (tant que selectedIds est encore null) —
  // `accessibles` est un tableau recréé à chaque rendu (filter() non
  // mémoïsé), donc suivre `.length` plutôt que le tableau lui-même évite de
  // re-déclencher l'effet à chaque rendu ; `selectedIds` est volontairement
  // absent pour ne pas re-exécuter inutilement une fois qu'il est posé.
  useEffect(() => {
    if (accessibles.length > 0 && selectedIds === null)
      setSelectedIds(new Set(accessibles.map(p => p.id)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessibles.length])

  // Ne se déclenche qu'au changement d'ONGLET (mode), pas à chaque fois que
  // produitActif change ailleurs — sinon ça écraserait la sélection produit
  // manuelle de l'utilisateur dans le sélecteur du dashboard.
  useEffect(() => {
    if (mode === 'produit' && produitActif && !viewProduitId)
      setViewProduitId(produitActif.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // `id_tache` n'est unique qu'AU SEIN d'un produit (UNIQUE(produit_id,
  // id_tache)) — construire un index (buildTacheIndex) ou un childMap
  // (buildChildMap) sur TOUTES les tâches tous produits confondus expose à
  // des collisions dès que deux produits partagent un même id_tache (quasi
  // garanti : "US-001" existe généralement dans chaque produit). Ça classait
  // à tort des US comme sous-tâches (ou l'inverse) et mélangeait les
  // sous-tâches d'un produit dans le childMap d'un autre — faussant
  // silencieusement les comptages et l'effort du Dashboard portefeuille. On
  // regroupe donc par produit AVANT d'indexer.
  const tachesByProduit = useMemo(() => {
    const m = new Map<number, Tache[]>()
    taches.forEach(t => {
      const pid = t.produit_id as number
      if (!m.has(pid)) m.set(pid, [])
      m.get(pid)!.push(t)
    })
    return m
  }, [taches])

  const allParents = useMemo(() => {
    const out: Tache[] = []
    tachesByProduit.forEach((group, pid) => {
      if (templateIds.has(pid)) return
      const localById = buildTacheIndex(group)
      group.forEach(t => { if (isUS(t, localById)) out.push(t) })
    })
    return out
  // templateIds dérive de `produits` (déjà en dépendance) mais est recréé
  // chaque rendu (Set non mémoïsé) — le lister défairait la mémoïsation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tachesByProduit, produits])

  // childMap sur TOUTES les tâches d'UN produit (pas les seules racines) :
  // l'effort d'une US = effort propre + somme de ses sous-tâches (cf.
  // effortEffectif/0057) — gardé par produit (cf. note ci-dessus).
  const childMapByProduit = useMemo(() => {
    const m = new Map<number, Record<string, Tache[]>>()
    tachesByProduit.forEach((group, pid) => m.set(pid, buildChildMap(group)))
    return m
  }, [tachesByProduit])
  const metricsMap = useMemo(() => {
    const map = new Map<number, ProduitMetrics>()
    accessibles.forEach(p => {
      map.set(p.id, computeProduitMetrics(p, allParents.filter((t: Tache) => t.produit_id === p.id), finConfig, today, childMapByProduit.get(p.id) ?? {}))
    })
    return map
  }, [accessibles, allParents, finConfig, today, childMapByProduit])

  // Date la plus ancienne à laquelle chaque US est passée à "Fait" (clé "produit_id:id_tache").
  const faitDoneMap = useMemo(() => {
    const map = new Map<string, string>()
    faitTransitions.forEach(f => {
      const key = `${f.produit_id}:${f.target}`
      if (!map.has(key)) map.set(key, f.created_at)
    })
    return map
  }, [faitTransitions])

  function toggleProduit(id: number) {
    setSelectedIds(prev => {
      const base = prev ?? new Set(accessibles.map(p => p.id))
      const next = new Set(base)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const goToProductDashboard = useCallback((p: Produit) => {
    setProduitActif({ id: p.id, nom: p.nom, couleur: p.couleur })
    navigate('/produit-dashboard')
  }, [setProduitActif, navigate])

  const viewProduit = accessibles.find(p => p.id === viewProduitId) ?? null

  if (loadProd || loadTach) return <Layout><Spinner /></Layout>

  if (accessibles.length === 0) {
    return (
      <Layout>
        <NoAccessScreen produits={produits.filter(p => p.actif && !p.is_template)} />
      </Layout>
    )
  }

  return (
    <Layout>

      {/* ── Topbar ──────────────────────────────────────────── */}
      <div className="page-topbar -mx-3 -mt-3 mb-5 px-3 md:-mx-5 md:-mt-5 md:px-5 gap-y-2">
        <PageTitle icon={<LayoutDashboard size={15}/>} label="Dashboard" />

        {/* Toggle mode */}
        <ToggleGroup value={mode} onChange={setMode} options={[
          { key: 'multi',   label: 'Multi-produits', icon: <LayoutGrid size={13}/> },
          { key: 'produit', label: 'Par produit',     icon: <Package size={13}/> },
        ]} />


        {/* Sélecteur produit (mode par produit) */}
        {mode === 'produit' && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {accessibles.map(p => (
              <button key={p.id} onClick={() => setViewProduitId(p.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border',
                  viewProduitId === p.id ? 'text-white border-transparent' : 'bg-card text-subtle border-border hover:border-navy/30'
                )}
                style={viewProduitId === p.id ? { background: p.couleur ?? '#4A4CC8' } : {}}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />
                {p.nom}
              </button>
            ))}
          </div>
        )}

        {/* Le périmètre et le scope vivent dans la rangée de contrôles du
            cockpit (mode multi) pour ne garder qu'une seule barre d'outils. */}
      </div>

      {/* ══ MODE MULTI-PRODUITS ══════════════════════════════════ */}
      {mode === 'multi' && (
        <>
          {accessibles.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl flex flex-col items-center py-16 text-subtle gap-3 shadow-sm">
              <Package size={32} className="opacity-20" />
              <p className="text-sm font-medium">Aucun produit accessible</p>
            </div>
          ) : (
            <Suspense fallback={<div className="flex justify-center py-16"><Spinner /></div>}>
              <CockpitView
                produits={accessibles.filter(p => selectedIds === null || selectedIds.has(p.id))}
                metricsMap={metricsMap}
                scope={scope}
                setScope={setScope}
                accessibles={accessibles}
                selectedIds={selectedIds}
                toggleProduit={toggleProduit}
                selectAll={() => setSelectedIds(new Set(accessibles.map(p => p.id)))}
                allTaches={allParents}
                childMapByProduit={childMapByProduit}
                faitDoneMap={faitDoneMap}
                navigate={navigate}
                openProduct={goToProductDashboard}
                fmtDate={fmtDate}
              />
            </Suspense>
          )}
        </>
      )}

      {/* ══ MODE PAR PRODUIT ════════════════════════════════════ */}
      {mode === 'produit' && (
        viewProduit
          // key=produit.id : force un remount au changement de produit, sinon
          // les préférences persistées par produit (scopeView, objectifMode,
          // burndownIncludeSubs — lues une seule fois via useState lazy init)
          // resteraient celles du produit précédent tant que la page n'est
          // pas rechargée.
          ? <ProduitDashboardBody key={viewProduit.id} produit={viewProduit} />
          : <div className="bg-card border border-border rounded-2xl flex flex-col items-center py-16 text-subtle gap-3 shadow-sm">
              <Package size={32} className="opacity-20" />
              <p className="text-sm font-medium">Sélectionner un produit ci-dessus</p>
            </div>
      )}
    </Layout>
  )
}

// ── Écran d'accueil : compte sans accès produit ──────────────────
function NoAccessScreen({ produits }: { produits: Produit[] }) {
  const requestAccess = useRequestProduitAccess()
  const toast = useToast()
  const [sent, setSent] = useState<Set<number>>(new Set())

  async function ask(p: Produit) {
    try {
      await requestAccess.mutateAsync({ produitId: p.id })
      setSent(prev => new Set(prev).add(p.id))
      toast(`Demande envoyée pour ${p.nom}`)
    } catch {
      toast("Impossible d'envoyer la demande", 'error')
    }
  }

  return (
    <div className="flex flex-col items-center py-16 px-4 gap-6 max-w-lg mx-auto text-center">
      <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
        <Package size={24} className="text-indigo-400" />
      </div>
      <div>
        <h1 className="text-lg font-bold text-navy mb-1.5">Bienvenue sur Dimos Inside</h1>
        <p className="text-sm text-subtle leading-relaxed">
          Votre compte n'a pour l'instant accès à aucun produit. Choisissez un produit ci-dessous
          pour demander l'accès à son·sa PO — vous recevrez une notification une fois le rôle attribué.
        </p>
      </div>
      {produits.length === 0 ? (
        <p className="text-sm text-subtle italic">Aucun produit actif pour le moment.</p>
      ) : (
        <div className="w-full flex flex-col gap-2">
          {produits.map(p => {
            const isSent = sent.has(p.id)
            return (
              <div key={p.id} className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 shadow-sm">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />
                <span className="text-sm font-semibold text-navy flex-1 text-left truncate">{p.nom}</span>
                <button
                  onClick={() => ask(p)}
                  disabled={isSent || requestAccess.isPending}
                  className={cn(
                    'text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shrink-0',
                    isSent
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      : 'bg-indigo-500 text-white hover:bg-indigo-400'
                  )}>
                  {isSent ? '✓ Demande envoyée' : "Demander l'accès"}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
