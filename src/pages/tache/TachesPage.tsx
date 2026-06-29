import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Spinner } from '@/components/ui/Spinner'
import { StatutBadge, EpicBadge, MoscowBadge, JalonBadge, PrioBadge } from '@/components/ui/Badge'
import { useTaches, useCreateTache, useUpdateTache, useDeleteTache, useCreateSousTache } from '@/hooks/useTaches'
import { useSprintActif, useClosedSprints } from '@/hooks/useSprints'
import { useEquipes, useUtilisateurs } from '@/hooks/useEquipes'
import { useAutoMetiers } from '@/hooks/useAutoMetiers'
import { useToast } from '@/hooks/useToast'
import { confirm } from '@/components/ui/ConfirmModal'
import { EPIC_LIST, JALON_LIST, MOSCOW_LIST, SPRINTS_LIST, METIERS_DEFAULT } from '@/constants'
import { Search, Lock, Plus, Copy, Trash2, Edit2, ChevronRight, ChevronDown, X, CornerDownRight } from 'lucide-react'
import { cn, parseCriteres, serializeCriteres, hasPendingCriteres } from '@/lib/utils'
import type { CritereItem } from '@/lib/utils'
import { CriteresEditor } from '@/components/ui/CriteresEditor'
import type { Tache, Statut } from '@/types'

type TabKey = 'add'|'edit'|'dup'|'del'
const TABS:{key:TabKey;label:string;icon:React.ReactNode}[] = [
  {key:'add', label:'Ajouter',   icon:<Plus size={13}/>},
  {key:'edit',label:'Modifier',  icon:<Edit2 size={13}/>},
  {key:'dup', label:'Dupliquer', icon:<Copy size={13}/>},
  {key:'del', label:'Supprimer', icon:<Trash2 size={13}/>},
]

function Label({children}:{children:React.ReactNode}) {
  return <label className="ds-label mb-1 block">{children}</label>
}
function Grp({label,children,col2}:{label:React.ReactNode;children:React.ReactNode;col2?:boolean}) {
  return <div className={col2?'col-span-2':''}>
    <Label>{label}</Label>{children}
  </div>
}

export default function TachesPage() {
  const [params] = useSearchParams()
  const [tab,setTab] = useState<TabKey>('add')
  useEffect(()=>{
    const t=params.get('tab') as TabKey
    setTab(t&&['add','edit','dup','del'].includes(t)?t:'add')
  },[params])

  const {data:taches=[],isLoading} = useTaches()
  const {data:sprintActif}          = useSprintActif()
  const {data:closedSprints=[]}     = useClosedSprints()
  const {data:equipes=[]}           = useEquipes()
  const {data:membres=[]}           = useUtilisateurs()
  const createTache  = useCreateTache()
  const updateTache  = useUpdateTache()
  const deleteTache  = useDeleteTache()
  const createSub    = useCreateSousTache()
  const toast        = useToast()

  if(isLoading) return <Layout><Spinner/></Layout>
  const parents = taches.filter(t=>!t.parent_id)
  const equipeNoms = equipes.filter(e=>e.actif).map(e=>e.nom)
  const membresActifs = membres.filter(m=>m.actif)

  return (
    <Layout>
      <div className="page-topbar -mx-3 -mt-3 mb-3 px-3 md:-mx-5 md:-mt-5 md:mb-5 md:px-5">
        <div className="flex gap-0.5 bg-bg border border-border rounded-lg p-0.5">
          {TABS.map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all',
                tab===t.key?'bg-white shadow-sm text-navy':'text-subtle hover:text-navy')}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>
      {tab==='add' &&<AddTab  sprintActif={sprintActif?.numero} equipeNoms={equipeNoms} membresActifs={membresActifs} equipes={equipes.filter(e=>e.actif)} createTache={createTache} createSub={createSub} updateTache={updateTache} parents={parents} allTaches={taches} toast={toast} initTitre={params.get('titre')??''} initParentId={params.get('parent_id')??''}/>}
      {tab==='edit'&&<EditTab taches={taches} parents={parents} allTaches={taches} closedSprints={closedSprints} equipeNoms={equipeNoms} membresActifs={membresActifs} equipes={equipes.filter(e=>e.actif)} updateTache={updateTache} createSub={createSub} toast={toast}/>}
      {tab==='dup' &&<DupTab  parents={parents} closedSprints={closedSprints} createTache={createTache} taches={taches} toast={toast}/>}
      {tab==='del' &&<DelTab  parents={parents} deleteTache={deleteTache} toast={toast}/>}
    </Layout>
  )
}

import type { Equipe } from '@/types'
import type { UserProfile } from '@/contexts/AuthContext'

function AddTab({sprintActif,equipeNoms,membresActifs,equipes,createTache,createSub,updateTache,parents,allTaches,toast,initTitre='',initParentId=''}:{
  sprintActif?:string;equipeNoms:string[];membresActifs:UserProfile[];equipes:Equipe[];parents:Tache[];allTaches:Tache[]
  createTache:ReturnType<typeof useCreateTache>;createSub:ReturnType<typeof useCreateSousTache>;updateTache:ReturnType<typeof useUpdateTache>
  toast:ReturnType<typeof useToast>;initTitre?:string;initParentId?:string
}) {
  const mkBlank=()=>({epic:'',jalon:'',titre:initTitre,description:'',lien_dod:'',commentaire:'',
    sprint_debut:sprintActif??'',sprint_fin:'',moscow:'Must Have',priorite:'P2',effort_j:0,
    equipe:'',metier:'',type_fonction:'Fonction principale',type_tache:'Tâche',assigne_a:''})

  // champs "contextuels" à conserver d'une tâche vers une autre
  function commonFields(t:Tache){return{
    epic:t.epic??'',jalon:t.jalon??'',equipe:t.equipe??'',moscow:t.moscow??'Must Have',
    priorite:t.priorite??'P2',sprint_debut:t.sprint_debut||t.sprint||'',sprint_fin:t.sprint_fin??'',
    type_fonction:t.type_fonction??'Fonction principale',metier:t.metier??'',assigne_a:t.assigne_a??'',
  }}

  const [form,setForm]=useState(mkBlank)
  const [critereItems,setCritereItems]=useState<CritereItem[]>([])
  const [parentId,setParentId]=useState(initParentId)
  const [editTask,setEditTask]=useState<Tache|null>(null)
  const [confirmNew,setConfirmNew]=useState(false)  // question "repartir de cette tâche ?"
  const [search,setSearch]=useState('')
  const [expanded,setExpanded]=useState<string[]>([])
  const set=(k:string)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>setForm(f=>({...f,[k]:e.target.value}))

  const childMap=useMemo(()=>{
    const m:Record<string,Tache[]>={}
    allTaches.filter(t=>t.parent_id).forEach(c=>{if(!m[c.parent_id!])m[c.parent_id!]=[]; m[c.parent_id!].push(c)})
    return m
  },[allTaches])

  const filteredParents=useMemo(()=>parents.filter(t=>{
    if(!search) return true
    const q=search.toLowerCase()
    return t.titre.toLowerCase().includes(q)||t.id_tache.toLowerCase().includes(q)||(t.epic??'').toLowerCase().includes(q)
  }),[parents,search])

  function setMembre(tri:string){
    const m=membresActifs.find(x=>x.trigramme===tri)
    const eq=m?.equipe_id?equipes.find(e=>e.id===m.equipe_id):null
    setForm(f=>({...f,assigne_a:tri,equipe:eq?.nom??f.equipe}))
  }

  function selectTask(t:Tache){
    setEditTask(t);setConfirmNew(false)
    setParentId(t.parent_id??'')
    setCritereItems(parseCriteres(t.criteres))
    setForm({
      epic:t.epic??'',jalon:t.jalon??'',titre:t.titre,description:t.description??'',
      lien_dod:t.lien_dod??'',commentaire:t.commentaire??'',
      sprint_debut:t.sprint_debut||t.sprint||'',sprint_fin:t.sprint_fin??'',
      moscow:t.moscow??'Must Have',priorite:t.priorite??'P2',effort_j:t.effort_j??0,
      equipe:t.equipe??'',metier:t.metier??'',type_fonction:t.type_fonction??'Fonction principale',
      type_tache:t.type_tache??'Tâche',assigne_a:t.assigne_a??'',
    })
    window.scrollTo({top:0,behavior:'smooth'})
  }

  function reset(){setForm(mkBlank());setCritereItems([]);setParentId('');setEditTask(null);setConfirmNew(false)}

  // Sous-tâche depuis tâche en cours : pré-remplit les champs communs de la parente
  function startSubtask(parent:Tache){
    setEditTask(null);setConfirmNew(false)
    setParentId(parent.id_tache)
    setForm({...mkBlank(),...commonFields(parent),titre:''})
    window.scrollTo({top:0,behavior:'smooth'})
  }

  async function submit(e:React.FormEvent){
    e.preventDefault()
    if(!form.titre){toast('Le titre est obligatoire','error');return}
    const payload={...form,criteres:serializeCriteres(critereItems),effort_j:+form.effort_j,sprint:form.sprint_debut} as Partial<Tache>
    if(editTask){
      await updateTache.mutateAsync({id_tache:editTask.id_tache,updates:payload})
      toast(`✅ ${editTask.id_tache} modifiée`)
      setEditTask(null)
    } else if(parentId){
      const res=await createSub.mutateAsync({parentId,payload})
      toast(`✅ ${res.id_tache} créée`)
      reset()
    } else {
      const res=await createTache.mutateAsync(payload)
      toast(`✅ ${res.id_tache} créée`)
      reset()
    }
  }

  const isEditing=!!editTask
  const isPending=createTache.isPending||createSub.isPending||updateTache.isPending

  return (
    <div className="flex flex-col gap-4">
      {/* ── Modal "Nouvelle tâche" ── */}
      {confirmNew&&editTask&&(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={()=>setConfirmNew(false)}>
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm p-6 animate-in"
            onClick={e=>e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-sm font-bold text-navy">Nouvelle tâche</h3>
              <button onClick={()=>setConfirmNew(false)} className="text-subtle hover:text-navy p-1"><X size={14}/></button>
            </div>
            <p className="text-xs text-subtle leading-relaxed mb-5">
              Repartir des paramètres de <span className="font-semibold text-purple">{editTask.id_tache}</span> (Epic, Sprint, Équipe…) ou démarrer avec une tâche entièrement vierge ?
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={reset} className="ds-btn ds-btn-sm">Tâche vierge</button>
              <button
                onClick={()=>{setForm(f=>({...f,...commonFields(editTask),titre:''}));setParentId('');setEditTask(null);setConfirmNew(false)}}
                className="ds-btn-primary ds-btn-sm">
                Repartir de cette tâche
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Formulaire ── */}
      <div className={cn('ds-card',isEditing&&'ring-2 ring-purple/30')}>
        <div className="ds-card-title mb-4">
          {isEditing ? <><span className="text-purple">{editTask.id_tache}</span> — Modifier la tâche</>
            : parentId ? <>Nouvelle sous-tâche <span className="text-subtle font-normal">de {parentId}</span></>
            : 'Nouvelle US / Tâche'}
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {/* Ligne 1 : tâche parente + epic + jalon + MoSCoW + priorité */}
          <div className="grid grid-cols-5 gap-4">
            <Grp label={<>Tâche parente <span className="font-normal text-subtle/60">(vide = principale)</span></>}>
              <select value={parentId} onChange={e=>setParentId(e.target.value)} className="ds-select" disabled={isEditing}>
                <option value="">— Principale —</option>
                {parents.map(p=><option key={p.id_tache} value={p.id_tache}>{p.id_tache} — {p.titre}</option>)}
              </select>
            </Grp>
            <Grp label="Epic"><select value={form.epic} onChange={set('epic')} className="ds-select"><option value="">--</option>{EPIC_LIST.map(e=><option key={e} value={e}>{e}</option>)}</select></Grp>
            <Grp label="Jalon"><select value={form.jalon} onChange={set('jalon')} className="ds-select"><option value="">--</option>{JALON_LIST.map(j=><option key={j}>{j}</option>)}</select></Grp>
            <Grp label="MoSCoW"><select value={form.moscow} onChange={set('moscow')} className="ds-select">{MOSCOW_LIST.map(m=><option key={m}>{m}</option>)}</select></Grp>
            <Grp label="Priorité"><select value={form.priorite} onChange={set('priorite')} className="ds-select"><option value="">--</option>{['P1','P2','P3','P4'].map(p=><option key={p}>{p}</option>)}</select></Grp>
          </div>
          {/* Ligne 2 : titre */}
          <Grp label="Titre *"><input value={form.titre} onChange={set('titre')} className="ds-input" placeholder="Ex: Conception mécanique avaloir"/></Grp>
          {/* Ligne 3 : User Story + Critères */}
          <div className="grid grid-cols-2 gap-4">
            <Grp label="User Story"><textarea value={form.description} onChange={set('description')} className="ds-textarea" rows={3} placeholder="En tant que… je veux… afin de…"/></Grp>
            <Grp label="Critères d'acceptation">
              <div className="ds-input min-h-[80px] flex flex-col">
                <CriteresEditor items={critereItems} onChange={setCritereItems} />
              </div>
            </Grp>
          </div>
          {/* Ligne 4 : champs secondaires */}
          <div className="grid grid-cols-8 gap-4">
            <Grp label="Sprint début"><select value={form.sprint_debut} onChange={set('sprint_debut')} className="ds-select"><option value="">--</option>{SPRINTS_LIST.map(s=><option key={s}>{s}</option>)}</select></Grp>
            <Grp label="Sprint fin"><select value={form.sprint_fin} onChange={set('sprint_fin')} className="ds-select"><option value="">Même</option>{SPRINTS_LIST.map(s=><option key={s}>{s}</option>)}</select></Grp>
            <Grp label="Effort (j)"><input type="number" value={form.effort_j} onChange={set('effort_j')} className="ds-input" min={0} step={0.5}/></Grp>
            <Grp label="Assigné à">
              <select value={form.assigne_a} onChange={e=>setMembre(e.target.value)} className="ds-select">
                <option value="">-- Membre --</option>
                {membresActifs.filter(m=>m.trigramme).map(m=><option key={m.user_id} value={m.trigramme!}>{m.trigramme} — {m.prenom??''} {m.nom??''}</option>)}
              </select>
            </Grp>
            <Grp label="Équipe"><select value={form.equipe} onChange={set('equipe')} className="ds-select"><option value="">--</option>{equipeNoms.map(e=><option key={e} value={e}>{e}</option>)}</select></Grp>
            <Grp label="Thème"><select value={form.metier} onChange={set('metier')} className="ds-select"><option value="">--</option>{METIERS_DEFAULT.map(m=><option key={m}>{m}</option>)}</select></Grp>
            <Grp label="Type de fonction"><select value={form.type_fonction} onChange={set('type_fonction')} className="ds-select">{['Fonction principale','Fonction secondaire','Fonction support','Fonction exclue'].map(f=><option key={f}>{f}</option>)}</select></Grp>
            <Grp label="Lien DoD"><input value={form.lien_dod} onChange={set('lien_dod')} className="ds-input" placeholder="F1.1…"/></Grp>
          </div>
          {/* Ligne 5 : commentaire + boutons */}
          <div className="grid grid-cols-2 gap-4 items-end">
            <Grp label="Commentaire PO"><textarea value={form.commentaire} onChange={set('commentaire')} className="ds-textarea" rows={2}/></Grp>
            <div className="flex gap-2 pb-0.5 flex-wrap">
              <button type="submit" className={cn('ds-btn-primary',isEditing&&'bg-purple border-purple')} disabled={isPending}>
                {isEditing ? '💾 Modifier' : '✅ Créer'}
              </button>
              {isEditing&&(
                <button type="button" onClick={()=>startSubtask(editTask)}
                  className="ds-btn flex items-center gap-1 text-purple border-purple/40 hover:bg-purple/5">
                  <CornerDownRight size={12}/> Sous-tâche
                </button>
              )}
              {isEditing&&(
                <button type="button" onClick={()=>setConfirmNew(true)} className="ds-btn flex items-center gap-1">
                  <Plus size={12}/> Nouvelle tâche
                </button>
              )}
              <button type="button" className="ds-btn" onClick={reset}>
                {isEditing ? '✕ Annuler' : '↺ Réinitialiser'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* ── Vue backlog ── */}
      <div className="ds-card p-0 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-bg/60">
          <span className="text-xs font-bold text-navy uppercase tracking-wider">Backlog existant</span>
          <div className="ds-searchbar flex-1 max-w-xs">
            <Search size={12} className="text-subtle shrink-0"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher ID, titre, epic…"/>
            {search&&<button onClick={()=>setSearch('')}><X size={11} className="text-subtle"/></button>}
          </div>
          <span className="text-xs text-subtle">{filteredParents.length} US</span>
        </div>
        <div className="overflow-x-auto">
          <table className="ds-table" style={{minWidth:'860px'}}>
            <thead>
              <tr>{['ID','Titre','Epic','Sprint','MoSCoW','Statut','Effort'].map(h=><th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filteredParents.map(t=>{
                const subs=childMap[t.id_tache]??[]
                const isExp=expanded.includes(t.id_tache)
                const isSelected=editTask?.id_tache===t.id_tache
                const spDisplay=(t.sprint_debut&&t.sprint_fin&&t.sprint_debut!==t.sprint_fin)
                  ?`${t.sprint_debut}→${t.sprint_fin}`:(t.sprint_debut||t.sprint||'—')
                const effJ=subs.length>0?subs.reduce((s,c)=>s+(c.effort_j??0),0):t.effort_j??0
                return (
                  <React.Fragment key={t.id_tache}>
                    <tr onClick={()=>selectTask(t)} className={cn('cursor-pointer',isSelected&&'!bg-purple/10 ring-1 ring-inset ring-purple/30')}>
                      <td className="font-semibold text-purple whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {t.id_tache}
                          {subs.length>0&&(
                            <button onClick={e=>{e.stopPropagation();setExpanded(prev=>prev.includes(t.id_tache)?prev.filter(x=>x!==t.id_tache):[...prev,t.id_tache])}}
                              className="text-subtle hover:text-purple">
                              {isExp?<ChevronDown size={11}/>:<ChevronRight size={11}/>}
                            </button>
                          )}
                          {subs.length>0&&<span className="bg-purple/10 text-purple px-1 rounded text-[10px] font-semibold">{subs.filter(s=>s.statut==='Fait').length}/{subs.length}</span>}
                        </div>
                      </td>
                      <td className="max-w-[280px]"><div className="truncate font-medium">{t.titre}</div></td>
                      <td className="text-subtle text-xs">{t.epic||'—'}</td>
                      <td className="text-subtle whitespace-nowrap">{spDisplay}</td>
                      <td>{t.moscow?<MoscowBadge value={t.moscow}/>:'—'}</td>
                      <td><StatutBadge value={t.statut}/></td>
                      <td className="text-center text-blue font-semibold whitespace-nowrap">
                        {subs.length>0?<span title="Somme sous-tâches">∑ {effJ}j</span>:<>{effJ}j</>}
                      </td>
                    </tr>
                    {isExp&&subs.map(s=>(
                      <tr key={s.id_tache} className={cn('!bg-bg/50 cursor-pointer',isSelected&&'!bg-purple/5')} onClick={()=>selectTask(s)}>
                        <td className="pl-8 text-subtle">↳ {s.id_tache}</td>
                        <td className="italic text-subtle">{s.titre}</td>
                        <td colSpan={3}/>
                        <td><StatutBadge value={s.statut}/></td>
                        <td className="text-center text-subtle">{s.effort_j??0}j</td>
                      </tr>
                    ))}
                  </React.Fragment>
                )
              })}
              {!filteredParents.length&&(
                <tr><td colSpan={7} className="text-center text-subtle py-8 text-sm">Aucune US trouvée</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function EditTab({taches,parents,closedSprints,equipeNoms,membresActifs,equipes,updateTache,createSub,toast,allTaches}:{
  taches:Tache[];parents:Tache[];allTaches:Tache[];closedSprints:string[];equipeNoms:string[]
  membresActifs:UserProfile[];equipes:Equipe[]
  updateTache:ReturnType<typeof useUpdateTache>;createSub:ReturnType<typeof useCreateSousTache>;toast:ReturnType<typeof useToast>
}) {
  const autoMetiers = useAutoMetiers()
  const [search,setSearch]=useState('')
  const [filterStat,setFilterStat]=useState('')
  const [filterEpic,setFilterEpic]=useState('')
  const [selected,setSelected]=useState<string[]>([])
  const [panelId,setPanelId]=useState<string|null>(null)
  const [editForm,setEditForm]=useState<Record<string,unknown>>({})
  const [expanded,setExpanded]=useState<string[]>([])
  // Bulk edit : champs à appliquer sur la sélection (vide = "ne pas toucher")
  const [bulk,setBulk]=useState<Record<string,string>>({statut:'',epic:'',jalon:'',sprint_debut:'',moscow:'',equipe:'',assigne_a:'',metier:'',priorite:''})
  const setB=(k:string)=>(e:React.ChangeEvent<HTMLSelectElement>)=>setBulk(b=>({...b,[k]:e.target.value}))

  const childMap:Record<string,Tache[]>={}
  taches.filter(t=>t.parent_id).forEach(c=>{if(!childMap[c.parent_id!]) childMap[c.parent_id!]=[]; childMap[c.parent_id!].push(c)})

  const filtered=useMemo(()=>parents.filter(t=>{
    if(search&&!t.titre.toLowerCase().includes(search.toLowerCase())&&!t.id_tache.toLowerCase().includes(search.toLowerCase())) return false
    if(filterStat&&t.statut!==filterStat) return false
    if(filterEpic&&t.epic!==filterEpic) return false
    return true
  }),[parents,search,filterStat,filterEpic])

  const panelTask=panelId?taches.find(t=>t.id_tache===panelId):null

  function openPanel(t:Tache){
    const subs = childMap[t.id_tache] ?? []
    // Effort effectif : somme des sous-tâches si elles existent
    const effectiveEffort = subs.length > 0
      ? subs.reduce((s, c) => s + (c.effort_j ?? 0), 0)
      : (t.effort_j ?? 0)
    setPanelId(t.id_tache)
    setEditForm({titre:t.titre,statut:t.statut,sprint:t.sprint??'',sprint_debut:t.sprint_debut??'',sprint_fin:t.sprint_fin??'',effort_j:effectiveEffort,priorite:t.priorite??'',moscow:t.moscow??'Must Have',assigne_a:t.assigne_a??'',equipe:t.equipe??'',metier:t.metier??'',jalon:t.jalon??'',epic:t.epic??'',type_fonction:t.type_fonction??'Fonction principale',description:t.description??'',criteres:t.criteres??'',lien_dod:t.lien_dod??'',commentaire:t.commentaire??''})
  }
  function setF(k:string){return(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>setEditForm(f=>({...f,[k]:e.target.value}))}

  function setMembre(tri:string){
    const m=membresActifs.find(x=>x.trigramme===tri)
    const eq=m?.equipe_id?equipes.find(e=>e.id===m.equipe_id):null
    setEditForm(f=>({...f,assigne_a:tri,...(eq?{equipe:eq.nom}:{})}))
  }

  async function savePanel(){
    if(!panelId)return
    if(editForm.statut==='Fait' && hasPendingCriteres(String(editForm.criteres??''))){
      const ok=await confirm({title:'Critères non validés',message:'Certains critères d\'acceptation ne sont pas cochés. Clôturer la tâche quand même ?',confirmLabel:'Clôturer',variant:'danger'})
      if(!ok)return
    }
    await updateTache.mutateAsync({id_tache:panelId,updates:editForm as Partial<Tache>})
    toast(`${panelId} mis à jour`)
  }

  async function applyBulk(){
    if(!selected.length){toast('Sélectionnez des US','error');return}
    // Construire les updates : garder seulement les champs remplis
    const updates:Partial<Tache>={}
    if(bulk.statut)      updates.statut      = bulk.statut as Statut
    if(bulk.epic)        updates.epic        = bulk.epic
    if(bulk.jalon)       updates.jalon       = bulk.jalon
    if(bulk.sprint_debut){updates.sprint_debut=bulk.sprint_debut;updates.sprint=bulk.sprint_debut}
    if(bulk.moscow)      updates.moscow      = bulk.moscow as Tache['moscow']
    if(bulk.priorite)    updates.priorite    = bulk.priorite
    if(bulk.assigne_a){
      updates.assigne_a = bulk.assigne_a
      // auto-équipe depuis le membre
      const m=membresActifs.find(x=>x.trigramme===bulk.assigne_a)
      const eq=m?.equipe_id?equipes.find(e=>e.id===m.equipe_id):null
      if(eq) updates.equipe=eq.nom
    }
    if(bulk.equipe)      updates.equipe      = bulk.equipe
    if(bulk.metier)      updates.metier      = bulk.metier
    if(!Object.keys(updates).length){toast('Aucun champ sélectionné','error');return}
    for(const id of selected) await updateTache.mutateAsync({id_tache:id,updates})
    toast(`✅ ${selected.length} US mises à jour`)
    setSelected([])
    setBulk({statut:'',epic:'',jalon:'',sprint_debut:'',moscow:'',equipe:'',assigne_a:'',metier:'',priorite:''})
  }

  return (
    <div className="flex gap-4">
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="ds-searchbar flex-1">
            <Search size={13} className="text-subtle"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher…"/>
            {search&&<button onClick={()=>setSearch('')}><X size={12} className="text-subtle"/></button>}
          </div>
          <select value={filterStat} onChange={e=>setFilterStat(e.target.value)} className="ds-select w-32 text-xs py-1.5">
            <option value="">Tous statuts</option>{['À faire','En cours','Fait','Bloqué'].map(s=><option key={s}>{s}</option>)}
          </select>
          <select value={filterEpic} onChange={e=>setFilterEpic(e.target.value)} className="ds-select w-36 text-xs py-1.5">
            <option value="">Tous Epics</option>{EPIC_LIST.map(e=><option key={e} value={e}>{e.split(' — ')[0]}</option>)}
          </select>
          <button
            onClick={async()=>{
              try{
                const {updated,errors}=await autoMetiers.run(allTaches,true)
                toast(`🤖 ${updated} US classifiées${errors.length?` · ${errors.length} erreur(s)`:''}`)
                if(errors.length) console.warn('Auto-métiers erreurs:',errors)
              }catch(e){toast(String(e),'error')}
            }}
            disabled={autoMetiers.isPending}
            title="Classifier automatiquement le métier des US sans métier via Claude"
            className="ds-btn ds-btn-sm flex items-center gap-1.5 whitespace-nowrap">
            {autoMetiers.isPending
              ? `🤖 ${autoMetiers.progress?.done??0}/${autoMetiers.progress?.total??'?'}`
              : '🤖 Auto-métiers'}
          </button>
        </div>
        {selected.length>0&&(
          <div className="bg-purple/5 border border-purple/20 rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-purple">{selected.length} US sélectionnée(s) — appliquer à toutes :</span>
              <button onClick={()=>setSelected([])} className="text-subtle hover:text-red transition-colors"><X size={13}/></button>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <select value={bulk.statut} onChange={setB('statut')} className="ds-select text-xs py-1 w-32">
                <option value="">Statut…</option>{['À faire','En cours','Fait','Bloqué'].map(s=><option key={s}>{s}</option>)}
              </select>
              <select value={bulk.priorite} onChange={setB('priorite')} className="ds-select text-xs py-1 w-24">
                <option value="">Priorité…</option>{['P1','P2','P3','P4'].map(p=><option key={p}>{p}</option>)}
              </select>
              <select value={bulk.moscow} onChange={setB('moscow')} className="ds-select text-xs py-1 w-36">
                <option value="">MoSCoW…</option>{MOSCOW_LIST.map(m=><option key={m}>{m}</option>)}
              </select>
              <select value={bulk.epic} onChange={setB('epic')} className="ds-select text-xs py-1 w-40">
                <option value="">Epic…</option>{EPIC_LIST.map(e=><option key={e} value={e}>{e.split(' — ')[0]}</option>)}
              </select>
              <select value={bulk.jalon} onChange={setB('jalon')} className="ds-select text-xs py-1 w-24">
                <option value="">Jalon…</option>{JALON_LIST.map(j=><option key={j}>{j}</option>)}
              </select>
              <select value={bulk.sprint_debut} onChange={setB('sprint_debut')} className="ds-select text-xs py-1 w-32">
                <option value="">Sprint…</option>{SPRINTS_LIST.map(s=><option key={s}>{s}</option>)}
              </select>
              <select value={bulk.assigne_a} onChange={setB('assigne_a')} className="ds-select text-xs py-1 w-44">
                <option value="">Assigné…</option>{membresActifs.filter(m=>m.trigramme).map(m=><option key={m.user_id} value={m.trigramme!}>{m.trigramme} — {m.prenom??''} {m.nom??''}</option>)}
              </select>
              <select value={bulk.equipe} onChange={setB('equipe')} className="ds-select text-xs py-1 w-36">
                <option value="">Équipe…</option>{equipeNoms.map(e=><option key={e} value={e}>{e}</option>)}
              </select>
              <select value={bulk.metier} onChange={setB('metier')} className="ds-select text-xs py-1 w-36">
                <option value="">Thème…</option>{METIERS_DEFAULT.map(m=><option key={m}>{m}</option>)}
              </select>
              <button onClick={applyBulk} disabled={updateTache.isPending}
                className="ds-btn-primary ds-btn-sm whitespace-nowrap ml-auto">
                ✓ Appliquer
              </button>
            </div>
          </div>
        )}
        <div className="bg-white border border-border rounded-xl overflow-x-auto">
          <table className="ds-table" style={{minWidth:'1400px'}}>
            <thead><tr>
              <th className="w-8 shrink-0"><input type="checkbox" className="accent-purple"
                onChange={e=>setSelected(e.target.checked?filtered.map(t=>t.id_tache):[])}
                checked={selected.length===filtered.length&&filtered.length>0}/></th>
              <th>ID</th>
              <th>Titre</th>
              <th>Statut</th>
              <th>Priorité</th>
              <th>MoSCoW</th>
              <th>Epic</th>
              <th>Jalon</th>
              <th>Sprint</th>
              <th>Assigné</th>
              <th>Équipe</th>
              <th>Thème</th>
              <th>Actions</th>
            </tr></thead>
            <tbody>
              {filtered.map(t=>{
                const subs=childMap[t.id_tache]??[]
                const isClosed=closedSprints.includes(t.sprint??'')
                const isExp=expanded.includes(t.id_tache)
                const spDisplay=(t.sprint_debut&&t.sprint_fin&&t.sprint_debut!==t.sprint_fin)
                  ?`${t.sprint_debut}→${t.sprint_fin}`:(t.sprint_debut||t.sprint||'—')
                return (
                  <React.Fragment key={t.id_tache}>
                    <tr className={cn('cursor-pointer',selected.includes(t.id_tache)&&'bg-purple/5',panelId===t.id_tache&&'!bg-purple/10')}
                      onClick={()=>openPanel(t)}>
                      <td onClick={e=>e.stopPropagation()}>
                        <input type="checkbox" checked={selected.includes(t.id_tache)} className="accent-purple"
                          onChange={e=>setSelected(prev=>e.target.checked?[...prev,t.id_tache]:prev.filter(x=>x!==t.id_tache))}/>
                      </td>
                      <td className="font-semibold text-purple whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {isClosed&&<Lock size={9} className="text-subtle"/>}
                          {t.id_tache}
                          {subs.length>0&&(
                            <button onClick={e=>{e.stopPropagation();setExpanded(prev=>prev.includes(t.id_tache)?prev.filter(x=>x!==t.id_tache):[...prev,t.id_tache])}} className="text-subtle hover:text-purple">
                              {isExp?<ChevronDown size={11}/>:<ChevronRight size={11}/>}
                            </button>
                          )}
                          {subs.length>0&&<span className="bg-purple/10 text-purple px-1 rounded text-xs font-semibold">{subs.filter(s=>s.statut==='Fait').length}/{subs.length}</span>}
                        </div>
                      </td>
                      <td className="max-w-[200px]"><div className="truncate font-medium">{t.titre}</div></td>
                      <td><StatutBadge value={t.statut}/></td>
                      <td className="text-center">{t.priorite?<PrioBadge value={t.priorite}/>:<span className="text-subtle">—</span>}</td>
                      <td>{t.moscow?<MoscowBadge value={t.moscow}/>:<span className="text-subtle">—</span>}</td>
                      <td><EpicBadge value={t.epic??''}/></td>
                      <td className="text-center">{t.jalon?<JalonBadge value={t.jalon}/>:<span className="text-subtle">—</span>}</td>
                      <td className="text-subtle whitespace-nowrap text-xs">{spDisplay}</td>
                      <td className="text-xs font-semibold text-navy">{t.assigne_a||<span className="text-subtle font-normal">—</span>}</td>
                      <td className="text-xs text-subtle truncate max-w-[120px]">{t.equipe||'—'}</td>
                      <td className="text-xs text-subtle truncate max-w-[140px]">{t.metier||'—'}</td>
                      <td onClick={e=>e.stopPropagation()}>
                        {!isClosed&&!t.parent_id&&(
                          <button onClick={async()=>{const titre=window.prompt(`Titre de la sous-tâche pour ${t.id_tache} :`);if(!titre)return;const r=await createSub.mutateAsync({parentId:t.id_tache,payload:{titre,statut:'À faire'} as Partial<Tache>});toast(`${r.id_tache} créée`)}}
                            className="ds-btn ds-btn-sm">+ SS</button>
                        )}
                      </td>
                    </tr>
                    {isExp&&subs.map(s=>(
                      <tr key={s.id_tache} className="cursor-pointer !bg-bg/50" onClick={()=>openPanel(s)}>
                        <td/><td className="pl-8 text-subtle whitespace-nowrap">↳ {s.id_tache}</td>
                        <td className="italic text-subtle">{s.titre}</td>
                        <td><StatutBadge value={s.statut}/></td>
                        <td colSpan={9}/>
                      </tr>
                    ))}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {panelTask&&(
        <div className="w-80 shrink-0 animate-in">
          <div className="ds-card sticky top-0 max-h-[calc(100vh-100px)] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-purple">{panelTask.id_tache}</span>
              <button onClick={()=>setPanelId(null)} className="p-1 rounded-lg hover:bg-bg text-subtle"><X size={13}/></button>
            </div>
            <div className="flex flex-col gap-3">
              <Grp label="Titre"><input value={String(editForm.titre??'')} onChange={setF('titre')} className="ds-input text-xs"/></Grp>

              {/* Statut + Priorité */}
              <div className="grid grid-cols-2 gap-2">
                <Grp label="Statut"><select value={String(editForm.statut??'')} onChange={setF('statut')} className="ds-select text-xs">{['À faire','En cours','Fait','Bloqué'].map(s=><option key={s}>{s}</option>)}</select></Grp>
                <Grp label="Priorité"><select value={String(editForm.priorite??'')} onChange={setF('priorite')} className="ds-select text-xs"><option value="">--</option>{['P1','P2','P3','P4'].map(p=><option key={p}>{p}</option>)}</select></Grp>
              </div>

              {/* MoSCoW + Effort */}
              <div className="grid grid-cols-2 gap-2">
                <Grp label="MoSCoW"><select value={String(editForm.moscow??'')} onChange={setF('moscow')} className="ds-select text-xs">{MOSCOW_LIST.map(m=><option key={m}>{m}</option>)}</select></Grp>
                <Grp label="Effort (j)">
                  {panelTask && (childMap[panelTask.id_tache]??[]).length > 0 ? (
                    <div className="ds-input text-xs bg-bg text-navy font-semibold flex items-center gap-1.5 cursor-not-allowed">
                      <span>∑ {(childMap[panelTask.id_tache]??[]).reduce((s,c)=>s+(c.effort_j??0),0)}j</span>
                      <span className="text-[10px] text-subtle font-normal">{(childMap[panelTask.id_tache]??[]).length} ss</span>
                    </div>
                  ) : (
                    <input type="number" value={Number(editForm.effort_j??0)} onChange={setF('effort_j')} className="ds-input text-xs" min={0} step={0.5}/>
                  )}
                </Grp>
              </div>

              {/* Epic */}
              <Grp label="Epic"><select value={String(editForm.epic??'')} onChange={setF('epic')} className="ds-select text-xs"><option value="">--</option>{EPIC_LIST.map(e=><option key={e} value={e}>{e}</option>)}</select></Grp>

              {/* Type de fonction + Jalon */}
              <div className="grid grid-cols-2 gap-2">
                <Grp label="Type fonction"><select value={String(editForm.type_fonction??'')} onChange={setF('type_fonction')} className="ds-select text-xs">
                  <option value="">--</option>
                  {['Fonction principale','Fonction secondaire','Fonction support','Fonction exclue'].map(f=><option key={f}>{f}</option>)}
                </select></Grp>
                <Grp label="Jalon"><select value={String(editForm.jalon??'')} onChange={setF('jalon')} className="ds-select text-xs"><option value="">--</option>{JALON_LIST.map(j=><option key={j}>{j}</option>)}</select></Grp>
              </div>

              {/* Sprint début + fin */}
              <div className="grid grid-cols-2 gap-2">
                <Grp label="Sprint début"><select value={String(editForm.sprint_debut??'')} onChange={setF('sprint_debut')} className="ds-select text-xs"><option value="">--</option>{SPRINTS_LIST.map(s=><option key={s}>{s}</option>)}</select></Grp>
                <Grp label="Sprint fin"><select value={String(editForm.sprint_fin??'')} onChange={setF('sprint_fin')} className="ds-select text-xs"><option value="">--</option>{SPRINTS_LIST.map(s=><option key={s}>{s}</option>)}</select></Grp>
              </div>

              {/* Assigné → auto-remplit Équipe */}
              <Grp label="Assigné à">
                <select value={String(editForm.assigne_a??'')} onChange={e=>setMembre(e.target.value)} className="ds-select text-xs">
                  <option value="">-- Membre --</option>
                  {membresActifs.filter(m=>m.trigramme).map(m=><option key={m.user_id} value={m.trigramme!}>{m.trigramme} — {m.prenom??''} {m.nom??''}</option>)}
                </select>
              </Grp>

              {/* Équipe + Thème */}
              <div className="grid grid-cols-2 gap-2">
                <Grp label="Équipe"><select value={String(editForm.equipe??'')} onChange={setF('equipe')} className="ds-select text-xs"><option value="">--</option>{equipeNoms.map(e=><option key={e} value={e}>{e}</option>)}</select></Grp>
                <Grp label="Thème"><select value={String(editForm.metier??'')} onChange={setF('metier')} className="ds-select text-xs"><option value="">--</option>{METIERS_DEFAULT.map(m=><option key={m}>{m}</option>)}</select></Grp>
              </div>

              {/* Textes */}
              <Grp label="User Story"><textarea value={String(editForm.description??'')} onChange={setF('description')} className="ds-textarea text-xs" rows={3}/></Grp>
              <Grp label="Critères d'acceptation">
                <div className="ds-input min-h-[72px] flex flex-col">
                  <CriteresEditor
                    items={parseCriteres(String(editForm.criteres??''))}
                    onChange={items=>setEditForm(f=>({...f,criteres:serializeCriteres(items)}))}
                    compact
                  />
                </div>
              </Grp>
              <Grp label="Lien DoD">
                <input value={String(editForm.lien_dod??'')} onChange={setF('lien_dod')} className="ds-input text-xs" placeholder="F1.1, F1.2…"/>
                {!!editForm.lien_dod&&(
                  <div className="flex flex-wrap gap-1 mt-1">
                    {String(editForm.lien_dod).split(/[,;]/).map(s=>s.trim()).filter(Boolean).map(code=>(
                      <span key={code} className="text-xs px-2 py-0.5 rounded-full bg-blue/10 text-blue font-medium border border-blue/20">{code}</span>
                    ))}
                  </div>
                )}
              </Grp>
              <Grp label="Commentaire PO"><textarea value={String(editForm.commentaire??'')} onChange={setF('commentaire')} className="ds-textarea text-xs" rows={2}/></Grp>
            </div>
            <div className="flex gap-2 mt-3 pt-3 border-t border-border">
              <button onClick={savePanel} className="ds-btn-primary flex-1" disabled={updateTache.isPending}>✓ Sauvegarder</button>
              <button onClick={()=>setPanelId(null)} className="ds-btn">Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DupTab({parents,closedSprints,createTache,taches,toast}:{
  parents:Tache[];closedSprints:string[];createTache:ReturnType<typeof useCreateTache>
  taches:Tache[];toast:ReturnType<typeof useToast>
}) {
  const [selected,setSelected]=useState<string[]>([])
  const [targetSprint,setTargetSprint]=useState('')
  const [withSubs,setWithSubs]=useState(true)
  const [search,setSearch]=useState('')
  const childMap:Record<string,Tache[]>={}
  taches.filter(t=>t.parent_id).forEach(c=>{if(!childMap[c.parent_id!]) childMap[c.parent_id!]=[]; childMap[c.parent_id!].push(c)})
  const filtered=parents.filter(t=>!search||t.titre.toLowerCase().includes(search.toLowerCase())||t.id_tache.toLowerCase().includes(search.toLowerCase()))

  async function doDuplicate(){
    if(!selected.length){toast('Sélectionnez au moins une US','error');return}
    let count=0
    for(const id of selected){
      const t=parents.find(p=>p.id_tache===id); if(!t) continue
      const newT=await createTache.mutateAsync({...t,id:undefined,id_tache:undefined,sprint:targetSprint||'',sprint_debut:targetSprint||'',sprint_fin:targetSprint||'',statut:'À faire',iteration:(t.iteration??1)+1,commentaire:`Dupliqué depuis ${t.id_tache}`} as Partial<Tache>)
      count++
      if(withSubs){for(const s of (childMap[t.id_tache]??[])) await createTache.mutateAsync({...s,id:undefined,id_tache:undefined,parent_id:newT.id_tache,sprint:targetSprint||'',statut:'À faire',iteration:(s.iteration??1)+1} as Partial<Tache>)}
    }
    toast(`✅ ${count} US dupliquée(s)`);setSelected([])
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="ds-card flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="ds-label">Vers</span>
          <select value={targetSprint} onChange={e=>setTargetSprint(e.target.value)} className="ds-select w-40 text-xs">
            <option value="">Backlog</option>{SPRINTS_LIST.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={withSubs} onChange={e=>setWithSubs(e.target.checked)} className="accent-purple"/>
          Avec sous-tâches
        </label>
        <button onClick={doDuplicate} className="ds-btn-primary ml-auto" disabled={createTache.isPending||!selected.length}>
          ⎘ Dupliquer ({selected.length})
        </button>
      </div>
      <div className="ds-searchbar"><Search size={13} className="text-subtle"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher…"/></div>
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-bg">
          <input type="checkbox" className="accent-purple" checked={selected.length===filtered.length&&filtered.length>0}
            onChange={e=>setSelected(e.target.checked?filtered.map(t=>t.id_tache):[])}/>
          <span className="text-xs font-semibold text-subtle">Tout sélectionner ({filtered.length})</span>
        </div>
        {filtered.map(t=>{
          const subs=childMap[t.id_tache]??[]
          return (
            <label key={t.id_tache} className={cn('flex items-center gap-3 px-4 py-2.5 border-b border-border/50 cursor-pointer hover:bg-bg/50',selected.includes(t.id_tache)&&'bg-purple/5')}>
              <input type="checkbox" checked={selected.includes(t.id_tache)} className="accent-purple"
                onChange={e=>setSelected(prev=>e.target.checked?[...prev,t.id_tache]:prev.filter(x=>x!==t.id_tache))}/>
              <span className="text-xs font-semibold text-purple w-16 shrink-0">{t.id_tache}</span>
              <span className="text-xs flex-1 truncate">{t.titre}</span>
              <StatutBadge value={t.statut}/>
              {subs.length>0&&<span className="text-xs text-subtle">{subs.length} ss</span>}
              {closedSprints.includes(t.sprint??'')&&<Lock size={10} className="text-subtle"/>}
            </label>
          )
        })}
      </div>
    </div>
  )
}

function DelTab({parents,deleteTache,toast}:{parents:Tache[];deleteTache:ReturnType<typeof useDeleteTache>;toast:ReturnType<typeof useToast>}) {
  const [selected,setSelected]=useState<string[]>([])
  const [search,setSearch]=useState('')
  const filtered=parents.filter(t=>!search||t.titre.toLowerCase().includes(search.toLowerCase())||t.id_tache.toLowerCase().includes(search.toLowerCase()))

  async function doDelete(){
    if(!selected.length){toast('Sélectionnez au moins une US','error');return}
    const ok = await confirm({title:`Supprimer ${selected.length} US ?`,message:'Action irréversible. Les tâches et sous-tâches seront supprimées.',confirmLabel:'Supprimer',variant:'danger'}); if(!ok) return
    for(const id of selected) await deleteTache.mutateAsync(id)
    toast(`✅ ${selected.length} US supprimée(s)`);setSelected([])
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="ds-searchbar flex-1"><Search size={13} className="text-subtle"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher…"/></div>
        <button onClick={doDelete} className="ds-btn-danger" disabled={deleteTache.isPending||!selected.length}>🗑 Supprimer ({selected.length})</button>
      </div>
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-bg">
          <input type="checkbox" className="accent-red" checked={selected.length===filtered.length&&filtered.length>0}
            onChange={e=>setSelected(e.target.checked?filtered.map(t=>t.id_tache):[])}/>
          <span className="text-xs font-semibold text-subtle">Tout sélectionner ({filtered.length})</span>
        </div>
        {filtered.map(t=>(
          <label key={t.id_tache} className={cn('flex items-center gap-3 px-4 py-2.5 border-b border-border/50 cursor-pointer hover:bg-bg/50',selected.includes(t.id_tache)&&'bg-red/5')}>
            <input type="checkbox" checked={selected.includes(t.id_tache)} className="accent-red"
              onChange={e=>setSelected(prev=>e.target.checked?[...prev,t.id_tache]:prev.filter(x=>x!==t.id_tache))}/>
            <span className="text-xs font-semibold text-purple w-16 shrink-0">{t.id_tache}</span>
            <span className="text-xs flex-1 truncate">{t.titre}</span>
            <EpicBadge value={t.epic??''}/><StatutBadge value={t.statut}/>
          </label>
        ))}
      </div>
    </div>
  )
}
