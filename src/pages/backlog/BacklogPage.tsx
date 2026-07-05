import React, { useState, useMemo } from 'react'
import { Layout } from '@/components/layout/Layout'
import { Spinner, EmptyState } from '@/components/ui/Spinner'
import { StatutBadge, MoscowBadge, TypeFonctionBadge, JalonBadge, PrioBadge } from '@/components/ui/Badge'
import { useTaches, useUpdateTache } from '@/hooks/useTaches'
import { useClosedSprints } from '@/hooks/useSprints'
import { useAuth } from '@/contexts/AuthContext'
import { EPIC_COLORS, JALON_LIST } from '@/constants'
import { epicShortName, epicCode, parseCriteres, serializeCriteres } from '@/lib/utils'
import { CriteresEditor } from '@/components/ui/CriteresEditor'
import type { CritereItem } from '@/lib/utils'
import { ChevronRight, ChevronDown, Lock, Search, X, SlidersHorizontal, List, BookOpen, Target, AlignJustify } from 'lucide-react'
import { PageTitle } from '@/components/ui/PageTitle'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { cn } from '@/lib/utils'
import type { Tache } from '@/types'

type GroupBy = 'epic'|'jalon'|'none'
const STATUTS  = ['À faire','En cours','Fait','Bloqué'] as const
const MOSCOWS  = ['Must Have','Should Have','Could Have',"Won't Have"] as const
const TYPES_FN = ['Fonction principale','Fonction secondaire','Fonction support','Fonction exclue'] as const

const STATUT_COLORS:Record<string,{bg:string;text:string}> = {
  'À faire': {bg:'#F1F5F9',text:'#475569'},
  'En cours':{bg:'#FEF3C7',text:'#92600A'},
  'Fait':    {bg:'#D1FAE5',text:'#065F46'},
  'Bloqué':  {bg:'#FEE2E2',text:'#991B1B'},
}

function Chip({label,active,onClick,activeBg,activeText,bg,text}:{
  label:string;active:boolean;onClick:()=>void;activeBg?:string;activeText?:string;bg?:string;text?:string
}) {
  return (
    <button onClick={onClick}
      className="text-xs px-2.5 py-1 rounded-full border transition-all whitespace-nowrap"
      style={active
        ?{background:activeBg??'#1E3A5F',color:activeText??'#fff',borderColor:activeBg??'#1E3A5F'}
        :{background:bg??'#fff',color:text??'#6B6B8A',borderColor:'#E2E2F0'}}>
      {label}
    </button>
  )
}

export default function BacklogPage() {
  const { data:taches=[], isLoading } = useTaches()
  const { data:closedSprints=[] }     = useClosedSprints()
  const updateTache                   = useUpdateTache()
  const { canWrite }                  = useAuth()
  const [search,setSearch]       = useState('')
  const [groupBy,setGroupBy]     = useState<GroupBy>('epic')
  const [selEpics,setSelEpics]   = useState<string[]>([])
  const [selJalons,setSelJalons] = useState<string[]>([])
  const [selStatuts,setSelStatuts]=useState<string[]>([])
  const [selMoscows,setSelMoscows]=useState<string[]>([])
  const [selTypes,setSelTypes]   = useState<string[]>([])
  const [expanded,setExpanded]   = useState<string[]>([])
  const [panelTask,setPanelTask] = useState<Tache|null>(null)
  const [page,setPage]           = useState(1)
  const [showFilters,setShowFilters] = useState(false)

  const parents  = useMemo(()=>taches.filter(t=>!t.parent_id),[taches])
  const epicList = useMemo(()=>[...new Set(parents.map(t=>t.epic).filter(Boolean))].sort(),[parents])
  const childMap = useMemo(()=>{
    const map:Record<string,Tache[]>={}
    taches.filter(t=>t.parent_id).forEach(c=>{if(!map[c.parent_id!]) map[c.parent_id!]=[]; map[c.parent_id!].push(c)})
    return map
  },[taches])

  function toggle<T>(arr:T[],val:T):T[] { return arr.includes(val)?arr.filter(x=>x!==val):[...arr,val] }
  const activeFilterCount = selEpics.length+selJalons.length+selStatuts.length+selMoscows.length+selTypes.length+(search?1:0)
  const hasFilters = activeFilterCount > 0
  function resetAll() { setSelEpics([]);setSelJalons([]);setSelStatuts([]);setSelMoscows([]);setSelTypes([]);setSearch('');setPage(1) }

  const filtered = useMemo(()=>parents.filter(t=>{
    if(search && !t.titre.toLowerCase().includes(search.toLowerCase()) && !t.id_tache.toLowerCase().includes(search.toLowerCase())) return false
    if(selEpics.length   && !selEpics.includes(t.epic??''))         return false
    if(selJalons.length  && !selJalons.includes(t.jalon??''))        return false
    if(selStatuts.length && !selStatuts.includes(t.statut))          return false
    if(selMoscows.length && !selMoscows.includes(t.moscow??''))      return false
    if(selTypes.length   && !selTypes.includes(t.type_fonction??'')) return false
    return true
  }),[parents,search,selEpics,selJalons,selStatuts,selMoscows,selTypes])

  // Effort effectif d'une tâche : somme des sous-tâches si elles existent
  function effJ(t: Tache): number {
    const subs = childMap[t.id_tache] ?? []
    if (subs.length === 0) return t.effort_j ?? 0
    return subs.reduce((s, c) => s + (c.effort_j ?? 0), 0)
  }
  const totalEffort = filtered.reduce((s,t)=>s+effJ(t),0)
  const PAGE_SIZE = 50
  const filteredPaged = useMemo(()=>{
    const start=(page-1)*PAGE_SIZE
    return filtered.slice(start,start+PAGE_SIZE)
  },[filtered,page])
  const totalPages = Math.ceil(filtered.length/PAGE_SIZE)

  const groups:{key:string;tasks:Tache[]}[] =
    groupBy==='epic'  ? epicList.map(e=>({key:e,tasks:filteredPaged.filter(t=>t.epic===e)})).filter(g=>g.tasks.length) :
    groupBy==='jalon' ? JALON_LIST.map(j=>({key:j,tasks:filteredPaged.filter(t=>t.jalon===j)})).filter(g=>g.tasks.length) :
    [{key:'all',tasks:filteredPaged}]

  if(isLoading) return <Layout title="Backlog D3X+"><Spinner/></Layout>

  return (
    <Layout>
      {/* ── Page topbar ── */}
      <div className="page-topbar -mx-3 -mt-3 mb-4 px-3 md:-mx-5 md:-mt-5 md:mb-5 md:px-5 gap-y-2">
        <PageTitle icon={<List size={15}/>} label="Backlog" />
        <ToggleGroup value={groupBy} onChange={setGroupBy} className="shrink-0" options={[
          { key: 'epic',  label: 'Par Epic',  icon: <BookOpen size={11}/> },
          { key: 'jalon', label: 'Par Jalon - Incrément majeur', icon: <Target size={11}/> },
          { key: 'none',  label: 'Aucun',     icon: <AlignJustify size={11}/> },
        ]} />
        <span className="text-xs text-subtle ml-auto shrink-0">{filtered.length} US · {totalEffort}j</span>
      </div>

      <div className="flex gap-4 h-full">
        <div className="flex-1 min-w-0 flex flex-col gap-3">

          {/* ── Search + Filtres ── */}
          <div className="flex items-center gap-2">
            <div className="ds-searchbar flex-1">
              <Search size={13} className="text-subtle shrink-0"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher ID, titre…"/>
              {search&&<button onClick={()=>setSearch('')}><X size={12} className="text-subtle"/></button>}
            </div>
            <button onClick={()=>setShowFilters(v=>!v)}
              className={cn('relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shrink-0',
                showFilters?'bg-brand text-white border-navy':'bg-card text-subtle border-border hover:text-navy')}>
              <SlidersHorizontal size={13}/>
              Filtres
              {!showFilters && hasFilters && (
                <span className="absolute -top-1.5 -right-1.5 bg-indigo-500 text-white text-[11px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* ── Filtres chips ── */}
          {showFilters && <div className="bg-bg border border-border rounded-xl p-3 flex flex-col gap-2">
            {/* Epics */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="ds-label w-12 shrink-0">Epic</span>
              <div className="flex gap-1.5 flex-wrap">
                {epicList.map(epic=>(
                  <Chip key={epic} label={epicCode(epic)} active={selEpics.includes(epic)}
                    onClick={()=>setSelEpics(prev=>toggle(prev,epic))}
                    activeBg={EPIC_COLORS[epic] ?? '#6366F1'} activeText="#fff"/>
                ))}
              </div>
            </div>
            {/* Jalon + Statut */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="ds-label shrink-0">Jalon - Incrément majeur</span>
                <div className="flex gap-1.5">
                  {JALON_LIST.map(j=>(
                    <Chip key={j} label={j} active={selJalons.includes(j)}
                      onClick={()=>setSelJalons(prev=>toggle(prev,j))}/>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="ds-label w-12 shrink-0">Statut</span>
                <div className="flex gap-1.5 flex-wrap">
                  {STATUTS.map(s=>{const sc=STATUT_COLORS[s]; return (
                    <Chip key={s} label={s} active={selStatuts.includes(s)}
                      onClick={()=>setSelStatuts(prev=>toggle(prev,s))}
                      activeBg={sc.bg} activeText={sc.text}/>
                  )})}
                </div>
              </div>
            </div>
            {/* MoSCoW + Type + Reset */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="ds-label w-12 shrink-0">MoSCoW</span>
                <div className="flex gap-1.5 flex-wrap">
                  {MOSCOWS.map(m=>(
                    <Chip key={m} label={m.replace(' Have','')} active={selMoscows.includes(m)}
                      onClick={()=>setSelMoscows(prev=>toggle(prev,m))}/>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="ds-label w-12 shrink-0">Type</span>
                <div className="flex gap-1.5 flex-wrap">
                  {TYPES_FN.map(tf=>(
                    <Chip key={tf} label={tf.replace('Fonction ','')} active={selTypes.includes(tf)}
                      onClick={()=>setSelTypes(prev=>toggle(prev,tf))}/>
                  ))}
                </div>
              </div>
              {hasFilters ? (
                <button onClick={resetAll} className="ml-auto ds-btn ds-btn-sm flex items-center gap-1">
                  <X size={11}/> Réinitialiser
                </button>
              ):null}
            </div>
          </div>}

          {/* ── Table ── */}
          <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden">
            <table className="ds-table" style={{minWidth:'860px'}}>
              <thead>
                <tr>
                  {['ID','Titre','Type','Sprint','MoSCoW','Statut','Effort','Jalon - Incrément majeur','Équipe'].map(h=>(
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map(group=>(
                  <React.Fragment key={group.key}>
                    {groupBy!=='none'&&(
                      <tr className="group-row">
                        <td colSpan={9}>
                          <div className="flex items-center gap-2">
                            {groupBy==='epic'&&<div className="w-2 h-2 rounded-sm" style={{background:EPIC_COLORS[group.key]??'#4A4CC8'}}/>}
                            {groupBy==='epic'?epicShortName(group.key):`Jalon - Incrément majeur ${group.key}`}
                            <span className="text-subtle font-normal text-xs ml-1">
                              {group.tasks.length} US · {group.tasks.reduce((s,t)=>s+effJ(t),0)}j
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {group.tasks.map(t=>{
                      const subs=childMap[t.id_tache]??[]
                      const isClosed=closedSprints.includes(t.sprint??'')
                      const isExp=expanded.includes(t.id_tache)
                      const spDisplay=(t.sprint_debut&&t.sprint_fin&&t.sprint_debut!==t.sprint_fin)
                        ?`${t.sprint_debut}→${t.sprint_fin}`:(t.sprint_debut||t.sprint||'—')
                      return (
                        <React.Fragment key={t.id_tache}>
                          <tr onClick={()=>setPanelTask(t)}
                            className={cn('cursor-pointer',isClosed&&'opacity-60',panelTask?.id_tache===t.id_tache&&'!bg-indigo-50')}>
                            <td className="font-semibold text-indigo-600 whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                {isClosed&&<Lock size={9} className="text-subtle"/>}
                                {t.id_tache}
                                {subs.length>0&&(
                                  <button onClick={e=>{e.stopPropagation();setExpanded(prev=>prev.includes(t.id_tache)?prev.filter(x=>x!==t.id_tache):[...prev,t.id_tache])}}
                                    className="text-subtle hover:text-indigo-600">
                                    {isExp?<ChevronDown size={11}/>:<ChevronRight size={11}/>}
                                  </button>
                                )}
                                {subs.length>0&&<span className="bg-indigo-100 text-indigo-600 px-1 rounded text-xs font-semibold">{subs.filter(s=>s.statut==='Fait').length}/{subs.length}</span>}
                              </div>
                            </td>
                            <td className="max-w-[200px]"><div className="truncate font-medium">{t.titre}</div></td>
                            <td>{t.type_fonction?<TypeFonctionBadge value={t.type_fonction}/>:'—'}</td>
                            <td className="text-subtle whitespace-nowrap">{spDisplay}</td>
                            <td>{t.moscow?<MoscowBadge value={t.moscow}/>:'—'}</td>
                            <td><StatutBadge value={t.statut}/></td>
                            <td className="text-center text-slate-600 font-semibold whitespace-nowrap">
                              {subs.length > 0
                                ? <span title="Somme des sous-tâches">∑ {effJ(t)}j</span>
                                : <>{t.effort_j??0}j</>}
                            </td>
                            <td className="text-center">{t.jalon?<JalonBadge value={t.jalon}/>:'—'}</td>
                            <td className="text-subtle truncate max-w-[100px]">{t.equipe||'—'}</td>
                          </tr>
                          {isExp&&subs.map(s=>(
                            <tr key={s.id_tache} className="!bg-bg/50">
                              <td className="pl-8 text-subtle">↳ {s.id_tache}</td>
                              <td className="italic text-subtle">{s.titre}</td>
                              <td colSpan={5}/>
                              <td><StatutBadge value={s.statut}/></td>
                              <td className="text-center text-subtle">{s.effort_j??0}j</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      )
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            {!filtered.length&&<EmptyState message="Aucune US trouvée" icon="📋"/>}
          {totalPages>1&&(
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-subtle">
                {Math.min((page-1)*PAGE_SIZE+1,filtered.length)}–{Math.min(page*PAGE_SIZE,filtered.length)} sur {filtered.length} US
              </span>
              <div className="flex gap-1">
                <button disabled={page===1} onClick={()=>setPage(p=>p-1)} className="ds-btn ds-btn-sm disabled:opacity-40">←</button>
                {Array.from({length:totalPages},(_,i)=>i+1).map(p=>(
                  <button key={p} onClick={()=>setPage(p)}
                    className={p===page?'ds-btn-primary ds-btn-sm':'ds-btn ds-btn-sm'}>{p}</button>
                ))}
                <button disabled={page===totalPages} onClick={()=>setPage(p=>p+1)} className="ds-btn ds-btn-sm disabled:opacity-40">→</button>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Panel détail */}
        {panelTask&&(
          <div className="w-96 shrink-0 animate-in">
            <div className="ds-card sticky top-0 flex flex-col gap-3 max-h-[calc(100vh-100px)] overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-600">{panelTask.id_tache}</span>
                <button onClick={()=>setPanelTask(null)} className="p-1 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-navy transition-colors"><X size={13}/></button>
              </div>
              <h3 className="text-sm font-semibold text-navy leading-snug">{panelTask.titre}</h3>
              <div className="flex flex-wrap gap-1.5">
                <StatutBadge value={panelTask.statut}/>
                {panelTask.moscow&&<MoscowBadge value={panelTask.moscow}/>}
                {panelTask.priorite&&<PrioBadge value={panelTask.priorite}/>}
                {panelTask.type_fonction&&<TypeFonctionBadge value={panelTask.type_fonction}/>}
              </div>
              {panelTask.description&&<div><div className="ds-label mb-1">User Story</div><p className="text-xs text-navy leading-relaxed whitespace-pre-line">{panelTask.description}</p></div>}
              {/* Critères d'acceptation — éditables avec checkboxes (lecteur = lecture seule) */}
              <div>
                <div className="ds-label mb-2">Critères d'acceptation</div>
                <CriteresEditor
                  items={parseCriteres(panelTask.criteres)}
                  readOnly={!canWrite(panelTask.produit_id ?? -1)}
                  onChange={(items: CritereItem[]) =>
                    updateTache.mutate({
                      id_tache: panelTask.id_tache,
                      updates: { criteres: serializeCriteres(items) },
                    })
                  }
                />
              </div>
              {panelTask.lien_dod&&<div><div className="ds-label mb-1">Lien DoD</div><span className="text-xs text-indigo-600 font-medium">{panelTask.lien_dod}</span></div>}
              {panelTask.commentaire&&<div><div className="ds-label mb-1">Commentaire</div><p className="text-xs text-subtle italic">{panelTask.commentaire}</p></div>}
              <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border">
                {[['Équipe',panelTask.equipe],['Métier',panelTask.metier],['Jalon - Incrément majeur',panelTask.jalon],['Sprint',panelTask.sprint||panelTask.sprint_debut],['Effort',panelTask.effort_j?`${panelTask.effort_j}j`:null],['Itération',panelTask.iteration]].map(([k,v])=>v?(
                  <div key={String(k)}><div className="text-subtle">{k}</div><div className="font-semibold text-navy">{String(v)}</div></div>
                ):null)}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
