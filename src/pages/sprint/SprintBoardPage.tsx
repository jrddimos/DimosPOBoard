import { useState, useMemo, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Spinner } from '@/components/ui/Spinner'
import { StatutBadge, EpicBadge, JalonBadge, MoscowBadge } from '@/components/ui/Badge'
import { useTaches, useUpdateTache } from '@/hooks/useTaches'
import { useSprints, useSprintActif, useClosedSprints } from '@/hooks/useSprints'
import { useUtilisateurs } from '@/hooks/useEquipes'
import { useToast } from '@/hooks/useToast'
import { EPIC_LIST, JALON_LIST, SPRINTS_LIST } from '@/constants'
import { sprintInRange } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { ChevronDown, X, Plus } from 'lucide-react'
import type { Statut, Tache } from '@/types'
import type { UserProfile } from '@/contexts/AuthContext'

function AssignPicker({ value, membres, onAssign, disabled }: {
  value: string | null
  membres: UserProfile[]
  onAssign: (tri: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const actifs = membres.filter(m => m.actif)

  if (disabled) {
    return value
      ? <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple/10 text-purple font-medium">{value}</span>
      : null
  }

  return (
    <div className="relative inline-block" ref={ref} onClick={e => e.stopPropagation()}>
      {value ? (
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOpen(o => !o)}
            className="text-xs px-1.5 py-0.5 rounded-full bg-purple/10 text-purple font-medium hover:bg-purple/20 transition-colors"
          >{value}</button>
          <button
            onClick={() => onAssign('')}
            className="w-3.5 h-3.5 rounded-full bg-border flex items-center justify-center text-subtle hover:bg-red/20 hover:text-red transition-colors"
          ><X size={8}/></button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border border-dashed border-border text-subtle hover:border-purple hover:text-purple transition-colors"
        ><Plus size={10}/> Assigner</button>
      )}
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-border rounded-xl shadow-lg py-1 min-w-[160px]">
          {actifs.filter(m=>m.trigramme).map(m => (
            <button
              key={m.user_id}
              onClick={() => { onAssign(m.trigramme!); setOpen(false) }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-bg text-navy text-left transition-colors',
                value === m.trigramme && 'font-semibold text-purple'
              )}
            >
              <span className="w-5 h-5 rounded-full bg-purple/10 text-purple font-bold flex items-center justify-center text-[9px] shrink-0">
                {m.trigramme}
              </span>
              {m.prenom??''} {m.nom??''}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const COLS: { key: Statut; label: string; dot: string }[] = [
  { key:'À faire',  label:'À faire',  dot:'#94A3B8' },
  { key:'En cours', label:'En cours', dot:'#F0A500' },
  { key:'Fait',     label:'Terminé',  dot:'#00C896' },
  { key:'Bloqué',   label:'Bloqué',   dot:'#EF4444' },
]

export default function SprintBoardPage() {
  const [params] = useSearchParams()
  const [activeTab, setActiveTab] = useState<'current'|'all'>(params.get('tab')==='all'?'all':'current')
  const [filterEpic,  setFilterEpic]   = useState('')
  const [filterJalon, setFilterJalon]  = useState('')
  const [allSprint,   setAllSprint]    = useState('')
  const [panel,       setPanel]        = useState<Tache|null>(null)
  const [expandedSubs,setExpandedSubs] = useState<Set<string>>(new Set())
  const [effortModal, setEffortModal]  = useState<{tache:Tache; pendingStatut:Statut} | null>(null)
  const [effortInput, setEffortInput]  = useState('')

  const { data:taches=[], isLoading } = useTaches()
  const { data:sprintActif }          = useSprintActif()
  const { data:sprints=[] }           = useSprints()
  const { data:closedSprints=[] }     = useClosedSprints()
  const { data:membres=[] }           = useUtilisateurs()
  const updateTache = useUpdateTache()
  const toast = useToast()

  const childMap = useMemo(()=>{
    const map: Record<string,Tache[]> = {}
    taches.filter(t=>t.parent_id).forEach(c=>{
      if(!map[c.parent_id!]) map[c.parent_id!]=[]
      map[c.parent_id!].push(c)
    })
    return map
  },[taches])

  const sprint4Board = activeTab==='current'?(sprintActif?.numero??null):allSprint

  const boardTaches = useMemo(()=>taches.filter(t=>{
    if(t.parent_id) return false
    if(!sprint4Board) return false
    if(!sprintInRange(t.sprint??'',t.sprint_debut,t.sprint_fin,sprint4Board)) return false
    if(filterEpic  && t.epic  !== filterEpic)  return false
    if(filterJalon && t.jalon !== filterJalon) return false
    return true
  }),[taches,sprint4Board,filterEpic,filterJalon])

  const isReadOnly = activeTab==='all' || (sprint4Board ? closedSprints.includes(sprint4Board) : false)

  // Sous-tâches du sprint affiché (pour une tâche multi-sprint)
  function getSubsForSprint(taskId:string): Tache[] {
    const allSubs = childMap[taskId] ?? []
    if(!sprint4Board) return allSubs
    return allSubs.filter(s=>
      !s.sprint && !s.sprint_debut ? true :
      sprintInRange(s.sprint??'',s.sprint_debut,s.sprint_fin,sprint4Board)
    )
  }

  async function changeStatut(t:Tache, statut:Statut) {
    if(isReadOnly){toast('Sprint clôturé ou en lecture seule','error');return}
    if(statut==='Fait'){
      const subs=getSubsForSprint(t.id_tache)
      const pending=subs.filter(s=>s.statut!=='Fait')
      if(pending.length>0){
        toast(`${pending.length} sous-tâche(s) non terminée(s) dans ce sprint`,'error'); return
      }
      if(subs.length>0){
        // Effort parent = somme des sous-tâches, on met à jour directement
        const totalReal=subs.reduce((acc,s)=>acc+(s.effort_realise_j??0),0)
        await updateTache.mutateAsync({id_tache:t.id_tache,updates:{statut,effort_realise_j:totalReal}})
        toast(`${t.id_tache} → Fait · ${totalReal}j réalisés (depuis sous-tâches)`)
        return
      }
      // Pas de sous-tâches : forcer la saisie
      setEffortInput(String(t.effort_j??''))
      setEffortModal({tache:t,pendingStatut:statut})
      return
    }
    await updateTache.mutateAsync({id_tache:t.id_tache,updates:{statut}})
    toast(`${t.id_tache} → ${statut}`)
  }

  async function toggleSub(sub:Tache) {
    if(isReadOnly) return
    if(sub.statut==='Fait'){
      await updateTache.mutateAsync({id_tache:sub.id_tache,updates:{statut:'À faire'}})
    } else {
      // Forcer la saisie de l'effort réalisé
      setEffortInput(String(sub.effort_j??''))
      setEffortModal({tache:sub,pendingStatut:'Fait'})
    }
  }

  async function confirmEffort() {
    if(!effortModal) return
    const val=parseFloat(effortInput)
    await updateTache.mutateAsync({
      id_tache: effortModal.tache.id_tache,
      updates: { statut: effortModal.pendingStatut, effort_realise_j: isNaN(val)?null:val },
    })
    toast(`${effortModal.tache.id_tache} → Fait · ${isNaN(val)?'—':val+'j'} réalisés`)
    setEffortModal(null)
  }

  async function skipEffort() {
    if(!effortModal) return
    await updateTache.mutateAsync({id_tache:effortModal.tache.id_tache,updates:{statut:effortModal.pendingStatut}})
    toast(`${effortModal.tache.id_tache} → Fait`)
    setEffortModal(null)
  }

  async function assignTo(id_tache:string, assigne:string) {
    await updateTache.mutateAsync({id_tache,updates:{assigne_a:assigne||null}})
    toast('Assigné')
  }

  function toggleExpand(id:string){
    setExpandedSubs(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n})
  }

  const fait    = boardTaches.filter(t=>t.statut==='Fait').length
  const encours = boardTaches.filter(t=>t.statut==='En cours').length
  const bloque  = boardTaches.filter(t=>t.statut==='Bloqué').length

  if(isLoading) return <Layout><Spinner/></Layout>

  return (
    <Layout>
      <div className="page-topbar -mx-3 -mt-3 mb-3 px-3 md:-mx-5 md:-mt-5 md:mb-5 md:px-5 flex-wrap gap-y-2">
        <div className="flex gap-0.5 bg-bg border border-border rounded-lg p-0.5">
          {(['current','all'] as const).map(t=>(
            <button key={t} onClick={()=>setActiveTab(t)}
              className={cn('px-3 py-1 rounded-md text-xs font-semibold transition-all',
                activeTab===t?'bg-white shadow-sm text-navy':'text-subtle hover:text-navy')}>
              {t==='current'?'⚡ Sprint en cours':'📅 Tous les sprints'}
            </button>
          ))}
        </div>

        {activeTab==='current'&&sprintActif&&(
          <>
            <div className="ds-sep"/>
            <span className="text-sm font-semibold text-navy">{sprintActif.numero}</span>
            <span className="ds-pill-stat pill-wip rounded-full px-2.5 py-0.5 text-xs font-medium">en cours</span>
          </>
        )}

        {activeTab==='all'&&(
          <select value={allSprint} onChange={e=>setAllSprint(e.target.value)} className="ds-select w-40 text-xs py-1">
            <option value="">-- Sprint --</option>
            {SPRINTS_LIST.map(s=>{const sp=sprints.find(x=>x.numero===s); return <option key={s} value={s}>{s}{sp?` (${sp.statut})`:''}</option>})}
          </select>
        )}

        <div className="ds-sep"/>
        <select value={filterEpic} onChange={e=>setFilterEpic(e.target.value)} className="ds-select w-36 text-xs py-1">
          <option value="">Tous Epics</option>
          {EPIC_LIST.map(e=><option key={e} value={e}>{e.split(' — ')[0]}</option>)}
        </select>
        <select value={filterJalon} onChange={e=>setFilterJalon(e.target.value)} className="ds-select w-28 text-xs py-1">
          <option value="">Tous Jalons</option>
          {JALON_LIST.map(j=><option key={j}>{j}</option>)}
        </select>

        <div className="flex gap-1.5 ml-auto">
          <span className="ds-pill-stat pill-todo rounded-full">{boardTaches.filter(t=>t.statut==='À faire').length} à faire</span>
          <span className="ds-pill-stat pill-wip rounded-full">{encours} en cours</span>
          <span className="ds-pill-stat pill-done rounded-full">{fait} terminé</span>
          {bloque>0&&<span className="ds-pill-stat pill-block rounded-full">{bloque} bloqué</span>}
        </div>
      </div>

      <div className="flex gap-3">
        {/* Kanban */}
        <div className="flex-1 min-w-0 overflow-x-auto">
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'1px',background:'#D8DAE8',borderRadius:'12px',overflow:'hidden',minWidth:'720px'}}>
          {COLS.map(col=>{
            const colTaches=boardTaches.filter(t=>t.statut===col.key)
            return (
              <div key={col.key} className="kanban-col">
                <div className="flex items-center justify-between pb-2 border-b border-border/50 mb-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{background:col.dot}}/>
                    <span className="text-xs font-semibold text-subtle uppercase tracking-wide">{col.label}</span>
                  </div>
                  <span className="text-xs font-medium text-subtle bg-white border border-border px-2 py-0.5 rounded-full">{colTaches.length}</span>
                </div>

                {colTaches.map(t=>{
                  const subs=getSubsForSprint(t.id_tache)
                  const effortJ=subs.length>0?subs.reduce((a,s)=>a+(s.effort_j??0),0):(t.effort_j??0)
                  const effortRealJ=subs.length>0?subs.reduce((a,s)=>a+(s.effort_realise_j??0),0):(t.effort_realise_j??null)
                  const done=subs.filter(s=>s.statut==='Fait').length
                  const pct=subs.length?Math.round(done/subs.length*100):0
                  const isExpanded=expandedSubs.has(t.id_tache)
                  const pendingSubs=subs.filter(s=>s.statut!=='Fait').length
                  const blockedByTask=col.key!=='Fait'&&pendingSubs>0

                  return (
                    <div key={t.id_tache}
                      className={cn('kanban-card',panel?.id_tache===t.id_tache&&'selected')}
                      onClick={()=>setPanel(p=>p?.id_tache===t.id_tache?null:t)}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-purple">{t.id_tache}</span>
                        <EpicBadge value={t.epic??''} className="text-xs"/>
                      </div>
                      <p className="text-xs font-medium text-navy leading-snug mb-2">{t.titre}</p>
                      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                        {t.jalon&&<span className="text-xs px-1.5 py-0.5 rounded-md bg-bg border border-border text-subtle">{t.jalon}</span>}
                        {effortJ>0&&(
                          <span className="flex items-center gap-1 text-xs font-semibold">
                            <span className="text-blue" title={subs.length>0?'Somme des sous-tâches':undefined}>
                              {subs.length>0&&'∑ '}{effortJ}j
                            </span>
                            {effortRealJ!=null&&effortRealJ>0&&(
                              <>
                                <span className="text-subtle/40">·</span>
                                <span className={cn(effortRealJ<=effortJ?'text-green':'text-red')}>
                                  {effortRealJ}j ✓
                                </span>
                              </>
                            )}
                          </span>
                        )}
                      </div>

                      {/* Assign */}
                      <div className="mb-1.5">
                        <AssignPicker
                          value={t.assigne_a??null}
                          membres={membres}
                          onAssign={tri=>assignTo(t.id_tache,tri)}
                          disabled={isReadOnly}
                        />
                      </div>

                      {/* Statut */}
                      {!isReadOnly&&(
                        <div className="relative">
                          <select value={t.statut}
                            onChange={e=>{e.stopPropagation();changeStatut(t,e.target.value as Statut)}}
                            onClick={e=>e.stopPropagation()}
                            className={cn('kanban-select mb-2',blockedByTask&&'opacity-50')}>
                            {(['À faire','En cours','Fait','Bloqué'] as Statut[]).map(s=><option key={s}>{s}</option>)}
                          </select>
                          {blockedByTask&&<div className="text-xs text-orange mt-0.5">⚠ {pendingSubs} sous-tâche(s) restante(s)</div>}
                        </div>
                      )}
                      {isReadOnly&&<div className="mb-2"><StatutBadge value={t.statut}/></div>}

                      {/* Sous-tâches du sprint */}
                      {subs.length>0&&(
                        <div className="border-t border-border pt-2 mt-1" onClick={e=>e.stopPropagation()}>
                          <div className="flex items-center gap-2 cursor-pointer" onClick={()=>toggleExpand(t.id_tache)}>
                            <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-green transition-all" style={{width:`${pct}%`}}/>
                            </div>
                            <span className="text-xs text-subtle whitespace-nowrap">{done}/{subs.length}</span>
                            <ChevronDown size={12} className={cn('text-subtle transition-transform shrink-0',isExpanded&&'rotate-180')}/>
                          </div>
                          {isExpanded&&(
                            <div className="flex flex-col gap-1 mt-2">
                              {subs.map(s=>(
                                <div key={s.id_tache} className="flex flex-col gap-1">
                                  <label className="flex items-start gap-2 cursor-pointer" onClick={e=>e.stopPropagation()}>
                                    {!isReadOnly&&<input type="checkbox" checked={s.statut==='Fait'} onChange={()=>toggleSub(s)} className="mt-0.5 accent-green w-3 h-3 shrink-0"/>}
                                    <div className="flex-1 min-w-0">
                                      <span className={cn('text-xs leading-snug',s.statut==='Fait'?'line-through text-subtle':'text-navy')}>{s.titre}</span>
                                      <span className="text-xs text-subtle/60 ml-1">{s.id_tache}</span>
                                      {s.assigne_a&&<span className="ml-1 text-xs bg-purple/10 text-purple px-1.5 rounded-full">{s.assigne_a}</span>}
                                      {(s.effort_j>0||s.effort_realise_j!=null)&&(
                                        <span className="ml-1 text-xs font-semibold text-blue">
                                          {s.effort_j>0&&<>{s.effort_j}j</>}
                                          {s.effort_realise_j!=null&&s.effort_realise_j>0&&(
                                            <span className={cn('ml-1',s.effort_realise_j<=s.effort_j?'text-green':'text-red')}>
                                              · {s.effort_realise_j}j ✓
                                            </span>
                                          )}
                                        </span>
                                      )}
                                    </div>
                                  </label>
                                  <div className="ml-5">
                                    <AssignPicker
                                      value={s.assigne_a??null}
                                      membres={membres}
                                      onAssign={tri=>assignTo(s.id_tache,tri)}
                                      disabled={isReadOnly}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {!colTaches.length&&(
                  <div className="flex flex-col items-center justify-center h-16 border-2 border-dashed border-border/60 rounded-xl text-subtle text-xs gap-1">Vide</div>
                )}
              </div>
            )
          })}
        </div>
        </div>

        {/* Panel détail */}
        {panel&&(
          <div className="w-72 shrink-0 animate-in">
            <div className="ds-card sticky top-0 flex flex-col gap-3 max-h-[calc(100vh-120px)] overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-purple">{panel.id_tache}</span>
                <button onClick={()=>setPanel(null)} className="p-1 rounded-lg hover:bg-bg text-subtle hover:text-navy"><X size={13}/></button>
              </div>
              <h3 className="text-sm font-semibold text-navy leading-snug">{panel.titre}</h3>
              <div className="flex flex-wrap gap-1.5">
                <StatutBadge value={panel.statut}/>
                {panel.moscow&&<MoscowBadge value={panel.moscow}/>}
                {panel.jalon&&<JalonBadge value={panel.jalon}/>}
              </div>
              {panel.description&&<div><div className="ds-label mb-1">User Story</div><p className="text-xs text-navy leading-relaxed whitespace-pre-line">{panel.description}</p></div>}
              {panel.criteres&&<div><div className="ds-label mb-1">Critères</div><p className="text-xs text-navy leading-relaxed whitespace-pre-line">{panel.criteres}</p></div>}
              {panel.lien_dod&&<div><div className="ds-label mb-1">Lien DoD</div><span className="text-xs text-blue font-medium">{panel.lien_dod}</span></div>}
              {panel.commentaire&&<div><div className="ds-label mb-1">Commentaire</div><p className="text-xs text-subtle italic">{panel.commentaire}</p></div>}
              <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border">
                {[['Epic',panel.epic?.split(' — ')[0]],['Jalon',panel.jalon],['Sprint',panel.sprint||panel.sprint_debut],['Effort',panel.effort_j?`${panel.effort_j}j`:null],['Équipe',panel.equipe],['Assigné',panel.assigne_a]].map(([k,v])=>v?(
                  <div key={String(k)}><div className="text-subtle">{k}</div><div className="font-semibold text-navy">{String(v)}</div></div>
                ):null)}
              </div>
              {/* Changer de sprint depuis le panel */}
              <div className="pt-2 border-t border-border">
                <div className="ds-label mb-1.5">Déplacer vers sprint</div>
                <div className="flex gap-2">
                  <select defaultValue={panel.sprint||panel.sprint_debut||''}
                    className="ds-select text-xs flex-1"
                    id={`sprint-move-${panel.id_tache}`}>
                    <option value="">Backlog</option>
                    {SPRINTS_LIST.map(s=><option key={s}>{s}</option>)}
                  </select>
                  <button onClick={async()=>{
                    const sel=document.getElementById(`sprint-move-${panel.id_tache}`) as HTMLSelectElement
                    const val=sel?.value??''
                    await updateTache.mutateAsync({id_tache:panel.id_tache,updates:{sprint:val,sprint_debut:val||null}})
                    toast(`${panel.id_tache} → ${val||'Backlog'}`)
                  }} className="ds-btn ds-btn-sm">✓</button>
                </div>
              </div>
              {(childMap[panel.id_tache]??[]).length>0&&(
                <div className="pt-2 border-t border-border">
                  <div className="ds-label mb-2">Toutes les sous-tâches</div>
                  {(childMap[panel.id_tache]??[]).map(s=>(
                    <div key={s.id_tache} className="flex items-center gap-2 py-1">
                      <div className={cn('w-2 h-2 rounded-full shrink-0',s.statut==='Fait'?'bg-green':s.statut==='En cours'?'bg-orange':'bg-slate-300')}/>
                      <span className={cn('text-xs flex-1',s.statut==='Fait'&&'line-through text-subtle')}>{s.titre}</span>
                      {s.assigne_a&&<span className="text-xs bg-purple/10 text-purple px-1.5 rounded-full">{s.assigne_a}</span>}
                      <StatutBadge value={s.statut}/>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal Effort réalisé ─────────────────────────── */}
      {effortModal&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 backdrop-blur-sm"
          onClick={()=>setEffortModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-80 p-5 space-y-4"
            onClick={e=>e.stopPropagation()}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-subtle mb-0.5">Effort réalisé</p>
              <p className="text-sm font-bold text-navy">{effortModal.tache.id_tache}</p>
              <p className="text-xs text-subtle leading-snug line-clamp-2">{effortModal.tache.titre}</p>
            </div>

            {effortModal.tache.effort_j>0&&(
              <p className="text-xs text-subtle">
                Estimé : <span className="font-semibold text-navy">{effortModal.tache.effort_j}j</span>
              </p>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-navy">Jours réalisés <span className="text-red">*</span></label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="0" step="0.5"
                  value={effortInput}
                  onChange={e=>setEffortInput(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&confirmEffort()}
                  autoFocus
                  className="ds-input text-sm font-semibold text-center flex-1"
                  placeholder="Ex : 2.5"
                />
                <span className="text-sm text-subtle font-medium">jours</span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={confirmEffort}
                disabled={effortInput===''}
                className="ds-btn-primary flex-1 disabled:opacity-40">
                Confirmer
              </button>
              <button onClick={()=>setEffortModal(null)} className="ds-btn">Annuler</button>
            </div>
            <button onClick={skipEffort}
              className="w-full text-center text-[10px] text-subtle hover:text-navy underline underline-offset-2 transition-colors">
              Passer sans renseigner l'effort
            </button>
          </div>
        </div>
      )}
    </Layout>
  )
}
