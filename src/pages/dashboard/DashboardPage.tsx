import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Spinner } from '@/components/ui/Spinner'
import { StatutBadge, EpicBadge, JalonBadge } from '@/components/ui/Badge'
import { useTaches } from '@/hooks/useTaches'
import { useSprintActif } from '@/hooks/useSprints'
import { useEquipes, useEquipe, useSyncEquipesTaches } from '@/hooks/useEquipes'
import { useProduits } from '@/hooks/useProduits'
import { useAuth } from '@/contexts/AuthContext'
import { useProduit } from '@/contexts/ProduitContext'
import { EPIC_LIST, EPIC_COLORS, JALON_LIST, JALON_COLORS, SPRINTS_LIST, METIERS_DEFAULT } from '@/constants'
import { epicShortName, sprintInRange } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Tache } from '@/types'
import { ChevronRight } from 'lucide-react'

type DashTab  = 'global' | 'sprint' | 'roadmap'
type DashMode = 'multi' | 'produit'

export default function DashboardPage() {
  const { data: produits = [], isLoading: loadProd } = useProduits()
  const { data: taches   = [], isLoading: loadTach } = useTaches()
  const { data: sprintActif }                        = useSprintActif()
  const { data: equipes  = [] }                      = useEquipes()
  const { data: membres  = [] }                      = useEquipe()
  const { isAdmin, getRoleForProduit }               = useAuth()
  const { produitActif, setProduitActif }            = useProduit()
  const navigate                                     = useNavigate()

  const [mode, setMode]               = useState<DashMode>('multi')
  const [tab, setTab]                 = useState<DashTab>('global')
  const [viewProduitId, setViewProduitId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number> | null>(null)

  const accessibles = produits.filter(p =>
    p.actif && !p.is_template && (isAdmin || getRoleForProduit(p.id) !== null)
  )
  const templateIds = new Set(produits.filter(p => p.is_template).map(p => p.id))

  useEffect(() => {
    if (accessibles.length > 0 && selectedIds === null)
      setSelectedIds(new Set(accessibles.map(p => p.id)))
  }, [accessibles.length])

  // Quand on passe en mode produit, préselectionner le produit actif si dispo
  useEffect(() => {
    if (mode === 'produit' && produitActif && !viewProduitId)
      setViewProduitId(produitActif.id)
  }, [mode])

  const allParents = useMemo(
    () => taches.filter(t => !t.parent_id && !templateIds.has(t.produit_id as number)),
    [taches, produits]
  )

  // Tâches parentes filtrées selon le mode
  const parents = useMemo(() => {
    if (mode === 'produit')
      return viewProduitId ? allParents.filter(t => t.produit_id === viewProduitId) : allParents
    return selectedIds === null
      ? allParents
      : allParents.filter(t => !t.produit_id || selectedIds.has(t.produit_id))
  }, [mode, viewProduitId, allParents, selectedIds])

  // Toutes les tâches (avec enfants) filtrées pour SprintView — templates toujours exclus
  const filteredTaches = useMemo(() => {
    const noTpl = taches.filter(t => !templateIds.has(t.produit_id as number))
    if (mode === 'produit')
      return viewProduitId ? noTpl.filter(t => t.produit_id === viewProduitId) : noTpl
    return selectedIds === null
      ? noTpl
      : noTpl.filter(t => !t.produit_id || selectedIds.has(t.produit_id))
  }, [mode, viewProduitId, taches, selectedIds, templateIds])

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

  function enter(p: typeof produits[0]) {
    setProduitActif({ id: p.id, nom: p.nom, couleur: p.couleur })
    navigate('/sprint')
  }

  function zoomProduit(p: typeof produits[0]) {
    setViewProduitId(p.id)
    setMode('produit')
    setTab('global')
  }

  if (loadProd || loadTach) return <Layout><Spinner /></Layout>

  const fait    = parents.filter(t => t.statut === 'Fait').length
  const encours = parents.filter(t => t.statut === 'En cours').length
  const bloque  = parents.filter(t => t.statut === 'Bloqué').length
  const pct     = parents.length ? Math.round(fait / parents.length * 100) : 0

  const viewProduit = accessibles.find(p => p.id === viewProduitId) ?? null

  return (
    <Layout title="Dashboard">

      {/* ── Barre de mode ──────────────────────────────────── */}
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

        {/* Sélecteur de produit (mode produit) */}
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
            {viewProduitId && (
              <button onClick={() => setViewProduitId(null)}
                className="px-2.5 py-1 rounded-full text-xs text-subtle hover:text-navy border border-dashed border-border transition-colors">
                Tous
              </button>
            )}
          </div>
        )}

        {/* Chips de périmètre (mode multi) */}
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

        {sprintActif && <span className="ds-pill-stat pill-wip rounded-full ml-auto">Sprint {sprintActif.numero}</span>}
      </div>

      {/* ── Bandeau produit (mode produit avec un produit sélectionné) ── */}
      {mode === 'produit' && viewProduit && (
        <div className="flex items-center gap-3 mb-5 p-3 rounded-xl border border-border bg-white">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ background: viewProduit.couleur ?? '#4A4CC8' }} />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-navy text-sm">{viewProduit.nom}</div>
            {viewProduit.description && <div className="text-xs text-subtle truncate">{viewProduit.description}</div>}
          </div>
          <div className="flex items-center gap-3 text-xs text-subtle">
            <span className="font-semibold text-navy">{parents.length} US</span>
            <span className="text-green font-semibold">{pct}% terminées</span>
          </div>
          <button onClick={() => enter(viewProduit)}
            className="ds-btn ds-btn-sm flex items-center gap-1">
            Ouvrir <ChevronRight size={11} />
          </button>
        </div>
      )}

      {/* ── KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiBox label="Total US"  value={parents.length} />
        <KpiBox label="Terminées" value={fait}    sub={`${pct}% du backlog`} color="text-green" />
        <KpiBox label="En cours"  value={encours} color="text-orange" />
        <KpiBox label="Bloquées"  value={bloque}  color="text-red" />
      </div>

      {/* ── Cartes produits (mode multi seulement) ─────────── */}
      {mode === 'multi' && (
        <div className="mb-5">
          <div className="text-sm font-semibold text-navy mb-3">
            {accessibles.length} produit{accessibles.length !== 1 ? 's' : ''} · {
              selectedIds ? selectedIds.size : accessibles.length} dans le périmètre
          </div>
          {accessibles.length === 0 ? (
            <div className="ds-card flex flex-col items-center py-12 text-subtle gap-2">
              <div className="text-3xl mb-2">📦</div>
              <p className="text-sm">Aucun produit accessible</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {accessibles.map(p => {
                const isActif   = produitActif?.id === p.id
                const pTaches   = allParents.filter(t => t.produit_id === p.id)
                const pFait     = pTaches.filter(t => t.statut === 'Fait').length
                const pPct      = pTaches.length ? Math.round(pFait / pTaches.length * 100) : 0
                const isInScope = selectedIds === null || selectedIds.has(p.id)
                return (
                  <div key={p.id}
                    className={cn(
                      'group bg-white rounded-2xl border shadow-sm overflow-hidden transition-all',
                      isActif ? 'border-purple ring-2 ring-purple/20' : 'border-border',
                      !isInScope && 'opacity-40'
                    )}>
                    <div className="h-1.5" style={{ background: p.couleur ?? '#4A4CC8' }} />
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-navy text-sm truncate">{p.nom}</div>
                          {p.description && <div className="text-xs text-subtle mt-0.5 line-clamp-1">{p.description}</div>}
                        </div>
                        <span className="text-xs font-semibold text-subtle ml-2 shrink-0">{roleLabel(p.id)}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pPct}%`, background: p.couleur ?? '#4A4CC8' }} />
                        </div>
                        <span className="text-xs font-semibold text-navy shrink-0">{pPct}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-subtle">{pFait}/{pTaches.length} US terminées</span>
                        <div className="flex gap-1.5">
                          <button onClick={() => zoomProduit(p)}
                            className="text-xs px-2 py-0.5 rounded-lg bg-purple/10 text-purple font-semibold hover:bg-purple/20 transition-colors">
                            Zoom
                          </button>
                          <button onClick={() => enter(p)}
                            className="flex items-center gap-0.5 text-xs text-subtle hover:text-purple transition-colors font-medium">
                            {isActif ? 'Actif' : 'Ouvrir'}<ChevronRight size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Onglets stats ───────────────────────────────────── */}
      <div className="page-topbar -mx-3 px-3 md:-mx-5 md:px-5 mb-4">
        <div className="flex gap-0.5 bg-bg border border-border rounded-lg p-0.5">
          {(['global','sprint','roadmap'] as DashTab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('px-4 py-1.5 rounded-md text-xs font-semibold transition-all',
                tab === t ? 'bg-white shadow-sm text-navy' : 'text-subtle hover:text-navy')}>
              {t === 'global' ? '🌐 Vue Globale' : t === 'sprint' ? '⚡ Sprint en cours' : '🗺️ Roadmap'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'global'  && <GlobalView  taches={parents} allParents={allParents} produits={accessibles} selectedIds={selectedIds} mode={mode} equipes={equipes} membres={membres} metiers={METIERS_DEFAULT} />}
      {tab === 'sprint'  && <SprintView  taches={filteredTaches} sprintActif={sprintActif?.numero ?? null} />}
      {tab === 'roadmap' && <RoadmapView taches={parents}        sprintActif={sprintActif?.numero ?? null} />}
    </Layout>
  )
}


function KpiBox({label,value,sub,color='text-navy'}:{label:string;value:string|number;sub?:string;color?:string}) {
  return (
    <div className="ds-card flex flex-col gap-1">
      <span className="text-xs text-subtle">{label}</span>
      <span className={cn('text-3xl font-bold',color)}>{value}</span>
      {sub&&<span className="text-xs text-subtle">{sub}</span>}
    </div>
  )
}

function ProgressRow({label,color,done,total,effort}:{label:string;color:string;done:number;total:number;effort?:number}) {
  const pct = total ? Math.round(done/total*100) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="w-2 h-2 rounded-sm shrink-0" style={{background:color}}/>
      <span className="text-xs text-navy flex-1 truncate">{label}</span>
      <div className="w-24 h-1.5 bg-border rounded-full overflow-hidden shrink-0">
        <div className="h-full rounded-full" style={{width:`${pct}%`,background:color}}/>
      </div>
      <span className="text-xs font-semibold text-navy w-8 text-right">{pct}%</span>
      <span className="text-xs text-subtle w-14 text-right">{done}/{total} US{effort!=null?` · ${effort}j`:''}</span>
    </div>
  )
}

import type { Produit } from '@/hooks/useProduits'
import type { Equipe, MembreEquipe } from '@/types'

function GlobalView({taches,allParents,produits,selectedIds,mode,equipes,membres,metiers}:{
  taches:Tache[];allParents:Tache[];produits:Produit[];selectedIds:Set<number>|null
  mode:DashMode;equipes:Equipe[];membres:MembreEquipe[];metiers:string[]
}) {
  const syncEquipes = useSyncEquipesTaches()
  const T=taches
  const fait=T.filter(t=>t.statut==='Fait').length
  const encours=T.filter(t=>t.statut==='En cours').length
  const bloque=T.filter(t=>t.statut==='Bloqué').length
  const pct=T.length?Math.round(fait/T.length*100):0

  const metiersList=Array.from(new Set([...metiers,...T.map(t=>t.metier??'').filter(Boolean)])).filter(Boolean).sort()

  // Par Équipe → membres : assigne_a → trigramme → membre → equipe
  const equipeRows = equipes.filter(e=>e.actif).map(eq=>{
    const eqMembres = membres.filter(m=>m.equipe_id===eq.id&&m.actif)
    const eqT = T.filter(t=>t.assigne_a&&eqMembres.some(m=>m.trigramme===t.assigne_a))
    const membreRows = eqMembres
      .map(m=>({ m, taches: T.filter(t=>t.assigne_a===m.trigramme) }))
      .filter(r=>r.taches.length>0)
    return { eq, taches: eqT, membreRows }
  }).filter(r=>r.taches.length>0)

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiBox label="Total US"  value={T.length}/>
        <KpiBox label="Terminées" value={fait} sub={`${pct}% du backlog`} color="text-green"/>
        <KpiBox label="En cours"  value={encours} color="text-orange"/>
        <KpiBox label="Bloquées"  value={bloque} color="text-red"/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Mode multi : Par Produit à la place de Epic/Jalon */}
        {mode==='multi' && (
          <div className="ds-card lg:col-span-2">
            <div className="ds-card-title">Par Produit</div>
            <div className="flex flex-col gap-3">
              {produits.map(p=>{
                const pt=allParents.filter(t=>t.produit_id===p.id)
                if(!pt.length) return null
                const done=pt.filter(t=>t.statut==='Fait').length
                const enc=pt.filter(t=>t.statut==='En cours').length
                const blq=pt.filter(t=>t.statut==='Bloqué').length
                const eff=pt.reduce((s,t)=>s+(t.effort_j??0),0)
                const inScope=selectedIds===null||selectedIds.has(p.id)
                return (
                  <div key={p.id} className={cn('flex items-center gap-4',!inScope&&'opacity-40')}>
                    <div className="flex items-center gap-2 w-40 shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:p.couleur??'#4A4CC8'}}/>
                      <span className="text-xs font-semibold text-navy truncate">{p.nom}</span>
                    </div>
                    <div className="flex-1">
                      <div className="h-2 bg-border rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{width:`${pt.length?Math.round(done/pt.length*100):0}%`,background:p.couleur??'#4A4CC8'}}/>
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-subtle">
                        <span className="text-green">✓ {done}</span>
                        {enc>0&&<span className="text-orange">▶ {enc}</span>}
                        {blq>0&&<span className="text-red">⚠ {blq}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-bold text-navy">{pt.length?Math.round(done/pt.length*100):0}%</div>
                      <div className="text-xs text-subtle">{pt.length} US · {eff}j</div>
                    </div>
                  </div>
                )
              }).filter(Boolean)}
            </div>
          </div>
        )}

        {/* Mode produit : Par Epic et Par Jalon */}
        {mode==='produit' && (<>
          <div className="ds-card">
            <div className="ds-card-title">Par Epic</div>
            <div className="flex flex-col gap-2.5">
              {EPIC_LIST.map(epic=>{
                const all=T.filter(t=>t.epic===epic); if(!all.length) return null
                const done=all.filter(t=>t.statut==='Fait').length
                const eff=all.reduce((s,t)=>s+(t.effort_j??0),0)
                return <ProgressRow key={epic} label={epicShortName(epic)} color={EPIC_COLORS[epic]??'#4A4CC8'} done={done} total={all.length} effort={eff}/>
              }).filter(Boolean)}
              {!EPIC_LIST.some(e=>T.some(t=>t.epic===e))&&<p className="text-subtle text-xs">Aucun epic assigné.</p>}
            </div>
          </div>
          <div className="ds-card">
            <div className="ds-card-title">Par Jalon</div>
            <div className="flex flex-col gap-3">
              {JALON_LIST.map(jalon=>{
                const all=T.filter(t=>t.jalon===jalon); if(!all.length) return null
                const done=all.filter(t=>t.statut==='Fait').length
                const enc=all.filter(t=>t.statut==='En cours').length
                const blq=all.filter(t=>t.statut==='Bloqué').length
                const p=Math.round(done/all.length*100),color=JALON_COLORS[jalon]??'#4A4CC8'
                const eff=all.reduce((s,t)=>s+(t.effort_j??0),0)
                return (
                  <div key={jalon} className="flex items-center gap-4">
                    <JalonBadge value={jalon} className="shrink-0"/>
                    <div className="flex-1">
                      <div className="h-2 bg-border rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{width:`${p}%`,background:color}}/>
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-subtle">
                        <span className="text-green">✓ {done}</span>
                        {enc>0&&<span className="text-orange">▶ {enc}</span>}
                        {blq>0&&<span className="text-red">⚠ {blq}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-bold text-navy">{p}%</div>
                      <div className="text-xs text-subtle">{all.length} US · {eff}j</div>
                    </div>
                  </div>
                )
              }).filter(Boolean)}
              {!JALON_LIST.some(j=>T.some(t=>t.jalon===j))&&<p className="text-subtle text-xs">Aucun jalon assigné.</p>}
            </div>
          </div>
        </>)}

        {/* Par Équipe → membres */}
        <div className="ds-card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="ds-card-title mb-0">Par Équipe &amp; Membres</div>
            <button
              onClick={()=>syncEquipes.mutate()}
              disabled={syncEquipes.isPending}
              title="Synchronise tache.equipe depuis assigne_a → membre → équipe"
              className="text-xs px-2.5 py-1 rounded-lg bg-purple/10 text-purple font-semibold hover:bg-purple/20 transition-colors disabled:opacity-50">
              {syncEquipes.isPending ? '...' : '⟳ Sync équipes'}
            </button>
          </div>
          {equipeRows.length===0
            ? <p className="text-subtle text-xs">Aucune US assignée à un membre d'équipe. Cliquez "Sync équipes" pour assigner automatiquement depuis le champ "Assigné à".</p>
            : <div className="flex flex-col gap-5">
              {equipeRows.map(({eq,taches:eqT,membreRows})=>{
                const done=eqT.filter(t=>t.statut==='Fait').length
                const enc=eqT.filter(t=>t.statut==='En cours').length
                const blq=eqT.filter(t=>t.statut==='Bloqué').length
                const eff=eqT.reduce((s,t)=>s+(t.effort_j??0),0)
                const pct=eqT.length?Math.round(done/eqT.length*100):0
                const color=eq.couleur??'#4A4CC8'
                return (
                  <div key={eq.id}>
                    {/* Ligne équipe */}
                    <div className="flex items-center gap-3 mb-2">
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{background:color}}/>
                      <span className="text-sm font-bold text-navy flex-1">{eq.nom}</span>
                      <div className="flex gap-3 text-xs text-subtle">
                        <span className="text-green font-medium">✓ {done}</span>
                        {enc>0&&<span className="text-orange font-medium">▶ {enc}</span>}
                        {blq>0&&<span className="text-red font-medium">⚠ {blq}</span>}
                      </div>
                      <div className="w-28 h-2 bg-border rounded-full overflow-hidden shrink-0">
                        <div className="h-full rounded-full" style={{width:`${pct}%`,background:color}}/>
                      </div>
                      <span className="text-sm font-bold text-navy w-10 text-right">{pct}%</span>
                      <span className="text-xs text-subtle w-16 text-right">{eqT.length} US · {eff}j</span>
                    </div>
                    {/* Lignes membres */}
                    <div className="flex flex-col gap-1.5 pl-6 border-l-2 ml-1.5" style={{borderColor:color+'40'}}>
                      {membreRows.map(({m,taches:mT})=>{
                        const mDone=mT.filter(t=>t.statut==='Fait').length
                        const mEnc=mT.filter(t=>t.statut==='En cours').length
                        const mBlq=mT.filter(t=>t.statut==='Bloqué').length
                        const mEff=mT.reduce((s,t)=>s+(t.effort_j??0),0)
                        const mPct=mT.length?Math.round(mDone/mT.length*100):0
                        return (
                          <div key={m.id} className="flex items-center gap-3">
                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                              style={{background:m.couleur??color}}>
                              {m.trigramme.slice(0,2)}
                            </div>
                            <span className="text-xs text-navy flex-1 truncate">
                              {m.prenom} {m.nom}
                              <span className="text-subtle ml-1">({m.trigramme})</span>
                            </span>
                            <div className="flex gap-2 text-xs text-subtle">
                              <span className="text-green">✓{mDone}</span>
                              {mEnc>0&&<span className="text-orange">▶{mEnc}</span>}
                              {mBlq>0&&<span className="text-red">⚠{mBlq}</span>}
                            </div>
                            <div className="w-20 h-1.5 bg-border rounded-full overflow-hidden shrink-0">
                              <div className="h-full rounded-full" style={{width:`${mPct}%`,background:m.couleur??color}}/>
                            </div>
                            <span className="text-xs font-semibold text-navy w-8 text-right">{mPct}%</span>
                            <span className="text-xs text-subtle w-14 text-right">{mT.length} US · {mEff}j</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          }
        </div>

        {/* Par Thème */}
        <div className="ds-card">
          <div className="ds-card-title">Par Thème</div>
          {!metiersList.length?<p className="text-subtle text-xs">Aucun thème assigné aux US.</p>:
          <div className="flex flex-col gap-2.5">
            {metiersList.map((met,i)=>{
              const all=T.filter(t=>t.metier===met); if(!all.length) return null
              const done=all.filter(t=>t.statut==='Fait').length
              const eff=all.reduce((s,t)=>s+(t.effort_j??0),0)
              const COLORS=['#5B21B6','#065F46','#92600A','#991B1B','#1E40AF']
              return <ProgressRow key={met} label={met} color={COLORS[i%COLORS.length]} done={done} total={all.length} effort={eff}/>
            }).filter(Boolean)}
          </div>}
        </div>
      </div>
    </div>
  )
}

function SprintView({taches,sprintActif}:{taches:Tache[];sprintActif:string|null}) {
  const childMap:Record<string,Tache[]>={}
  taches.filter(t=>t.parent_id).forEach(c=>{if(!childMap[c.parent_id!]) childMap[c.parent_id!]=[]; childMap[c.parent_id!].push(c)})
  const spTaches=taches.filter(t=>!t.parent_id&&sprintActif&&sprintInRange(t.sprint??'',t.sprint_debut,t.sprint_fin,sprintActif))
  const fait=spTaches.filter(t=>t.statut==='Fait').length
  const encours=spTaches.filter(t=>t.statut==='En cours').length
  const effort=spTaches.reduce((s,t)=>s+(t.effort_j??0),0)
  const pct=spTaches.length?Math.round(fait/spTaches.length*100):0
  if(!sprintActif) return (
    <div className="ds-card flex flex-col items-center py-16 text-subtle gap-2">
      <p className="text-sm font-medium">Aucun sprint en cours</p>
      <p className="text-xs">Démarrez un sprint dans Setup → Sprints</p>
    </div>
  )
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiBox label="US sprint" value={spTaches.length} sub={`Sprint ${sprintActif}`}/>
        <KpiBox label="Terminées" value={fait} sub={`${pct}%`} color="text-green"/>
        <KpiBox label="En cours"  value={encours} color="text-orange"/>
        <KpiBox label="Effort"    value={`${effort}j`} color="text-blue"/>
      </div>
      <div className="ds-card overflow-x-auto">
        <div className="ds-card-title">US du sprint {sprintActif}</div>
        <table className="ds-table">
          <thead><tr>{['ID','Titre','Epic','Jalon','Statut','Effort','Assigné'].map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {spTaches.map(t=>{
              const subs=childMap[t.id_tache]??[]
              return (
                <tr key={t.id_tache}>
                  <td className="font-semibold text-purple">{t.id_tache}</td>
                  <td className="max-w-xs">
                    <div className="truncate font-medium">{t.titre}</div>
                    {subs.length>0&&<span className="text-xs bg-purple/10 text-purple px-1.5 rounded font-semibold">{subs.filter(s=>s.statut==='Fait').length}/{subs.length}</span>}
                  </td>
                  <td><EpicBadge value={t.epic??''}/></td>
                  <td>{t.jalon?<JalonBadge value={t.jalon}/>:'—'}</td>
                  <td><StatutBadge value={t.statut}/></td>
                  <td className="text-center text-blue font-semibold">{t.effort_j??0}j</td>
                  <td className="text-subtle">{t.assigne_a||'—'}</td>
                </tr>
              )
            })}
            {!spTaches.length&&<tr><td colSpan={7} className="py-8 text-center text-subtle">Aucune US dans ce sprint.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RoadmapView({taches,sprintActif}:{taches:Tache[];sprintActif:string|null}) {
  const [colorBy,setColorBy]=useState<'epic'|'jalon'|'statut'>('epic')
  const [filterEpic,setFilterEpic]=useState('')
  const [sprintRange,setSprintRange]=useState(16)
  const T=taches.filter(t=>!filterEpic||t.epic===filterEpic)
  const sprints=SPRINTS_LIST.slice(0,sprintRange)
  const STATUT_COLORS:Record<string,string>={'À faire':'#CBD5E1','En cours':'#F0A500','Fait':'#00C896','Bloqué':'#EF4444'}
  const getColor=(t:Tache)=>{
    if(colorBy==='epic') return EPIC_COLORS[t.epic??'']??'#4A4CC8'
    if(colorBy==='jalon') return JALON_COLORS[t.jalon??'']??'#4A4CC8'
    return STATUT_COLORS[t.statut]??'#CBD5E1'
  }
  const groupKey=colorBy==='epic'?'epic':colorBy==='jalon'?'jalon':'statut'
  const groups=Array.from(new Set(T.map(t=>(t as unknown as Record<string,unknown>)[groupKey] as string))).filter(Boolean).sort()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-subtle">Couleur</span>
          <select value={colorBy} onChange={e=>setColorBy(e.target.value as typeof colorBy)} className="ds-select w-32 text-xs py-1.5">
            <option value="epic">Epic</option><option value="jalon">Jalon</option><option value="statut">Statut</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-subtle">Epic</span>
          <select value={filterEpic} onChange={e=>setFilterEpic(e.target.value)} className="ds-select w-52 text-xs py-1.5">
            <option value="">Tous</option>{EPIC_LIST.map(e=><option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-subtle">Sprints</span>
          <select value={sprintRange} onChange={e=>setSprintRange(+e.target.value)} className="ds-select w-20 text-xs py-1.5">
            <option value={8}>8</option><option value={12}>12</option><option value={16}>16</option>
          </select>
        </div>
      </div>
      <div className="ds-card overflow-x-auto">
        <div style={{minWidth:`${sprints.length*56+200}px`}}>
          <div className="flex border-b border-border mb-1">
            <div className="w-44 shrink-0 text-xs font-semibold text-subtle py-2 px-3">Groupe</div>
            {sprints.map(s=>(
              <div key={s} className={cn('flex-1 text-center text-xs py-2 font-semibold',s===sprintActif?'text-purple bg-purple/5 rounded-t':'text-subtle')}>{s}</div>
            ))}
          </div>
          {!groups.length&&<div className="py-8 text-center text-subtle text-sm">Aucune donnée.</div>}
          {groups.map(grp=>{
            const grpTaches=T.filter(t=>(t as unknown as Record<string,unknown>)[groupKey]===grp)
            const color=getColor(grpTaches[0])
            return (
              <div key={grp} className="flex items-start border-b border-border/40 py-1.5 gap-0.5">
                <div className="w-44 shrink-0 px-3">
                  <span className="text-xs font-semibold" style={{color}}>{groupKey==='epic'?epicShortName(grp):grp}</span>
                  <div className="text-xs text-subtle">{grpTaches.length} US</div>
                </div>
                {sprints.map(s=>{
                  const inCell=grpTaches.filter(t=>sprintInRange(t.sprint??'',t.sprint_debut,t.sprint_fin,s))
                  return (
                    <div key={s} className={cn('flex-1 min-h-[24px] rounded mx-0.5',s===sprintActif&&'ring-1 ring-purple/20')}
                      style={inCell.length?{background:color+'25',borderLeft:`2px solid ${color}`}:{}}>
                      {inCell.length>0&&<div className="text-center text-xs font-semibold py-1" style={{color}}>{inCell.length}</div>}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
