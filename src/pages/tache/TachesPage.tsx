import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Spinner } from '@/components/ui/Spinner'
import { StatutBadge, EpicBadge, MoscowBadge, JalonBadge, PrioBadge } from '@/components/ui/Badge'
import { useTaches, useCreateTache, useUpdateTache, useDeleteTache, useCreateSousTache } from '@/hooks/useTaches'
import { useTacheDependances, useAddDependance, useRemoveDependance, isBloqueeParDependance } from '@/hooks/useTacheDependances'
import { TacheExtras } from '@/components/tache/TacheExtras'
import { useSprintActif, useClosedSprints } from '@/hooks/useSprints'
import { useEquipes, useUtilisateurs } from '@/hooks/useEquipes'
import { useToast } from '@/hooks/useToast'
import { confirm } from '@/components/ui/ConfirmModal'
import { EPIC_LIST, JALON_LIST, MOSCOW_LIST, SPRINTS_LIST, METIERS_DEFAULT } from '@/constants'
import { Search, Lock, Plus, Copy, Trash2, Edit2, ChevronRight, ChevronDown, X, CornerDownRight, FilePlus } from 'lucide-react'
import { PageTitle } from '@/components/ui/PageTitle'
import { cn, parseCriteres, serializeCriteres, hasPendingCriteres } from '@/lib/utils'
import type { CritereItem } from '@/lib/utils'
import { CriteresEditor } from '@/components/ui/CriteresEditor'
import { StatusPicker } from '@/components/ui/StatusPicker'
import { AssignPicker } from '@/components/ui/AssignPicker'
import { MentionField } from '@/components/ui/MentionField'
import { useAuth } from '@/contexts/AuthContext'
import { useProduit } from '@/contexts/ProduitContext'
import type { Tache, Statut, Equipe } from '@/types'
import type { UserProfile } from '@/contexts/AuthContext'

// ── PriorityPicker ────────────────────────────────────────────
const PRIO_CONFIG: Record<string, { idle: string; active: string }> = {
  P1: { idle: 'bg-rose-50   text-rose-500   border border-rose-200',   active: 'bg-rose-500   text-white border border-rose-500' },
  P2: { idle: 'bg-amber-50  text-amber-600  border border-amber-200',  active: 'bg-amber-400  text-white border border-amber-400' },
  P3: { idle: 'bg-indigo-50 text-indigo-500 border border-indigo-200', active: 'bg-indigo-500 text-white border border-indigo-500' },
  P4: { idle: 'bg-slate-50  text-slate-400  border border-slate-200',  active: 'bg-slate-400  text-white border border-slate-400' },
}
function PriorityPicker({ value, onChange }: { value: string; onChange: (p: string) => void }) {
  return (
    <div className="flex gap-1">
      {Object.keys(PRIO_CONFIG).map(p => (
        <button key={p} type="button" onClick={() => onChange(p)}
          className={cn('px-2.5 py-1 rounded-lg text-xs font-bold transition-all', value === p ? PRIO_CONFIG[p].active : PRIO_CONFIG[p].idle)}>
          {p}
        </button>
      ))}
    </div>
  )
}


type TabKey = 'add'|'edit'|'dup'|'del'
const TABS:{key:TabKey;label:string;icon:React.ReactNode}[] = [
  {key:'add', label:'Ajouter',   icon:<Plus size={13}/>},
  {key:'edit',label:'Modifier',  icon:<Edit2 size={13}/>},
  {key:'dup', label:'Dupliquer', icon:<Copy size={13}/>},
  {key:'del', label:'Supprimer', icon:<Trash2 size={13}/>},
]

function Label({children}:{children:React.ReactNode}) {
  return <label className="text-[11px] font-bold text-navy/75 uppercase tracking-wide mb-1 block">{children}</label>
}
function Grp({label,children,col2,className}:{label:React.ReactNode;children:React.ReactNode;col2?:boolean;className?:string}) {
  return <div className={cn(col2?'col-span-2':'',className)}>
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
  const { canWrite, user }  = useAuth()
  const { produitActif } = useProduit()
  const {data:dependances=[]} = useTacheDependances(produitActif?.id ?? null)
  const addDependance = useAddDependance()
  const removeDependance = useRemoveDependance()

  if(isLoading) return <Layout><Spinner/></Layout>
  const parents = taches.filter(t=>!t.parent_id)
  const equipeNoms = equipes.filter(e=>e.actif).map(e=>e.nom)
  const membresActifs = membres.filter(m=>m.actif)
  const canEditTasks = produitActif ? canWrite(produitActif.id) : false

  return (
    <Layout>
      <div className="page-topbar -mx-3 -mt-3 mb-3 px-3 md:-mx-5 md:-mt-5 md:mb-5 md:px-5">
        <PageTitle icon={<FilePlus size={15}/>} label="Tâches" />
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
      {!canEditTasks ? (
        <div className="ds-card flex items-center gap-2 text-sm text-subtle">
          <Lock size={14}/> Accès en lecture seule — vous n'avez pas les droits pour créer, modifier, dupliquer ou supprimer des tâches sur ce produit.
        </div>
      ) : <>
        {tab==='add' &&<AddTab  sprintActif={sprintActif?.numero} equipeNoms={equipeNoms} membresActifs={membresActifs} equipes={equipes.filter(e=>e.actif)} createTache={createTache} createSub={createSub} updateTache={updateTache} parents={parents} allTaches={taches} toast={toast} initTitre={params.get('titre')??''} initParentId={params.get('parent_id')??''}/>}
        {tab==='edit'&&<EditTab taches={taches} parents={parents} allTaches={taches} closedSprints={closedSprints} equipeNoms={equipeNoms} membresActifs={membresActifs} equipes={equipes.filter(e=>e.actif)} updateTache={updateTache} createSub={createSub} toast={toast} produitId={produitActif?.id ?? null} dependances={dependances} addDependance={addDependance} removeDependance={removeDependance} userId={user?.id ?? null} initFocusId={params.get('focus')??''}/>}
        {tab==='dup' &&<DupTab  parents={parents} closedSprints={closedSprints} createTache={createTache} taches={taches} toast={toast}/>}
        {tab==='del' &&<DelTab  parents={parents} deleteTache={deleteTache} toast={toast}/>}
      </>}
    </Layout>
  )
}

// ── SelectPicker (remplace <select> natif) ─────────────────────
interface PickerOption { value:string; label:string }
function SelectPicker({value,onChange,options,placeholder='--',searchable=false,className=''}:{
  value:string;onChange:(v:string)=>void;options:PickerOption[]
  placeholder?:string;searchable?:boolean;className?:string
}){
  const [open,setOpen]=useState(false)
  const [q,setQ]=useState('')
  const ref=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!open){setQ('');return}
    function h(e:MouseEvent){if(ref.current&&!ref.current.contains(e.target as Node)){setOpen(false);setQ('')}}
    document.addEventListener('mousedown',h)
    return()=>document.removeEventListener('mousedown',h)
  },[open])
  const filtered=q?options.filter(o=>o.label.toLowerCase().includes(q.toLowerCase())):options
  const label=options.find(o=>o.value===value)?.label
  return(
    <div className={cn('relative',className)} ref={ref}>
      <button type="button" onClick={()=>setOpen(o=>!o)}
        className="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-xs text-left hover:border-indigo-300 transition-colors">
        <span className={cn('flex-1 truncate',value?'text-navy font-medium':'text-slate-400')}>{label??placeholder}</span>
        <ChevronDown size={11} className={cn('text-slate-300 shrink-0 transition-transform',open&&'rotate-180')}/>
      </button>
      {open&&(
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden" style={{minWidth:'100%',maxWidth:'320px'}}>
          {searchable&&(
            <div className="px-2 pt-2 pb-1.5 border-b border-slate-100">
              <input autoFocus value={q} onChange={e=>setQ(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 outline-none focus:border-indigo-300"
                placeholder="Rechercher…"/>
            </div>
          )}
          <div className="overflow-y-auto" style={{maxHeight:'200px'}}>
            <button type="button" onClick={()=>{onChange('');setOpen(false)}}
              className={cn('w-full px-3 py-1.5 text-xs text-left transition-colors hover:bg-slate-50',
                !value?'text-indigo-600 bg-indigo-50 font-medium':'text-slate-400')}>
              {placeholder}
            </button>
            {filtered.map(o=>(
              <button key={o.value} type="button" onClick={()=>{onChange(o.value);setOpen(false)}}
                className={cn('w-full px-3 py-1.5 text-xs text-left transition-colors hover:bg-slate-50',
                  value===o.value?'bg-indigo-50 text-indigo-600 font-semibold':'text-navy')}>
                {o.label}
              </button>
            ))}
            {filtered.length===0&&<div className="px-3 py-3 text-xs text-slate-400 text-center italic">Aucun résultat</div>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── MoSCoWPicker ──────────────────────────────────────────────
const MOSCOW_MAP:{[k:string]:{idle:string;active:string;short:string}}={
  'Must Have':  {idle:'bg-slate-100 text-navy border-slate-300',      active:'bg-navy text-white border-navy',              short:'Must'},
  'Should Have':{idle:'bg-indigo-50 text-indigo-600 border-indigo-200',active:'bg-indigo-500 text-white border-indigo-500', short:'Should'},
  'Could Have': {idle:'bg-slate-50 text-slate-500 border-slate-200',   active:'bg-slate-400 text-white border-slate-400',   short:'Could'},
  "Won't Have": {idle:'bg-rose-50 text-rose-400 border-rose-200',      active:'bg-rose-400 text-white border-rose-400',     short:"Won't"},
}
function MoSCoWPicker({value,onChange}:{value:string;onChange:(v:string)=>void}){
  return(
    <div className="flex flex-wrap gap-1">
      {MOSCOW_LIST.map(m=>{
        const c=MOSCOW_MAP[m]??{idle:'bg-slate-50 text-slate-500 border-slate-200',active:'bg-slate-400 text-white border-slate-400',short:m}
        return(
          <button key={m} type="button" onClick={()=>onChange(m)}
            className={cn('px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border',value===m?c.active:c.idle)}>
            {c.short}
          </button>
        )
      })}
    </div>
  )
}

function AddTab({sprintActif,equipeNoms,membresActifs,equipes,createTache,createSub,updateTache,parents,allTaches,toast,initTitre='',initParentId=''}:{
  sprintActif?:string;equipeNoms:string[];membresActifs:UserProfile[];equipes:Equipe[];parents:Tache[];allTaches:Tache[]
  createTache:ReturnType<typeof useCreateTache>;createSub:ReturnType<typeof useCreateSousTache>;updateTache:ReturnType<typeof useUpdateTache>
  toast:ReturnType<typeof useToast>;initTitre?:string;initParentId?:string
}) {
  const mkBlank=()=>({epic:'',jalon:'',titre:initTitre,description:'',lien_dod:'',commentaire:'',
    sprint_debut:sprintActif??'',sprint_fin:'',moscow:'Must Have',priorite:'P2',effort_j:0,
    equipe:'',metier:'',type_fonction:'Fonction principale',type_tache:'Tâche',assigne_a:'',
    statut:'À faire' as Statut})

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
      statut:(t.statut??'À faire') as Statut,
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
              Repartir des paramètres de <span className="font-semibold text-indigo-600">{editTask.id_tache}</span> (Epic, Sprint, Équipe…) ou démarrer avec une tâche entièrement vierge ?
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
      <div className={cn('ds-card',isEditing&&'ring-2 ring-indigo-200')}>
        <div className="ds-card-title mb-4">
          {isEditing ? <><span className="text-indigo-600">{editTask.id_tache}</span> — Modifier la tâche</>
            : parentId ? <>Nouvelle sous-tâche <span className="text-subtle font-normal">de {parentId}</span></>
            : 'Nouvelle US / Tâche'}
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {/* StatusPicker affiché uniquement en mode édition */}
          {isEditing&&(
            <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="ds-label shrink-0">Statut</span>
              <div className="w-48">
                <StatusPicker value={form.statut} onChange={s=>setForm(f=>({...f,statut:s}))} />
              </div>
            </div>
          )}
          {/* Ligne 1 : tâche parente + epic + jalon + MoSCoW + priorité */}
          <div className="grid grid-cols-5 gap-4">
            <Grp label={<>Tâche parente <span className="font-normal text-subtle/60">(vide = principale)</span></>}>
              <SelectPicker value={parentId} onChange={setParentId}
                options={parents.map(p=>({value:p.id_tache,label:`${p.id_tache} — ${p.titre}`}))}
                placeholder="— Principale —" searchable className={isEditing?'opacity-50 pointer-events-none':''}/>
            </Grp>
            <Grp label="Epic">
              <SelectPicker value={form.epic} onChange={v=>setForm(f=>({...f,epic:v}))}
                options={EPIC_LIST.map(e=>({value:e,label:e}))} placeholder="-- Epic --" searchable/>
            </Grp>
            <Grp label="Jalon - Incrément majeur">
              <SelectPicker value={form.jalon} onChange={v=>setForm(f=>({...f,jalon:v}))}
                options={JALON_LIST.map(j=>({value:j,label:j}))} placeholder="-- Jalon - Incrément majeur --"/>
            </Grp>
            <Grp label="MoSCoW">
              <MoSCoWPicker value={form.moscow} onChange={v=>setForm(f=>({...f,moscow:v}))}/>
            </Grp>
            <Grp label="Priorité">
              <PriorityPicker value={form.priorite} onChange={p=>setForm(f=>({...f,priorite:p}))} />
            </Grp>
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
            <Grp label="Sprint début">
              <SelectPicker value={form.sprint_debut} onChange={v=>setForm(f=>({...f,sprint_debut:v}))}
                options={SPRINTS_LIST.map(s=>({value:s,label:s}))} placeholder="-- Sprint --"/>
            </Grp>
            <Grp label="Sprint fin">
              <SelectPicker value={form.sprint_fin} onChange={v=>setForm(f=>({...f,sprint_fin:v}))}
                options={SPRINTS_LIST.map(s=>({value:s,label:s}))} placeholder="Même sprint"/>
            </Grp>
            <Grp label="Effort (j)"><input type="number" value={form.effort_j} onChange={set('effort_j')} className="ds-input" min={0} step={0.5}/></Grp>
            <Grp label="Assigné à">
              <div className="pt-1">
                <AssignPicker value={form.assigne_a} membres={membresActifs} onAssign={setMembre} />
              </div>
            </Grp>
            <Grp label="Équipe">
              <SelectPicker value={form.equipe} onChange={v=>setForm(f=>({...f,equipe:v}))}
                options={equipeNoms.map(e=>({value:e,label:e}))} placeholder="-- Équipe --"/>
            </Grp>
            <Grp label="Thème">
              <SelectPicker value={form.metier} onChange={v=>setForm(f=>({...f,metier:v}))}
                options={METIERS_DEFAULT.map(m=>({value:m,label:m}))} placeholder="-- Thème --" searchable/>
            </Grp>
            <Grp label="Type de fonction">
              <SelectPicker value={form.type_fonction} onChange={v=>setForm(f=>({...f,type_fonction:v}))}
                options={[
                  {value:'Fonction principale',label:'Principale'},
                  {value:'Fonction secondaire',label:'Secondaire'},
                  {value:'Fonction support',label:'Support'},
                  {value:'Fonction exclue',label:'Exclue'},
                ]} placeholder="-- Type --"/>
            </Grp>
            <Grp label="Lien DoD"><input value={form.lien_dod} onChange={set('lien_dod')} className="ds-input" placeholder="F1.1…"/></Grp>
          </div>
          {/* Ligne 5 : commentaire + boutons */}
          <div className="grid grid-cols-2 gap-4 items-end">
            <Grp label="Commentaire PO">
              <MentionField as="textarea" value={form.commentaire} onChange={v=>setForm(f=>({...f,commentaire:v}))}
                membres={membresActifs} className="ds-textarea" rows={2}/>
            </Grp>
            <div className="flex gap-2 pb-0.5 flex-wrap">
              <button type="submit" className={cn('ds-btn-primary',isEditing&&'bg-indigo-600 border-indigo-600')} disabled={isPending}>
                {isEditing ? '💾 Modifier' : '✅ Créer'}
              </button>
              {isEditing&&(
                <button type="button" onClick={()=>startSubtask(editTask)}
                  className="ds-btn flex items-center gap-1 text-indigo-600 border-indigo-300 hover:bg-indigo-50">
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
                    <tr onClick={()=>selectTask(t)} className={cn('cursor-pointer',isSelected&&'!bg-indigo-100 ring-1 ring-inset ring-indigo-200')}>
                      <td className="font-semibold text-indigo-600 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {t.id_tache}
                          {subs.length>0&&(
                            <button onClick={e=>{e.stopPropagation();setExpanded(prev=>prev.includes(t.id_tache)?prev.filter(x=>x!==t.id_tache):[...prev,t.id_tache])}}
                              className="text-subtle hover:text-indigo-600">
                              {isExp?<ChevronDown size={11}/>:<ChevronRight size={11}/>}
                            </button>
                          )}
                          {subs.length>0&&<span className="bg-indigo-100 text-indigo-600 px-1 rounded text-[10px] font-semibold">{subs.filter(s=>s.statut==='Fait').length}/{subs.length}</span>}
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
                      <tr key={s.id_tache} className={cn('!bg-bg/50 cursor-pointer',isSelected&&'!bg-indigo-50')} onClick={()=>selectTask(s)}>
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

function EditTab({taches,parents,closedSprints,equipeNoms,membresActifs,equipes,updateTache,createSub,toast,allTaches,produitId,dependances,addDependance,removeDependance,userId,initFocusId}:{
  taches:Tache[];parents:Tache[];allTaches:Tache[];closedSprints:string[];equipeNoms:string[]
  membresActifs:UserProfile[];equipes:Equipe[]
  updateTache:ReturnType<typeof useUpdateTache>;createSub:ReturnType<typeof useCreateSousTache>;toast:ReturnType<typeof useToast>
  produitId:number|null;dependances:import('@/hooks/useTacheDependances').TacheDependance[]
  addDependance:ReturnType<typeof useAddDependance>;removeDependance:ReturnType<typeof useRemoveDependance>
  userId:string|null;initFocusId?:string
}) {
  const [search,setSearch]=useState('')
  const [filterStat,setFilterStat]=useState('')
  const [filterEpic,setFilterEpic]=useState('')
  const [selected,setSelected]=useState<string[]>([])
  const [panelId,setPanelId]=useState<string|null>(null)
  const [editForm,setEditForm]=useState<Record<string,unknown>>({})
  const [expanded,setExpanded]=useState<string[]>([])
  // Bulk edit : champs à appliquer sur la sélection (vide = "ne pas toucher")
  const [bulk,setBulk]=useState<Record<string,string>>({statut:'',epic:'',jalon:'',sprint_debut:'',moscow:'',equipe:'',assigne_a:'',metier:'',priorite:''})

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

  // Ouvre automatiquement la tâche visée par une notification (?focus=ID_TACHE)
  useEffect(()=>{
    if(!initFocusId) return
    const t=taches.find(x=>x.id_tache===initFocusId)
    if(t){
      openPanel(t)
      if(t.parent_id) setExpanded(prev=>prev.includes(t.parent_id!)?prev:[...prev,t.parent_id!])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[initFocusId,taches.length])

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
          <SelectPicker value={filterStat} onChange={setFilterStat} className="w-36"
            options={['À faire','En cours','Fait','Bloqué'].map(s=>({value:s,label:s}))} placeholder="Tous statuts"/>
          <SelectPicker value={filterEpic} onChange={setFilterEpic} className="w-44"
            options={EPIC_LIST.map(e=>({value:e,label:e.split(' — ')[0]}))} placeholder="Tous Epics" searchable/>
        </div>
        {selected.length>0&&(
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-600">{selected.length} US sélectionnée(s) — appliquer à toutes :</span>
              <button onClick={()=>setSelected([])} className="text-subtle hover:text-red transition-colors"><X size={13}/></button>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <SelectPicker value={bulk.statut} onChange={v=>setBulk(b=>({...b,statut:v}))} className="w-36"
                options={['À faire','En cours','Fait','Bloqué'].map(s=>({value:s,label:s}))} placeholder="Statut…"/>
              <SelectPicker value={bulk.priorite} onChange={v=>setBulk(b=>({...b,priorite:v}))} className="w-24"
                options={['P1','P2','P3','P4'].map(p=>({value:p,label:p}))} placeholder="Priorité…"/>
              <SelectPicker value={bulk.moscow} onChange={v=>setBulk(b=>({...b,moscow:v}))} className="w-32"
                options={MOSCOW_LIST.map(m=>({value:m,label:m}))} placeholder="MoSCoW…"/>
              <SelectPicker value={bulk.epic} onChange={v=>setBulk(b=>({...b,epic:v}))} className="w-44"
                options={EPIC_LIST.map(e=>({value:e,label:e.split(' — ')[0]}))} placeholder="Epic…" searchable/>
              <SelectPicker value={bulk.jalon} onChange={v=>setBulk(b=>({...b,jalon:v}))} className="w-52"
                options={JALON_LIST.map(j=>({value:j,label:j}))} placeholder="Jalon - Incrément majeur…"/>
              <SelectPicker value={bulk.sprint_debut} onChange={v=>setBulk(b=>({...b,sprint_debut:v}))} className="w-32"
                options={SPRINTS_LIST.map(s=>({value:s,label:s}))} placeholder="Sprint…"/>
              <SelectPicker value={bulk.assigne_a} onChange={v=>setBulk(b=>({...b,assigne_a:v}))} className="w-44"
                options={membresActifs.filter(m=>m.trigramme).map(m=>({value:m.trigramme!,label:`${m.trigramme} — ${m.prenom??''} ${m.nom??''}`}))}
                placeholder="Assigné…"/>
              <SelectPicker value={bulk.equipe} onChange={v=>setBulk(b=>({...b,equipe:v}))} className="w-36"
                options={equipeNoms.map(e=>({value:e,label:e}))} placeholder="Équipe…"/>
              <SelectPicker value={bulk.metier} onChange={v=>setBulk(b=>({...b,metier:v}))} className="w-36"
                options={METIERS_DEFAULT.map(m=>({value:m,label:m}))} placeholder="Thème…" searchable/>
              <button onClick={applyBulk} disabled={updateTache.isPending}
                className="ds-btn-primary ds-btn-sm whitespace-nowrap ml-auto">
                ✓ Appliquer
              </button>
            </div>
          </div>
        )}
        {/* ── Vue mobile : liste de cartes ── */}
        <div className="md:hidden flex flex-col gap-2">
          {filtered.map(t=>{
            const subs=childMap[t.id_tache]??[]
            const blockers=isBloqueeParDependance(t.id_tache,dependances,allTaches)
            return (
              <div key={t.id_tache} onClick={()=>openPanel(t)}
                className={cn('bg-white border rounded-xl p-3 cursor-pointer',panelId===t.id_tache?'border-indigo-300 ring-1 ring-indigo-100':'border-border')}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-indigo-600 shrink-0">{t.id_tache}</span>
                  <EpicBadge value={t.epic??''} className="text-[10px]"/>
                  {subs.length>0&&<span className="bg-indigo-100 text-indigo-600 px-1 rounded text-[10px] font-semibold shrink-0">{subs.filter(s=>s.statut==='Fait').length}/{subs.length}</span>}
                  {blockers.length>0&&<span className="ml-auto text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-full shrink-0">⛔ {blockers.length}</span>}
                </div>
                <p className="text-sm font-medium text-navy leading-snug mb-2">{t.titre}</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <StatutBadge value={t.statut}/>
                  {t.priorite&&<PrioBadge value={t.priorite}/>}
                  {t.moscow&&<MoscowBadge value={t.moscow}/>}
                  {t.jalon&&<JalonBadge value={t.jalon}/>}
                  {t.assigne_a&&<span className="text-[10px] font-semibold text-navy bg-bg px-1.5 py-0.5 rounded-full">{t.assigne_a}</span>}
                  {(t.sprint_debut||t.sprint)&&<span className="text-[10px] text-subtle ml-auto">{t.sprint_debut||t.sprint}</span>}
                </div>
              </div>
            )
          })}
          {!filtered.length&&(
            <div className="flex items-center justify-center h-20 border-2 border-dashed border-border rounded-xl text-subtle text-xs">Aucune tâche</div>
          )}
        </div>

        {/* ── Vue desktop : tableau ── */}
        <div className="hidden md:block bg-white border border-border rounded-xl overflow-x-auto">
          <table className="ds-table" style={{minWidth:'1400px'}}>
            <thead><tr>
              <th className="w-8 shrink-0"><input type="checkbox" className="accent-indigo-500"
                onChange={e=>setSelected(e.target.checked?filtered.map(t=>t.id_tache):[])}
                checked={selected.length===filtered.length&&filtered.length>0}/></th>
              <th>ID</th>
              <th>Titre</th>
              <th>Statut</th>
              <th>Priorité</th>
              <th>MoSCoW</th>
              <th>Epic</th>
              <th>Jalon - Incrément majeur</th>
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
                    <tr className={cn('cursor-pointer',selected.includes(t.id_tache)&&'bg-indigo-50',panelId===t.id_tache&&'!bg-indigo-100')}
                      onClick={()=>openPanel(t)}>
                      <td onClick={e=>e.stopPropagation()}>
                        <input type="checkbox" checked={selected.includes(t.id_tache)} className="accent-indigo-500"
                          onChange={e=>setSelected(prev=>e.target.checked?[...prev,t.id_tache]:prev.filter(x=>x!==t.id_tache))}/>
                      </td>
                      <td className="font-semibold text-indigo-600 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {isClosed&&<Lock size={9} className="text-subtle"/>}
                          {t.id_tache}
                          {subs.length>0&&(
                            <button onClick={e=>{e.stopPropagation();setExpanded(prev=>prev.includes(t.id_tache)?prev.filter(x=>x!==t.id_tache):[...prev,t.id_tache])}} className="text-subtle hover:text-indigo-600">
                              {isExp?<ChevronDown size={11}/>:<ChevronRight size={11}/>}
                            </button>
                          )}
                          {subs.length>0&&<span className="bg-indigo-100 text-indigo-600 px-1 rounded text-xs font-semibold">{subs.filter(s=>s.statut==='Fait').length}/{subs.length}</span>}
                        </div>
                      </td>
                      <td className="max-w-[200px]"><div className="truncate font-medium">{t.titre}</div></td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <StatutBadge value={t.statut}/>
                          {(()=>{const blockers=isBloqueeParDependance(t.id_tache,dependances,allTaches)
                            return blockers.length>0 && (
                              <span title={`Bloquée par : ${blockers.join(', ')}`}
                                className="text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                ⛔ {blockers.length}
                              </span>
                            )})()}
                        </div>
                      </td>
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
        <>
          <div className="fixed inset-0 z-40 bg-navy/40" onClick={()=>setPanelId(null)}/>
          <div className="fixed inset-x-0 bottom-0 z-50 animate-in md:inset-x-auto md:left-auto md:right-4 md:top-4 md:bottom-4 md:w-3/5 md:min-w-[380px] md:max-w-[860px]">
          <div className="ds-card max-h-[80vh] md:max-h-full md:h-full overflow-y-auto rounded-b-none md:rounded-xl shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-indigo-600">{panelTask.id_tache}</span>
              <button onClick={()=>setPanelId(null)} className="p-1 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-navy"><X size={13}/></button>
            </div>
            <h3 className="text-sm font-semibold text-navy leading-snug mb-3 line-clamp-2">{panelTask.titre}</h3>

            <div className="flex flex-col">
              {/* Identité : Titre + Statut */}
              <div className="grid grid-cols-[1fr_170px] gap-3">
                <Grp label="Titre"><input value={String(editForm.titre??'')} onChange={setF('titre')} className="ds-input text-xs"/></Grp>
                <Grp label="Statut">
                  <StatusPicker
                    value={(String(editForm.statut??'À faire')) as Statut}
                    onChange={s=>setEditForm(f=>({...f,statut:s}))}
                  />
                </Grp>
              </div>

              {/* Classification : Epic, Type fonction, Jalon, Priorité */}
              <div className="grid grid-cols-6 gap-3 mt-4 pt-3 border-t-2 border-slate-300">
                <Grp label="Epic" className="col-span-2">
                  <SelectPicker value={String(editForm.epic??'')} onChange={v=>setEditForm(f=>({...f,epic:v}))}
                    options={EPIC_LIST.map(e=>({value:e,label:e}))} placeholder="-- Epic --" searchable/>
                </Grp>
                <Grp label="Type fonction" className="col-span-2">
                  <SelectPicker value={String(editForm.type_fonction??'')} onChange={v=>setEditForm(f=>({...f,type_fonction:v}))}
                    options={[
                      {value:'Fonction principale',label:'Principale'},
                      {value:'Fonction secondaire',label:'Secondaire'},
                      {value:'Fonction support',label:'Support'},
                      {value:'Fonction exclue',label:'Exclue'},
                    ]} placeholder="-- Type --"/>
                </Grp>
                <Grp label="Jalon - Incrément majeur" className="col-span-2">
                  <SelectPicker value={String(editForm.jalon??'')} onChange={v=>setEditForm(f=>({...f,jalon:v}))}
                    options={JALON_LIST.map(j=>({value:j,label:j}))} placeholder="-- Jalon --"/>
                </Grp>
              </div>

              {/* Priorité, MoSCoW, Effort, Assigné */}
              <div className="grid grid-cols-6 gap-3 mt-4 pt-3 border-t-2 border-slate-300">
                <Grp label="Priorité" className="col-span-1">
                  <PriorityPicker value={String(editForm.priorite??'')} onChange={p=>setEditForm(f=>({...f,priorite:p}))} />
                </Grp>
                <Grp label="MoSCoW" className="col-span-2">
                  <MoSCoWPicker value={String(editForm.moscow??'')} onChange={m=>setEditForm(f=>({...f,moscow:m}))}/>
                </Grp>
                <Grp label="Effort (j)" className="col-span-1">
                  {panelTask && (childMap[panelTask.id_tache]??[]).length > 0 ? (
                    <div className="ds-input text-xs bg-slate-50 text-navy font-semibold flex items-center gap-1.5 cursor-not-allowed">
                      <span>∑ {(childMap[panelTask.id_tache]??[]).reduce((s,c)=>s+(c.effort_j??0),0)}j</span>
                      <span className="text-[10px] text-slate-400 font-normal">{(childMap[panelTask.id_tache]??[]).length} ss</span>
                    </div>
                  ) : (
                    <input type="number" value={Number(editForm.effort_j??0)} onChange={setF('effort_j')} className="ds-input text-xs" min={0} step={0.5}/>
                  )}
                </Grp>
                <Grp label="Assigné à" className="col-span-2">
                  <AssignPicker value={String(editForm.assigne_a??'')} membres={membresActifs} onAssign={setMembre} />
                </Grp>
              </div>

              {/* Planning : Sprint début/fin, Équipe, Thème */}
              <div className="grid grid-cols-4 gap-3 mt-4 pt-3 border-t-2 border-slate-300">
                <Grp label="Sprint début">
                  <SelectPicker value={String(editForm.sprint_debut??'')} onChange={v=>setEditForm(f=>({...f,sprint_debut:v}))}
                    options={SPRINTS_LIST.map(s=>({value:s,label:s}))} placeholder="-- Sprint --"/>
                </Grp>
                <Grp label="Sprint fin">
                  <SelectPicker value={String(editForm.sprint_fin??'')} onChange={v=>setEditForm(f=>({...f,sprint_fin:v}))}
                    options={SPRINTS_LIST.map(s=>({value:s,label:s}))} placeholder="-- Sprint --"/>
                </Grp>
                <Grp label="Équipe">
                  <SelectPicker value={String(editForm.equipe??'')} onChange={v=>setEditForm(f=>({...f,equipe:v}))}
                    options={equipeNoms.map(e=>({value:e,label:e}))} placeholder="-- Équipe --"/>
                </Grp>
                <Grp label="Thème">
                  <SelectPicker value={String(editForm.metier??'')} onChange={v=>setEditForm(f=>({...f,metier:v}))}
                    options={METIERS_DEFAULT.map(m=>({value:m,label:m}))} placeholder="-- Thème --" searchable/>
                </Grp>
              </div>

              {/* Contenu : User Story + Critères côte à côte */}
              <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t-2 border-slate-300">
                <Grp label="User Story"><textarea value={String(editForm.description??'')} onChange={setF('description')} className="ds-textarea text-xs" rows={5}/></Grp>
                <Grp label="Critères d'acceptation">
                  <div className="ds-input min-h-[110px] flex flex-col">
                    <CriteresEditor
                      items={parseCriteres(String(editForm.criteres??''))}
                      onChange={items=>setEditForm(f=>({...f,criteres:serializeCriteres(items)}))}
                      compact
                    />
                  </div>
                </Grp>
              </div>

              {/* Lien DoD + Commentaire PO */}
              <div className="grid grid-cols-[220px_1fr] gap-3 mt-4 pt-3 border-t-2 border-slate-300">
                <Grp label="Lien DoD">
                  <input value={String(editForm.lien_dod??'')} onChange={setF('lien_dod')} className="ds-input text-xs" placeholder="F1.1, F1.2…"/>
                  {!!editForm.lien_dod&&(
                    <div className="flex flex-wrap gap-1 mt-1">
                      {String(editForm.lien_dod).split(/[,;]/).map(s=>s.trim()).filter(Boolean).map(code=>(
                        <span key={code} className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium border border-indigo-100">{code}</span>
                      ))}
                    </div>
                  )}
                </Grp>
                <Grp label="Commentaire PO">
                  <MentionField as="textarea" value={String(editForm.commentaire??'')} onChange={v=>setEditForm(f=>({...f,commentaire:v}))}
                    membres={membresActifs} className="ds-textarea text-xs" rows={2}/>
                </Grp>
              </div>

              {/* Dépendances entre tâches */}
              {panelTask && produitId && (
                <Grp label="Dépendances" className="mt-4 pt-3 border-t-2 border-slate-300">
                  <div className="flex flex-col gap-2">
                    <div>
                      <div className="text-[10px] text-navy/70 font-bold uppercase tracking-wide mb-1">Bloquée par</div>
                      {dependances.filter(d=>d.bloquee_id===panelTask.id_tache).length===0 ? (
                        <p className="text-xs text-subtle italic">Aucune</p>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {dependances.filter(d=>d.bloquee_id===panelTask.id_tache).map(d=>{
                            const t=allTaches.find(x=>x.id_tache===d.bloque_id)
                            const done=t?.statut==='Fait'
                            return (
                              <div key={d.id} className={cn('flex items-center gap-2 text-xs px-2 py-1 rounded-lg border',
                                done?'bg-emerald-50 border-emerald-100 text-emerald-700':'bg-rose-50 border-rose-100 text-rose-700')}>
                                <span className="font-mono font-semibold">{d.bloque_id}</span>
                                <span className="flex-1 truncate">{t?.titre??'—'}</span>
                                <button onClick={()=>removeDependance.mutate({id:d.id,produit_id:produitId})} className="hover:text-red"><X size={11}/></button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] text-navy/70 font-bold uppercase tracking-wide mb-1">Bloque</div>
                      {dependances.filter(d=>d.bloque_id===panelTask.id_tache).length===0 ? (
                        <p className="text-xs text-subtle italic">Aucune</p>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {dependances.filter(d=>d.bloque_id===panelTask.id_tache).map(d=>{
                            const t=allTaches.find(x=>x.id_tache===d.bloquee_id)
                            return (
                              <div key={d.id} className="flex items-center gap-2 text-xs px-2 py-1 rounded-lg border bg-bg border-border text-subtle">
                                <span className="font-mono font-semibold text-navy">{d.bloquee_id}</span>
                                <span className="flex-1 truncate">{t?.titre??'—'}</span>
                                <button onClick={()=>removeDependance.mutate({id:d.id,produit_id:produitId})} className="hover:text-red"><X size={11}/></button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <SelectPicker value="" placeholder="+ Ajouter une tâche bloquante…" searchable
                      onChange={v=>{
                        if(!v||v===panelTask.id_tache) return
                        addDependance.mutate({produit_id:produitId,bloque_id:v,bloquee_id:panelTask.id_tache})
                      }}
                      options={allTaches.filter(t=>t.id_tache!==panelTask.id_tache && !dependances.some(d=>d.bloque_id===t.id_tache&&d.bloquee_id===panelTask.id_tache))
                        .map(t=>({value:t.id_tache,label:`${t.id_tache} — ${t.titre}`}))}/>
                  </div>
                </Grp>
              )}

              {panelTask && produitId && (
                <div className="mt-4 pt-3 border-t-2 border-slate-300">
                  <TacheExtras produitId={produitId} tache={panelTask} membres={membresActifs} userId={userId} toast={toast} />
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-3 pt-3 border-t-2 border-slate-300">
              <button onClick={savePanel} className="ds-btn-primary flex-1" disabled={updateTache.isPending}>✓ Sauvegarder</button>
              <button onClick={()=>setPanelId(null)} className="ds-btn">Annuler</button>
            </div>
          </div>
          </div>
        </>
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
          <SelectPicker value={targetSprint} onChange={setTargetSprint}
            options={SPRINTS_LIST.map(s=>({value:s,label:s}))} placeholder="Backlog" className="w-40"/>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={withSubs} onChange={e=>setWithSubs(e.target.checked)} className="accent-indigo-500"/>
          Avec sous-tâches
        </label>
        <button onClick={doDuplicate} className="ds-btn-primary ml-auto" disabled={createTache.isPending||!selected.length}>
          ⎘ Dupliquer ({selected.length})
        </button>
      </div>
      <div className="ds-searchbar"><Search size={13} className="text-subtle"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher…"/></div>
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-bg">
          <input type="checkbox" className="accent-indigo-500" checked={selected.length===filtered.length&&filtered.length>0}
            onChange={e=>setSelected(e.target.checked?filtered.map(t=>t.id_tache):[])}/>
          <span className="text-xs font-semibold text-subtle">Tout sélectionner ({filtered.length})</span>
        </div>
        {filtered.map(t=>{
          const subs=childMap[t.id_tache]??[]
          return (
            <label key={t.id_tache} className={cn('flex items-center gap-3 px-4 py-2.5 border-b border-border/50 cursor-pointer hover:bg-bg/50',selected.includes(t.id_tache)&&'bg-indigo-50')}>
              <input type="checkbox" checked={selected.includes(t.id_tache)} className="accent-indigo-500"
                onChange={e=>setSelected(prev=>e.target.checked?[...prev,t.id_tache]:prev.filter(x=>x!==t.id_tache))}/>
              <span className="text-xs font-semibold text-indigo-600 w-16 shrink-0">{t.id_tache}</span>
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
            <span className="text-xs font-semibold text-indigo-600 w-16 shrink-0">{t.id_tache}</span>
            <span className="text-xs flex-1 truncate">{t.titre}</span>
            <EpicBadge value={t.epic??''}/><StatutBadge value={t.statut}/>
          </label>
        ))}
      </div>
    </div>
  )
}
