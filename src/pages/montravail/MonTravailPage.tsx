import { useState, useMemo, useEffect } from 'react'
import { Layout } from '@/components/layout/Layout'
import { Spinner } from '@/components/ui/Spinner'
import { EpicBadge, JalonBadge } from '@/components/ui/Badge'
import { useTaches, useUpdateTache } from '@/hooks/useTaches'
import { useSprintActif } from '@/hooks/useSprints'
import { useUtilisateurs } from '@/hooks/useEquipes'
import { useProduits } from '@/hooks/useProduits'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/useToast'
import { sprintInRange, buildTacheIndex, isUS, isSousTache } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  User, ChevronDown, ChevronRight, UserPlus, X,
  SlidersHorizontal, Zap, Archive, CheckCircle2,
  Clock, CircleDot, Octagon,
} from 'lucide-react'
import { SelectPicker } from '@/components/ui/SelectPicker'
import type { Tache, Statut } from '@/types'

// ── Helpers ────────────────────────────────────────────────────
const STATUT_CFG: Record<Statut, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
  'À faire':  { bg: 'bg-slate-50',       text: 'text-slate-500',   border: 'border-slate-200', icon: <CircleDot size={11} /> },
  'En cours': { bg: 'bg-amber-50',       text: 'text-amber-700',   border: 'border-amber-200', icon: <Clock size={11} /> },
  'Fait':     { bg: 'bg-emerald-50',     text: 'text-emerald-700', border: 'border-emerald-200', icon: <CheckCircle2 size={11} /> },
  'Bloqué':   { bg: 'bg-rose-50',        text: 'text-rose-700',    border: 'border-rose-200',  icon: <Octagon size={11} /> },
}

function StatusPill({ value, onChange }: { value: Statut; onChange: (s: Statut) => void }) {
  const cfg = STATUT_CFG[value] ?? STATUT_CFG['À faire']
  return (
    <select value={value} onChange={e => onChange(e.target.value as Statut)}
      className={cn(
        'text-xs font-semibold px-2.5 py-1 rounded-full border cursor-pointer transition-all',
        'focus:outline-none focus:ring-2 focus:ring-offset-1',
        cfg.bg, cfg.text, cfg.border
      )}>
      {(['À faire', 'En cours', 'Fait', 'Bloqué'] as Statut[]).map(s => <option key={s}>{s}</option>)}
    </select>
  )
}


// ── Page ───────────────────────────────────────────────────────
export default function MonTravailPage() {
  const { data: taches  = [], isLoading: loadTach } = useTaches()
  const { data: sprintActif }                        = useSprintActif()
  const { data: membres = [] }                       = useUtilisateurs()
  const { data: produits = [] }                      = useProduits()
  const { user, isAdmin, getRoleForProduit }          = useAuth()
  const updateTache = useUpdateTache()
  const toast       = useToast()

  const monMembre = membres.find(m => m.user_id === user?.id && m.trigramme)

  const [selMembre,     setSelMembre]     = useState('')
  const [expanded,      setExpanded]      = useState<Set<string>>(new Set())
  const [filterProduit, setFilterProduit] = useState<number | null>(null)
  const [filterEquipe,  setFilterEquipe]  = useState('')
  const [filterMetier,  setFilterMetier]  = useState('')
  const [showFilters,   setShowFilters]   = useState(false)

  useEffect(() => {
    if (monMembre?.trigramme && !selMembre) setSelMembre(monMembre.trigramme)
  }, [monMembre?.trigramme])

  const membres_actifs = membres.filter(m => m.actif)
  const membreSelObj   = membres.find(m => m.trigramme === selMembre)

  const produitsAccessibles = produits.filter(p =>
    p.actif && (isAdmin || getRoleForProduit(p.id) !== null)
  )
  const produitMap = useMemo(() => new Map(produits.map(p => [p.id, p])), [produits])

  const childMap = useMemo(() => {
    const map: Record<string, Tache[]> = {}
    taches.filter(t => t.parent_id).forEach(c => {
      if (!map[c.parent_id!]) map[c.parent_id!] = []
      map[c.parent_id!].push(c)
    })
    return map
  }, [taches])

  const byId = useMemo(() => buildTacheIndex(taches), [taches])

  const myTaches = useMemo(() => {
    if (!selMembre) return []
    return taches.filter(t =>
      isUS(t, byId) &&
      t.assigne_a?.split(/[,;\s]+/).map(s => s.trim()).includes(selMembre)
    )
  }, [taches, byId, selMembre])

  const mySubTaches = useMemo(() => {
    if (!selMembre) return []
    return taches.filter(t =>
      isSousTache(t, byId) &&
      t.assigne_a?.split(/[,;\s]+/).map(s => s.trim()).includes(selMembre)
    )
  }, [taches, byId, selMembre])

  const sprintTaches  = myTaches.filter(t =>
    sprintActif && sprintInRange(t.sprint_debut, t.sprint_fin, sprintActif.numero)
  )
  const backlogTaches = myTaches.filter(t =>
    !sprintActif || !sprintInRange(t.sprint_debut, t.sprint_fin, sprintActif.numero)
  )

  const sprintEquipes = useMemo(() => {
    if (!sprintActif) return []
    return Array.from(new Set(
      taches.filter(t => isUS(t, byId) && sprintInRange(t.sprint_debut, t.sprint_fin, sprintActif.numero) && t.equipe)
        .map(t => t.equipe!)
    )).sort()
  }, [taches, byId, sprintActif])

  const sprintMetiers = useMemo(() => {
    if (!sprintActif) return []
    return Array.from(new Set(
      taches.filter(t => isUS(t, byId) && sprintInRange(t.sprint_debut, t.sprint_fin, sprintActif.numero) && t.metier)
        .map(t => t.metier!)
    )).sort()
  }, [taches, byId, sprintActif])

  const unassignedTaches = useMemo(() => {
    if (!sprintActif) return []
    return taches.filter(t =>
      isUS(t, byId) &&
      !t.assigne_a &&
      t.statut !== 'Fait' &&
      sprintInRange(t.sprint_debut, t.sprint_fin, sprintActif.numero) &&
      (filterEquipe ? t.equipe === filterEquipe : true) &&
      (filterMetier ? t.metier === filterMetier : true)
    )
  }, [taches, byId, sprintActif, filterEquipe, filterMetier])

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

  // Sprint progress (mes tâches dans le sprint)
  const sprintFait = sprintTaches.filter(t => t.statut === 'Fait').length
  const sprintPct  = sprintTaches.length ? Math.round(sprintFait / sprintTaches.length * 100) : 0

  if (loadTach) return <Layout><Spinner /></Layout>

  return (
    <Layout>
      {/* ── Topbar ─────────────────────────────────────────── */}
      <div className="page-topbar -mx-3 -mt-3 mb-4 px-3 md:-mx-5 md:-mt-5 md:mb-6 md:px-5 gap-y-2">
        <div className="flex items-center gap-2">
          <User size={16} className="text-subtle" />
          <h1 className="text-sm font-semibold text-navy">Mon Travail</h1>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-subtle hidden sm:inline font-medium">Membre</span>
          <SelectPicker
            value={selMembre}
            onChange={setSelMembre}
            placeholder="-- Sélectionner --"
            searchable
            className="w-56"
            options={membres_actifs.filter(m => m.trigramme).map(m => ({
              value: m.trigramme!,
              label: `${m.trigramme} — ${m.prenom ?? ''} ${m.nom ?? ''}`
            }))}
          />
        </div>
      </div>

      <div className="flex flex-col gap-6">

        {/* ── Profil + KPI ───────────────────────────────── */}
        {selMembre && membreSelObj && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-card border border-border rounded-2xl px-5 py-4 shadow-sm">
            {/* Avatar */}
            <div className="flex items-center gap-3 shrink-0">
              {membreSelObj.avatar_url ? (
                <img src={membreSelObj.avatar_url}
                  className="w-12 h-12 rounded-full object-cover ring-2 ring-border" alt={membreSelObj.display_name ?? ''} />
              ) : (
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold ring-2 ring-white shadow-md"
                  style={{ background: membreSelObj.couleur ?? '#4A4CC8' }}>
                  {(membreSelObj.trigramme ?? membreSelObj.display_name ?? '?').slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <div className="font-bold text-navy text-sm">{membreSelObj.display_name}</div>
                <div className="text-xs text-subtle">{membreSelObj.trigramme}</div>
              </div>
            </div>

            {/* Séparateur */}
            <div className="hidden sm:block w-px h-10 bg-border mx-1 shrink-0" />

            {/* KPI */}
            <div className="flex gap-3 flex-wrap flex-1">
              {([
                { label: 'À faire',  count: afaire,  bg: 'bg-slate-50',    text: 'text-slate-600',   dot: 'bg-slate-300'   },
                { label: 'En cours', count: encours, bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-300'   },
                { label: 'Terminé',  count: fait,    bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-300' },
                { label: 'Bloqué',   count: bloque,  bg: 'bg-rose-50',     text: 'text-rose-700',    dot: 'bg-rose-300',   hide: bloque === 0 },
              ] as const).filter(k => !(k as any).hide).map(k => (
                <div key={k.label} className={cn('flex items-center gap-2 px-3 py-2 rounded-xl border', k.bg,
                  k.bg === 'bg-slate-50' ? 'border-slate-100' :
                  k.bg === 'bg-amber-50' ? 'border-amber-100' :
                  k.bg === 'bg-emerald-50' ? 'border-emerald-100' : 'border-rose-100')}>
                  <span className={cn('w-2 h-2 rounded-full shrink-0', k.dot)} />
                  <span className={cn('text-lg font-extrabold tabular-nums leading-none', k.text)}>{k.count}</span>
                  <span className={cn('text-xs font-medium opacity-80', k.text)}>{k.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Pas de membre sélectionné ──────────────────── */}
        {!selMembre && (
          <div className="bg-card border border-border rounded-2xl flex flex-col items-center py-14 text-subtle gap-3 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-bg flex items-center justify-center">
              <User size={28} className="opacity-30" />
            </div>
            <p className="text-sm font-semibold text-navy/60">Sélectionnez votre trigramme</p>
            <p className="text-xs text-subtle/70">Vos tâches assignées apparaîtront ici</p>
          </div>
        )}

        {/* ── Mes tâches ─────────────────────────────────── */}
        {selMembre && (
          <div className="flex flex-col gap-4">

            {/* Sprint(s) en cours */}
            {sprintActif && sprintTaches.length > 0 && (
              <div className="flex flex-col gap-3">
                {/* Header sprint */}
                <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                  <Zap size={15} className="text-indigo-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-indigo-700 font-bold text-sm">Sprint(s) en cours</span>
                      <span className="ml-auto text-xs text-indigo-400 tabular-nums">
                        {sprintFait}/{sprintTaches.length} terminées
                      </span>
                    </div>
                    {sprintTaches.length > 0 && (
                      <div className="mt-2 h-1.5 rounded-full bg-indigo-100 overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-300 transition-all"
                          style={{ width: `${sprintPct}%` }} />
                      </div>
                    )}
                  </div>
                  <span className="text-indigo-700 font-extrabold text-lg tabular-nums shrink-0">{sprintPct}%</span>
                </div>

                {sprintTaches.map(t => (
                  <TaskRow key={t.id_tache} task={t}
                    subs={childMap[t.id_tache] ?? []}
                    subsSelf={mySubTaches.filter(s => s.parent_id === t.id_tache)}
                    expanded={expanded.has(t.id_tache)}
                    onToggle={() => toggleExpand(t.id_tache)}
                    onStatut={s => changeStatut(t.id_tache, s)}
                    onSubStatut={changeStatut}
                    produit={produitMap.get(t.produit_id ?? 0) ?? null}
                    isSprint />
                ))}
              </div>
            )}

            {/* Backlog / autres sprints */}
            {backlogTaches.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 px-1">
                  <Archive size={13} className="text-subtle" />
                  <span className="text-xs font-semibold text-subtle uppercase tracking-wider">
                    Autres sprints & Backlog
                  </span>
                  <span className="ml-auto text-xs text-subtle/60 tabular-nums">{backlogTaches.length}</span>
                </div>
                {backlogTaches.map(t => (
                  <TaskRow key={t.id_tache} task={t}
                    subs={childMap[t.id_tache] ?? []}
                    subsSelf={mySubTaches.filter(s => s.parent_id === t.id_tache)}
                    expanded={expanded.has(t.id_tache)}
                    onToggle={() => toggleExpand(t.id_tache)}
                    onStatut={s => changeStatut(t.id_tache, s)}
                    onSubStatut={changeStatut}
                    produit={produitMap.get(t.produit_id ?? 0) ?? null}
                    isSprint={false} />
                ))}
              </div>
            )}

            {myTaches.length === 0 && mySubTaches.length === 0 && (
              <div className="bg-card border border-border rounded-2xl flex items-center justify-center py-12 text-subtle text-sm shadow-sm">
                Aucune tâche assignée à {selMembre}
              </div>
            )}
          </div>
        )}

        {/* ── Tâches disponibles (sprint en cours) ───────── */}
        {sprintActif && (
          <div className="flex flex-col gap-3">
            {/* Header section disponibles */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <div className="w-3 h-3 rounded-full bg-purple/60 shrink-0" />
                <span className="text-xs font-bold text-navy uppercase tracking-wider">
                  Tâches à prendre
                </span>
                {unassignedTaches.length > 0 && (
                  <span className="bg-purple/10 text-purple text-[11px] font-bold px-2 py-0.5 rounded-full">
                    {unassignedTaches.length}
                  </span>
                )}
                <span className="text-[11px] text-subtle font-medium ml-1">sprint(s) en cours</span>
              </div>
              <button onClick={() => setShowFilters(v => !v)}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all relative',
                  showFilters ? 'bg-brand text-white border-navy' : 'bg-card text-subtle border-border hover:text-navy hover:border-navy/30')}>
                <SlidersHorizontal size={12} />
                Filtres
                {!showFilters && hasFilters && (
                  <span className="absolute -top-1.5 -right-1.5 bg-purple text-white text-[11px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {(filterProduit !== null ? 1 : 0) + (filterEquipe ? 1 : 0) + (filterMetier ? 1 : 0)}
                  </span>
                )}
              </button>
            </div>

            {/* Filtres */}
            {showFilters && (
              <div className="bg-card border border-border rounded-xl p-3 flex flex-col gap-2.5 shadow-sm">
                {produitsAccessibles.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs text-subtle font-semibold shrink-0 w-14">Produit</span>
                    {produitsAccessibles.map(p => (
                      <button key={p.id} onClick={() => setFilterProduit(filterProduit === p.id ? null : p.id)}
                        className={cn('flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all',
                          filterProduit === p.id ? 'text-white border-transparent' : 'bg-card text-subtle border-border hover:text-navy')}
                        style={filterProduit === p.id ? { background: p.couleur ?? '#4A4CC8' } : {}}>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.couleur ?? '#4A4CC8' }} />
                        {p.nom}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 items-center">
                  {sprintEquipes.length > 0 && (
                    <>
                      <span className="text-xs text-subtle font-semibold shrink-0 w-14">Équipe</span>
                      {sprintEquipes.map(eq => (
                        <button key={eq} onClick={() => setFilterEquipe(filterEquipe === eq ? '' : eq)}
                          className={cn('text-xs px-2.5 py-1 rounded-full border transition-all',
                            filterEquipe === eq ? 'bg-brand text-white border-navy' : 'bg-card text-subtle border-border hover:border-navy/30 hover:text-navy')}>
                          {eq}
                        </button>
                      ))}
                    </>
                  )}
                  {sprintMetiers.length > 0 && (
                    <>
                      <span className="text-xs text-subtle font-semibold shrink-0 w-14">Métier</span>
                      {sprintMetiers.map(mt => (
                        <button key={mt} onClick={() => setFilterMetier(filterMetier === mt ? '' : mt)}
                          className={cn('text-xs px-2.5 py-1 rounded-full border transition-all',
                            filterMetier === mt ? 'bg-purple text-white border-purple' : 'bg-card text-subtle border-border hover:border-purple/30 hover:text-purple')}>
                          {mt}
                        </button>
                      ))}
                    </>
                  )}
                </div>
                {hasFilters && (
                  <button onClick={clearFilters}
                    className="flex items-center gap-1 text-xs text-subtle hover:text-red transition-colors self-end">
                    <X size={12} /> Effacer les filtres
                  </button>
                )}
              </div>
            )}

            {/* Liste des tâches disponibles */}
            {unassignedTaches.length > 0 ? (
              <div className="flex flex-col gap-2">
                {unassignedTaches.map(t => (
                  <AvailableTaskCard key={t.id_tache} task={t}
                    canAssign={!!selMembre}
                    onAssign={() => selfAssign(t.id_tache)}
                    produit={produitMap.get(t.produit_id ?? 0) ?? null} />
                ))}
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl flex flex-col items-center py-10 gap-2 text-subtle shadow-sm">
                <CheckCircle2 size={28} className="text-green/50" />
                <p className="text-sm font-medium text-navy/50">
                  {hasFilters ? 'Aucune tâche avec ces filtres' : 'Toutes les tâches sont assignées'}
                </p>
              </div>
            )}

            {!selMembre && unassignedTaches.length > 0 && (
              <p className="text-xs text-orange px-1">Sélectionnez votre trigramme pour vous assigner une tâche</p>
            )}
          </div>
        )}

        {!sprintActif && (
          <div className="bg-card border border-border rounded-2xl flex flex-col items-center py-12 text-subtle gap-2 shadow-sm">
            <Zap size={28} className="opacity-20" />
            <p className="text-sm font-medium">Aucun sprint en cours</p>
            <p className="text-xs">Les tâches disponibles apparaîtront ici lors d'un sprint actif</p>
          </div>
        )}

      </div>
    </Layout>
  )
}

// ── Carte tâche disponible ─────────────────────────────────────
function AvailableTaskCard({ task, canAssign, onAssign, produit }: {
  task: Tache; canAssign: boolean; onAssign: () => void
  produit: { nom: string; couleur?: string | null } | null
}) {
  return (
    <div className="bg-card border border-dashed border-purple/25 rounded-xl px-4 py-3 flex items-start gap-3 hover:border-purple/50 hover:shadow-sm transition-all">
      {/* Bande produit */}
      {produit && (
        <div className="w-0.5 self-stretch rounded-full shrink-0 mt-0.5"
          style={{ background: produit.couleur ?? '#4A4CC8' }} />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-xs font-bold text-purple/80 shrink-0">{task.id_tache}</span>
          {produit && (
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full"
              style={{ background: (produit.couleur ?? '#4A4CC8') + '20', color: produit.couleur ?? '#4A4CC8' }}>
              {produit.nom}
            </span>
          )}
          {task.effort_j != null && (
            <span className="text-xs font-bold text-blue ml-auto">{task.effort_j}j</span>
          )}
        </div>
        <p className="text-sm font-medium text-navy leading-snug mb-2">{task.titre}</p>
        <div className="flex flex-wrap gap-1.5">
          {task.epic && <EpicBadge value={task.epic} />}
          {task.jalon && <JalonBadge value={task.jalon} />}
          {task.equipe && <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-bg border border-border text-subtle">{task.equipe}</span>}
          {task.metier && <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-bg border border-border text-subtle">{task.metier}</span>}
        </div>
      </div>

      <button onClick={onAssign} disabled={!canAssign}
        title={canAssign ? 'M\'assigner cette tâche' : 'Sélectionnez d\'abord votre trigramme'}
        className={cn(
          'flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-all shrink-0',
          canAssign
            ? 'bg-purple/8 text-purple border-purple/20 hover:bg-purple hover:text-white active:scale-95'
            : 'bg-bg text-subtle border-border opacity-40 cursor-not-allowed'
        )}>
        <UserPlus size={13} />
        <span className="hidden sm:inline">Me l'assigner</span>
      </button>
    </div>
  )
}

// ── Ligne tâche assignée ───────────────────────────────────────
function TaskRow({ task, subs, subsSelf, expanded, onToggle, onStatut, onSubStatut, produit, isSprint }: {
  task: Tache; subs: Tache[]; subsSelf: Tache[]
  expanded: boolean; onToggle: () => void
  onStatut: (s: Statut) => void; onSubStatut: (id: string, s: Statut) => void
  produit: { nom: string; couleur?: string | null } | null
  isSprint: boolean
}) {
  const done = subs.filter(s => s.statut === 'Fait').length
  const pct  = subs.length ? Math.round(done / subs.length * 100) : 0
  const isDone = task.statut === 'Fait'

  return (
    <div className={cn(
      'bg-card border rounded-xl overflow-hidden shadow-sm transition-all',
      isSprint ? 'border-l-[3px]' : 'border-border/70',
      isSprint && task.statut === 'Bloqué'   ? 'border-rose-200'    :
      isSprint && task.statut === 'Fait'     ? 'border-emerald-200' :
      isSprint && task.statut === 'En cours' ? 'border-amber-200'   :
      isSprint ? 'border-indigo-200' : '',
    )}>
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Bande produit (backlog) */}
        {!isSprint && produit && (
          <div className="w-0.5 self-stretch rounded-full shrink-0 mt-1"
            style={{ background: produit.couleur ?? '#4A4CC8' }} />
        )}

        <div className="flex-1 min-w-0">
          {/* Meta ligne */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={cn('text-xs font-bold shrink-0', isDone ? 'text-subtle/60' : 'text-purple/80')}>
              {task.id_tache}
            </span>
            {produit && (
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
                style={{ background: (produit.couleur ?? '#4A4CC8') + '18', color: produit.couleur ?? '#4A4CC8' }}>
                {produit.nom}
              </span>
            )}
            {task.effort_j != null && (
              <span className={cn('text-xs font-bold ml-auto', isDone ? 'text-subtle/50' : 'text-blue')}>
                {task.effort_j}j
              </span>
            )}
          </div>

          {/* Titre */}
          <div className={cn('font-medium text-sm leading-snug mb-2',
            isDone ? 'line-through text-subtle/60' : 'text-navy')}>
            {task.titre}
          </div>

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-1.5">
            {task.epic && <EpicBadge value={task.epic} />}
            {task.jalon && <JalonBadge value={task.jalon} />}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <StatusPill value={task.statut} onChange={onStatut} />
          {subs.length > 0 && (
            <button onClick={onToggle} className="p-1 text-subtle hover:text-navy transition-colors">
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* Barre sous-tâches */}
      {subs.length > 0 && (
        <div className="px-4 pb-2.5 flex items-center gap-2">
          <div className="flex-1 h-1 bg-border/50 rounded-full overflow-hidden">
            <div className="h-full bg-green rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] text-subtle tabular-nums">{done}/{subs.length} sous-tâches</span>
        </div>
      )}

      {/* Sous-tâches dépliées */}
      {expanded && subs.length > 0 && (
        <div className="border-t border-border/30 bg-bg/30 px-4 py-2 flex flex-col gap-1">
          {subs.map(s => {
            const isAssigned = subsSelf.some(ss => ss.id_tache === s.id_tache)
            const sDone = s.statut === 'Fait'
            return (
              <div key={s.id_tache} className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded-lg',
                isAssigned ? 'bg-purple/5 border border-purple/15' : 'hover:bg-white/50'
              )}>
                <div className={cn('w-1.5 h-1.5 rounded-full shrink-0',
                  sDone ? 'bg-emerald-300' : s.statut === 'En cours' ? 'bg-amber-300' : s.statut === 'Bloqué' ? 'bg-rose-300' : 'bg-slate-200')} />
                <span className="text-[11px] text-subtle w-16 shrink-0">{s.id_tache}</span>
                <span className={cn('text-xs flex-1 truncate', sDone ? 'line-through text-subtle/50' : 'text-navy/80')}>
                  {s.titre}
                </span>
                {s.assigne_a && (
                  <span className="text-[11px] bg-purple/10 text-purple px-1.5 py-0.5 rounded-full shrink-0">
                    {s.assigne_a}
                  </span>
                )}
                {isAssigned && (
                  <StatusPill value={s.statut} onChange={st => onSubStatut(s.id_tache, st)} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
