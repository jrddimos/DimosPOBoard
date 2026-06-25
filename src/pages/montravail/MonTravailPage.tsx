import { useState, useMemo, useEffect } from 'react'
import { Layout } from '@/components/layout/Layout'
import { Spinner } from '@/components/ui/Spinner'
import { StatutBadge, EpicBadge, JalonBadge } from '@/components/ui/Badge'
import { useTaches, useUpdateTache } from '@/hooks/useTaches'
import { useSprintActif } from '@/hooks/useSprints'
import { useUtilisateurs } from '@/hooks/useEquipes'
import { useProduits } from '@/hooks/useProduits'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/useToast'
import { sprintInRange } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { User, ChevronDown, ChevronRight, UserPlus, X, SlidersHorizontal } from 'lucide-react'
import type { Tache, Statut } from '@/types'

export default function MonTravailPage() {
  const { data: taches  = [], isLoading: loadTach } = useTaches()
  const { data: sprintActif }                       = useSprintActif()
  const { data: membres = [] }                      = useUtilisateurs()
  const { data: produits = [] }                     = useProduits()
  const { user, isAdmin, getRoleForProduit }         = useAuth()
  const updateTache = useUpdateTache()
  const toast       = useToast()

  // Trigramme du membre lié au compte connecté (auto-détection après chargement)
  const monMembre = membres.find(m => m.user_id === user?.id && m.trigramme)

  const [selMembre, setSelMembre] = useState('')
  useEffect(() => {
    if (monMembre?.trigramme && !selMembre) setSelMembre(monMembre.trigramme)
  }, [monMembre?.trigramme])
  const [expanded,      setExpanded]      = useState<Set<string>>(new Set())
  const [filterProduit,  setFilterProduit]  = useState<number | null>(null)
  const [filterEquipe,   setFilterEquipe]   = useState('')
  const [filterMetier,   setFilterMetier]   = useState('')
  const [showFilters,    setShowFilters]    = useState(false)

  const membres_actifs = membres.filter(m => m.actif)

  // Produits accessibles pour le filtre
  const produitsAccessibles = produits.filter(p =>
    p.actif && (isAdmin || getRoleForProduit(p.id) !== null)
  )

  const childMap = useMemo(() => {
    const map: Record<string, Tache[]> = {}
    taches.filter(t => t.parent_id).forEach(c => {
      if (!map[c.parent_id!]) map[c.parent_id!] = []
      map[c.parent_id!].push(c)
    })
    return map
  }, [taches])

  // ── Mes tâches assignées ──────────────────────────────────────
  const myTaches = useMemo(() => {
    if (!selMembre) return []
    return taches.filter(t =>
      !t.parent_id &&
      t.assigne_a?.split(/[,;\s]+/).map(s => s.trim()).includes(selMembre)
    )
  }, [taches, selMembre])

  const mySubTaches = useMemo(() => {
    if (!selMembre) return []
    return taches.filter(t =>
      t.parent_id &&
      t.assigne_a?.split(/[,;\s]+/).map(s => s.trim()).includes(selMembre)
    )
  }, [taches, selMembre])

  const sprintTaches  = myTaches.filter(t =>
    sprintActif && sprintInRange(t.sprint ?? '', t.sprint_debut, t.sprint_fin, sprintActif.numero)
  )
  const backlogTaches = myTaches.filter(t =>
    !sprintActif || !sprintInRange(t.sprint ?? '', t.sprint_debut, t.sprint_fin, sprintActif.numero)
  )

  // ── Tâches sprint non assignées (tous produits accessibles) ───
  // Valeurs distinctes pour les filtres équipe/métier (dans sprint en cours)
  const sprintEquipes = useMemo(() => {
    if (!sprintActif) return []
    return Array.from(new Set(
      taches
        .filter(t => !t.parent_id && sprintInRange(t.sprint ?? '', t.sprint_debut, t.sprint_fin, sprintActif.numero) && t.equipe)
        .map(t => t.equipe!)
    )).sort()
  }, [taches, sprintActif])

  const sprintMetiers = useMemo(() => {
    if (!sprintActif) return []
    return Array.from(new Set(
      taches
        .filter(t => !t.parent_id && sprintInRange(t.sprint ?? '', t.sprint_debut, t.sprint_fin, sprintActif.numero) && t.metier)
        .map(t => t.metier!)
    )).sort()
  }, [taches, sprintActif])

  const unassignedTaches = useMemo(() => {
    if (!sprintActif) return []
    return taches.filter(t =>
      !t.parent_id &&
      !t.assigne_a &&
      t.statut !== 'Fait' &&
      sprintInRange(t.sprint ?? '', t.sprint_debut, t.sprint_fin, sprintActif.numero) &&
      (filterEquipe ? t.equipe === filterEquipe : true) &&
      (filterMetier ? t.metier === filterMetier : true)
      // filterProduit sera activé en Phase 3 quand taches.produit_id existera
    )
  }, [taches, sprintActif, filterEquipe, filterMetier])

  // ── Actions ───────────────────────────────────────────────────
  async function changeStatut(id_tache: string, statut: Statut) {
    await updateTache.mutateAsync({ id_tache, updates: { statut } })
    toast(`${id_tache} → ${statut}`)
  }

  async function selfAssign(id_tache: string) {
    if (!selMembre) { toast('Sélectionnez d\'abord votre trigramme', 'error'); return }
    await updateTache.mutateAsync({ id_tache, updates: { assigne_a: selMembre } })
    toast(`${id_tache} assigné à ${selMembre} ✓`)
  }

  function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function clearFilters() {
    setFilterProduit(null); setFilterEquipe(''); setFilterMetier('')
  }

  const fait    = myTaches.filter(t => t.statut === 'Fait').length
  const encours = myTaches.filter(t => t.statut === 'En cours').length
  const afaire  = myTaches.filter(t => t.statut === 'À faire').length
  const bloque  = myTaches.filter(t => t.statut === 'Bloqué').length
  const hasFilters = filterProduit !== null || filterEquipe || filterMetier

  if (loadTach) return <Layout><Spinner /></Layout>

  return (
    <Layout>
      {/* Topbar */}
      <div className="page-topbar -mx-3 -mt-3 mb-3 px-3 md:-mx-5 md:-mt-5 md:mb-5 md:px-5 flex-wrap gap-y-2">
        <div className="flex items-center gap-2">
          <User size={16} className="text-subtle" />
          <h1 className="text-sm font-semibold text-navy">Mon Travail</h1>
        </div>
        <div className="flex items-center gap-2 ml-auto sm:ml-4">
          <span className="ds-label hidden sm:inline">Membre</span>
          <select value={selMembre} onChange={e => setSelMembre(e.target.value)} className="ds-select w-40 sm:w-48 text-xs py-1">
            <option value="">-- Sélectionner --</option>
            {membres_actifs.filter(m=>m.trigramme).map(m => (
              <option key={m.user_id} value={m.trigramme!}>{m.trigramme} — {m.prenom??''} {m.nom??''}</option>
            ))}
          </select>
        </div>
        {selMembre && (
          <div className="flex gap-1.5 w-full sm:w-auto">
            <span className="ds-pill-stat pill-todo rounded-full">{afaire} à faire</span>
            <span className="ds-pill-stat pill-wip rounded-full">{encours} en cours</span>
            <span className="ds-pill-stat pill-done rounded-full">{fait} terminé</span>
            {bloque > 0 && <span className="ds-pill-stat pill-block rounded-full">{bloque} bloqué</span>}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6">

        {/* ── Section 1 : Mes tâches assignées ── */}
        {selMembre ? (
          <div className="flex flex-col gap-3">
            <div className="ds-section-divider">
              <span>👤 Tâches de {selMembre}</span>
            </div>
            {sprintTaches.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-xs font-semibold text-subtle uppercase tracking-wide px-1">
                  ⚡ Sprint {sprintActif?.numero}
                </div>
                {sprintTaches.map(t => (
                  <TaskRow key={t.id_tache} task={t}
                    subs={childMap[t.id_tache] ?? []}
                    subsSelf={mySubTaches.filter(s => s.parent_id === t.id_tache)}
                    expanded={expanded.has(t.id_tache)}
                    onToggle={() => toggleExpand(t.id_tache)}
                    onStatut={s => changeStatut(t.id_tache, s)}
                    onSubStatut={changeStatut}
                    highlight />
                ))}
              </div>
            )}
            {backlogTaches.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                <div className="text-xs font-semibold text-subtle uppercase tracking-wide px-1">
                  📂 Autres sprints & Backlog
                </div>
                {backlogTaches.map(t => (
                  <TaskRow key={t.id_tache} task={t}
                    subs={childMap[t.id_tache] ?? []}
                    subsSelf={mySubTaches.filter(s => s.parent_id === t.id_tache)}
                    expanded={expanded.has(t.id_tache)}
                    onToggle={() => toggleExpand(t.id_tache)}
                    onStatut={s => changeStatut(t.id_tache, s)}
                    onSubStatut={changeStatut}
                    highlight={false} />
                ))}
              </div>
            )}
            {myTaches.length === 0 && mySubTaches.length === 0 && (
              <div className="ds-card flex items-center justify-center py-10 text-subtle text-sm">
                Aucune tâche assignée à {selMembre}
              </div>
            )}
          </div>
        ) : (
          <div className="ds-card flex flex-col items-center py-10 text-subtle gap-2">
            <User size={36} className="opacity-20" />
            <p className="text-sm font-medium">Sélectionnez votre trigramme</p>
            <p className="text-xs">Vous verrez vos tâches assignées ici</p>
          </div>
        )}

        {/* ── Section 2 : Tâches disponibles non assignées ── */}
        {sprintActif && (
          <div className="flex flex-col gap-3">
            <div className="ds-section-divider">
              <span>🎯 Disponibles — Sprint {sprintActif.numero}</span>
              <button onClick={() => setShowFilters(v => !v)}
                className={cn('relative ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all',
                  showFilters ? 'bg-navy text-white border-navy' : 'bg-white text-subtle border-border hover:text-navy')}>
                <SlidersHorizontal size={12} />
                Filtres
                {!showFilters && hasFilters && (
                  <span className="absolute -top-1.5 -right-1.5 bg-purple text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {(filterProduit !== null ? 1 : 0) + (filterEquipe ? 1 : 0) + (filterMetier ? 1 : 0)}
                  </span>
                )}
              </button>
            </div>

            {/* Filtres */}
            {showFilters && <div className="flex flex-col gap-2">
              {/* Filtre produit */}
              {produitsAccessibles.length > 1 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-xs text-subtle font-medium shrink-0">Produit :</span>
                  {produitsAccessibles.map(p => (
                    <button key={p.id} onClick={() => setFilterProduit(filterProduit === p.id ? null : p.id)}
                      className={cn(
                        'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all',
                        filterProduit === p.id
                          ? 'text-white border-transparent'
                          : 'bg-white text-subtle border-border hover:text-navy hover:border-navy/30'
                      )}
                      style={filterProduit === p.id ? { background: p.couleur ?? '#4A4CC8', borderColor: p.couleur ?? '#4A4CC8' } : {}}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />
                      {p.nom}
                    </button>
                  ))}
                </div>
              )}

              {/* Filtre équipe + métier */}
              <div className="flex flex-wrap gap-1.5 items-center">
                {sprintEquipes.length > 0 && (
                  <>
                    <span className="text-xs text-subtle font-medium shrink-0">Équipe :</span>
                    {sprintEquipes.map(eq => (
                      <button key={eq} onClick={() => setFilterEquipe(filterEquipe === eq ? '' : eq)}
                        className={cn(
                          'text-xs px-2.5 py-1 rounded-full border transition-all',
                          filterEquipe === eq
                            ? 'bg-navy text-white border-navy'
                            : 'bg-white text-subtle border-border hover:border-navy/30 hover:text-navy'
                        )}>
                        👥 {eq}
                      </button>
                    ))}
                  </>
                )}
                {sprintEquipes.length > 0 && sprintMetiers.length > 0 && (
                  <div className="w-px h-4 bg-border hidden sm:block" />
                )}
                {sprintMetiers.length > 0 && (
                  <>
                    <span className="text-xs text-subtle font-medium shrink-0">Métier :</span>
                    {sprintMetiers.map(mt => (
                      <button key={mt} onClick={() => setFilterMetier(filterMetier === mt ? '' : mt)}
                        className={cn(
                          'text-xs px-2.5 py-1 rounded-full border transition-all',
                          filterMetier === mt
                            ? 'bg-purple text-white border-purple'
                            : 'bg-white text-subtle border-border hover:border-purple/30 hover:text-purple'
                        )}>
                        🏗️ {mt}
                      </button>
                    ))}
                  </>
                )}
                {hasFilters && (
                  <button onClick={clearFilters}
                    className="flex items-center gap-1 text-xs text-subtle hover:text-red transition-colors ml-auto">
                    <X size={12} /> Effacer
                  </button>
                )}
              </div>
            </div>}

            {/* Compteur */}
            <div className="text-xs text-subtle px-1">
              {unassignedTaches.length} tâche{unassignedTaches.length !== 1 ? 's' : ''} non assignée{unassignedTaches.length !== 1 ? 's' : ''}
              {!selMembre && <span className="text-orange ml-1">— sélectionnez votre trigramme pour vous assigner</span>}
            </div>

            {/* Liste */}
            {unassignedTaches.length > 0 ? (
              <div className="flex flex-col gap-2">
                {unassignedTaches.map(t => (
                  <UnassignedTaskCard key={t.id_tache} task={t}
                    canAssign={!!selMembre}
                    onAssign={() => selfAssign(t.id_tache)} />
                ))}
              </div>
            ) : (
              <div className="ds-card flex items-center justify-center py-8 text-subtle text-xs">
                {hasFilters
                  ? 'Aucune tâche disponible avec ces filtres'
                  : 'Toutes les tâches du sprint sont assignées 🎉'}
              </div>
            )}
          </div>
        )}

        {!sprintActif && (
          <div className="ds-card flex flex-col items-center py-10 text-subtle gap-2">
            <p className="text-sm font-medium">Aucun sprint en cours</p>
            <p className="text-xs">Les tâches disponibles apparaîtront ici lors d'un sprint actif</p>
          </div>
        )}

      </div>
    </Layout>
  )
}

// ── Carte tâche non assignée ──────────────────────────────────
function UnassignedTaskCard({ task, canAssign, onAssign }: {
  task: Tache; canAssign: boolean; onAssign: () => void
}) {
  return (
    <div className="ds-card flex items-start gap-3 hover:border-purple/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-xs font-semibold text-purple shrink-0">{task.id_tache}</span>
          <StatutBadge value={task.statut} />
          {task.effort_j != null && (
            <span className="text-xs font-semibold text-blue">{task.effort_j}j</span>
          )}
        </div>
        <p className="text-sm font-medium text-navy leading-snug mb-1.5">{task.titre}</p>
        <div className="flex flex-wrap gap-1.5">
          {task.epic && <EpicBadge value={task.epic} />}
          {task.jalon && <JalonBadge value={task.jalon} />}
          {task.equipe && (
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-bg border border-border text-subtle">👥 {task.equipe}</span>
          )}
          {task.metier && (
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-bg border border-border text-subtle">🏗️ {task.metier}</span>
          )}
        </div>
      </div>
      <button onClick={onAssign} disabled={!canAssign}
        title={canAssign ? 'M\'assigner cette tâche' : 'Sélectionnez d\'abord votre trigramme'}
        className={cn(
          'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all shrink-0',
          canAssign
            ? 'bg-purple/10 text-purple border-purple/20 hover:bg-purple hover:text-white active:scale-95'
            : 'bg-bg text-subtle border-border opacity-50 cursor-not-allowed'
        )}>
        <UserPlus size={13} />
        <span className="hidden sm:inline">M'assigner</span>
      </button>
    </div>
  )
}

// ── Ligne tâche assignée ──────────────────────────────────────
function TaskRow({ task, subs, subsSelf, expanded, onToggle, onStatut, onSubStatut, highlight }: {
  task: Tache; subs: Tache[]; subsSelf: Tache[]
  expanded: boolean; onToggle: () => void
  onStatut: (s: Statut) => void; onSubStatut: (id: string, s: Statut) => void
  highlight: boolean
}) {
  const done = subs.filter(s => s.statut === 'Fait').length
  const pct  = subs.length ? Math.round(done / subs.length * 100) : 0

  return (
    <div className={cn('ds-card', highlight && 'border-l-4 border-l-purple')}>
      <div className="flex items-start gap-3">
        <span className="text-xs font-semibold text-purple shrink-0 w-16 mt-0.5">{task.id_tache}</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-navy text-sm leading-snug mb-1">{task.titre}</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {task.epic && <EpicBadge value={task.epic} />}
            {task.jalon && <JalonBadge value={task.jalon} />}
            {task.effort_j != null && <span className="text-xs text-blue font-semibold">{task.effort_j}j</span>}
            <StatutBadge value={task.statut} />
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <select value={task.statut} onChange={e => onStatut(e.target.value as Statut)}
            className="kanban-select w-24 sm:w-28 text-xs">
            {(['À faire', 'En cours', 'Fait', 'Bloqué'] as Statut[]).map(s => <option key={s}>{s}</option>)}
          </select>
          {subs.length > 0 && (
            <button onClick={onToggle} className="shrink-0 text-subtle hover:text-navy p-1">
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
        </div>
      </div>
      {subs.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
            <div className="h-full bg-green rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-subtle">{done}/{subs.length}</span>
        </div>
      )}
      {expanded && subs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border flex flex-col gap-1.5">
          {subs.map(s => {
            const isAssigned = subsSelf.some(ss => ss.id_tache === s.id_tache)
            return (
              <div key={s.id_tache} className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded-lg',
                isAssigned ? 'bg-purple/5 border border-purple/20' : 'bg-bg'
              )}>
                <div className={cn('w-1.5 h-1.5 rounded-full shrink-0',
                  s.statut === 'Fait' ? 'bg-green' : s.statut === 'En cours' ? 'bg-orange' : 'bg-slate-300')} />
                <span className="text-xs text-subtle w-14 shrink-0">{s.id_tache}</span>
                <span className={cn('text-xs flex-1 truncate', s.statut === 'Fait' && 'line-through text-subtle')}>{s.titre}</span>
                {s.assigne_a && (
                  <span className="text-xs bg-purple/10 text-purple px-1.5 rounded-full shrink-0">{s.assigne_a}</span>
                )}
                <StatutBadge value={s.statut} />
                {isAssigned && (
                  <select value={s.statut} onChange={e => onSubStatut(s.id_tache, e.target.value as Statut)}
                    className="kanban-select w-24 text-xs shrink-0">
                    {(['À faire', 'En cours', 'Fait', 'Bloqué'] as Statut[]).map(st => <option key={st}>{st}</option>)}
                  </select>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
