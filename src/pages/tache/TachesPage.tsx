import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Spinner } from '@/components/ui/Spinner'
import { StatutBadge, EpicBadge, MoscowBadge, JalonBadge, PrioBadge, TypeFonctionBadge } from '@/components/ui/Badge'
import { useTaches, useCreateTache, useUpdateTache, useDeleteTache, useCreateSousTache } from '@/hooks/useTaches'
import { useTacheDependances, isBloqueeParDependance } from '@/hooks/useTacheDependances'
import { SousTacheModal } from '@/components/tache/SousTacheModal'
import { QuickAddModal } from '@/components/tache/QuickAddModal'
import { FastTaskBoard } from '@/components/tache/FastTaskBoard'
import { TacheTree } from '@/components/tache/TacheTree'
import { TacheDetailPanel } from '@/components/tache/TacheDetailPanel'
import { Grp, SelectPicker, PriorityPicker, MoSCoWPicker } from '@/components/tache/TacheFormControls'
import { useIterationCounts, useLastIterationSprints } from '@/hooks/useTacheIterations'
import { useSprints, useSprintActif, useClosedSprints } from '@/hooks/useSprints'
import { useEquipes, useUtilisateurs } from '@/hooks/useEquipes'
import { useToast } from '@/hooks/useToast'
import { confirm } from '@/components/ui/ConfirmModal'
import { MOSCOW_LIST, METIERS_DEFAULT } from '@/constants'
import { useEpics, useCreateEpic, epicFullName } from '@/hooks/useEpics'
import { useJalons } from '@/hooks/useJalons'
import { Search, Lock, Plus, Copy, Trash2, ChevronRight, ChevronDown, X, CornerDownRight, FilePlus, SlidersHorizontal, BookOpen, Target, AlignJustify, StickyNote } from 'lucide-react'
import { PageTitle } from '@/components/ui/PageTitle'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { cn, parseCriteres, serializeCriteres, epicCode, epicShortName, naturalCompare, buildTacheIndex, isSousTache, effortEffectif, existingSprintNumeros, parseAssignees, serializeAssignees } from '@/lib/utils'
import type { CritereItem } from '@/lib/utils'
import { CriteresEditor } from '@/components/ui/CriteresEditor'
import { StatusPicker } from '@/components/ui/StatusPicker'
import { AssignPicker, AssignPickerMulti } from '@/components/ui/AssignPicker'
import { MentionField } from '@/components/ui/MentionField'
import { DodLinkPicker } from '@/components/ui/DodLinkPicker'
import { useDod } from '@/hooks/useDod'
import { useAuth } from '@/contexts/AuthContext'
import { useProduit } from '@/contexts/ProduitContext'
import type { Tache, Statut, Equipe } from '@/types'
import type { UserProfile } from '@/contexts/AuthContext'

// PriorityPicker/Grp/SelectPicker/MoSCoWPicker : extraits vers
// components/tache/TacheFormControls.tsx (partagés avec TacheDetailPanel).

// Liste par défaut ; la création est une vue dédiée accessible via le bouton primaire.
// Dupliquer / Supprimer sont des actions contextuelles (panneau + sélection multiple).
// 'fast' : board de post-it (capture rapide, voir FastTaskBoard.tsx).
type ViewKey = 'list'|'add'|'fast'

// ── Regroupement + filtres de la liste (repris de l'ancien Backlog) ──
type GroupBy = 'epic'|'jalon'|'none'
const STATUTS_FILTRE  = ['À faire','En cours','Fait','Bloqué'] as const
const MOSCOWS_FILTRE  = ['Must Have','Should Have','Could Have',"Won't Have"] as const
const TYPES_FN_FILTRE = ['Fonction principale','Fonction secondaire','Fonction support','Fonction exclue'] as const
const STATUT_CHIP_COLORS:Record<string,{bg:string;text:string}> = {
  'À faire': {bg:'#F1F5F9',text:'#475569'},
  'En cours':{bg:'#FEF3C7',text:'#92600A'},
  'Fait':    {bg:'#D1FAE5',text:'#065F46'},
  'Bloqué':  {bg:'#FEE2E2',text:'#991B1B'},
}
function FilterChip({label,active,onClick,activeBg,activeText,bg,text}:{
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

export default function TachesPage() {
  const [params] = useSearchParams()
  const [view,setView] = useState<ViewKey>('list')
  const [jumpSansEpic,setJumpSansEpic] = useState(false)
  useEffect(()=>{
    // Compat anciens liens : tab=add ouvre la création, tout le reste va sur la liste
    setView(params.get('tab')==='add'?'add':'list')
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
  const { canWrite }  = useAuth()
  const { produitActif } = useProduit()
  const {data:dependances=[]} = useTacheDependances(produitActif?.id ?? null)

  if(isLoading) return <Layout><Spinner/></Layout>
  const parents = taches.filter(t=>!t.parent_id)
  const equipeNoms = equipes.filter(e=>e.actif).map(e=>e.nom)
  const membresActifs = membres.filter(m=>m.actif)
  const canEditTasks = produitActif ? canWrite(produitActif.id) : false
  const sansEpicCount = parents.filter(t=>!t.epic).length

  return (
    <Layout>
      <div className="page-topbar -mx-3 -mt-3 mb-3 px-3 md:-mx-5 md:-mt-5 md:mb-5 md:px-5">
        <PageTitle icon={<FilePlus size={15}/>} label="Tâches" />
        {canEditTasks&&(
          <div className="ml-auto flex items-center gap-2">
            {view==='list' ? (
              <>
                {sansEpicCount>0 && (
                  <button onClick={()=>{setJumpSansEpic(true);setView('list')}}
                    className="text-xs font-semibold text-orange bg-orange/10 border border-orange/20 px-2.5 py-1.5 rounded-lg hover:bg-orange/20 transition-colors">
                    {sansEpicCount} à compléter
                  </button>
                )}
                <button onClick={()=>setView('fast')} className="ds-btn flex items-center gap-1.5">
                  <StickyNote size={13}/> Fast Task
                </button>
                <button onClick={()=>setView('add')} className="ds-btn-primary flex items-center gap-1.5">
                  <Plus size={13}/> Nouvelle tâche
                </button>
              </>
            ) : (
              <button onClick={()=>setView('list')} className="ds-btn flex items-center gap-1.5">
                ← Retour à la liste
              </button>
            )}
          </div>
        )}
      </div>
      {!canEditTasks ? (
        <div className="ds-card flex items-center gap-2 text-sm text-subtle">
          <Lock size={14}/> Accès en lecture seule — vous n'avez pas les droits pour créer, modifier, dupliquer ou supprimer des tâches sur ce produit.
        </div>
      ) : <>
        {view==='add' &&<AddTab  sprintActif={sprintActif?.numero} equipeNoms={equipeNoms} membresActifs={membresActifs} equipes={equipes.filter(e=>e.actif)} createTache={createTache} createSub={createSub} updateTache={updateTache} parents={parents} allTaches={taches} toast={toast} initTitre={params.get('titre')??''} initParentId={params.get('parent_id')??''}/>}
        {view==='fast' && <FastTaskBoard canWrite={canEditTasks} />}
        {view==='list'&&<EditTab taches={taches} parents={parents} allTaches={taches} closedSprints={closedSprints} equipeNoms={equipeNoms} membresActifs={membresActifs} equipes={equipes.filter(e=>e.actif)} updateTache={updateTache} createTache={createTache} deleteTache={deleteTache} createSub={createSub} toast={toast} produitId={produitActif?.id ?? null} dependances={dependances} initFocusId={params.get('focus')??''} initShowSansEpic={jumpSansEpic}/>}
      </>}
    </Layout>
  )
}

// ── SelectPicker (remplace <select> natif) ─────────────────────
function AddTab({sprintActif,equipeNoms,membresActifs,equipes,createTache,createSub,updateTache,parents,allTaches,toast,initTitre='',initParentId=''}:{
  sprintActif?:string;equipeNoms:string[];membresActifs:UserProfile[];equipes:Equipe[];parents:Tache[];allTaches:Tache[]
  createTache:ReturnType<typeof useCreateTache>;createSub:ReturnType<typeof useCreateSousTache>;updateTache:ReturnType<typeof useUpdateTache>
  toast:ReturnType<typeof useToast>;initTitre?:string;initParentId?:string
}) {
  const { data: dodItems=[] } = useDod()
  const { data: epicsList=[] } = useEpics()
  const { data: jalonsList=[] } = useJalons()
  const { data: sprints=[] } = useSprints()
  const sprintNumeros = existingSprintNumeros(sprints)
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
  const [sousTacheParent,setSousTacheParent]=useState<Tache|null>(null)
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

  const byId=useMemo(()=>buildTacheIndex(allTaches),[allTaches])
  // Conteneurs + toute US (racine ou déjà rattachée à un conteneur) — jamais
  // une sous-tâche, pour ne pas créer un 4ᵉ niveau de hiérarchie.
  const validParentOptions=useMemo(()=>allTaches.filter(t=>!isSousTache(t,byId)),[allTaches,byId])

  // Une fois l'Epic choisi, on ne propose que les Conteneurs/US de cet Epic,
  // sous forme d'arborescence (Conteneur puis ses US indentées dessous).
  const parentOptionsTree=useMemo(()=>{
    const pool=(form.epic?validParentOptions.filter(t=>t.epic===form.epic):validParentOptions)
      .filter(t=>t.id_tache!==editTask?.id_tache)
    const opts:{value:string;label:string}[]=[]
    pool.filter(t=>t.type_tache==='Conteneur').forEach(c=>{
      opts.push({value:c.id_tache,label:`${c.id_tache} — ${c.titre} (Conteneur)`})
      pool.filter(t=>t.parent_id===c.id_tache).forEach(u=>opts.push({value:u.id_tache,label:`  ↳ ${u.id_tache} — ${u.titre}`}))
    })
    pool.filter(t=>!t.parent_id&&t.type_tache!=='Conteneur').forEach(t=>opts.push({value:t.id_tache,label:`${t.id_tache} — ${t.titre}`}))
    return opts
  },[validParentOptions,form.epic,editTask])

  // Rattacher une tâche à un parent (Conteneur ou US) hérite silencieusement
  // de ses attributs de classement — cohérent avec SousTacheModal.
  function handleParentChange(v:string){
    setParentId(v)
    if(!v) return
    const parent=allTaches.find(p=>p.id_tache===v)
    if(!parent) return
    setForm(f=>({...f,
      epic:parent.epic??f.epic, jalon:parent.jalon??f.jalon, moscow:parent.moscow??f.moscow,
      priorite:parent.priorite??f.priorite, equipe:parent.equipe??f.equipe, metier:parent.metier??f.metier,
    }))
  }

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

  // Une sous-tâche (parent = US) garde un seul assigné ; une US (parent
  // vide ou Conteneur) peut en avoir plusieurs — cf. QuickAddModal.
  const parentTaskForForm=useMemo(()=>allTaches.find(t=>t.id_tache===parentId),[allTaches,parentId])
  const wouldBeSousTache=!!parentTaskForForm&&parentTaskForForm.type_tache!=='Conteneur'
  function setMembresMulti(list:string[]){
    setForm(f=>({...f,assigne_a:serializeAssignees(list)}))
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
          <div className="bg-card rounded-2xl shadow-modal w-full max-w-sm p-6 animate-in"
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
          {/* Ligne 1 : epic + tâche parente + jalon + MoSCoW + priorité */}
          <div className="grid grid-cols-5 gap-4">
            <Grp label="Epic">
              <SelectPicker value={form.epic} onChange={v=>setForm(f=>({...f,epic:v}))}
                options={epicsList.map(e=>({value:epicFullName(e),label:epicFullName(e)}))} placeholder="-- Epic --" searchable/>
            </Grp>
            {form.type_tache!=='Conteneur' && <Grp label={<>Tâche parente <span className="font-normal text-subtle/60">(vide = principale)</span></>}>
              <SelectPicker value={parentId} onChange={handleParentChange}
                options={parentOptionsTree}
                placeholder="— Principale —" searchable className={isEditing?'opacity-50 pointer-events-none':''}/>
            </Grp>}
            {form.type_tache!=='Conteneur' && <Grp label="Jalon - Incrément majeur">
              <SelectPicker value={form.jalon} onChange={v=>setForm(f=>({...f,jalon:v}))}
                options={jalonsList.map(j=>({value:j.code,label:j.code}))} placeholder="-- Jalon - Incrément majeur --"/>
            </Grp>}
            {form.type_tache!=='Conteneur' && <Grp label="MoSCoW">
              <MoSCoWPicker value={form.moscow} onChange={v=>setForm(f=>({...f,moscow:v}))}/>
            </Grp>}
            {form.type_tache!=='Conteneur' && <Grp label="Priorité">
              <PriorityPicker value={form.priorite} onChange={p=>setForm(f=>({...f,priorite:p}))} />
            </Grp>}
          </div>
          {/* Ligne 2 : titre */}
          <Grp label="Titre *"><input value={form.titre} onChange={set('titre')} className="ds-input" placeholder="Ex: Conception mécanique avaloir"/></Grp>
          <label className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-navy cursor-pointer">
            <input type="checkbox" className="accent-indigo-500" checked={form.type_tache==='Conteneur'}
              onChange={e=>{
                const checked=e.target.checked
                setForm(f=>({...f,type_tache:checked?'Conteneur':'Tâche'}))
                if(checked) setParentId('') // un Conteneur reste toujours racine
              }}/>
            Ceci est un conteneur de regroupement (Feature/sous-système — pas un item de travail réel)
          </label>
          {/* Ligne 3 : User Story + Critères */}
          {form.type_tache!=='Conteneur' && <div className="grid grid-cols-2 gap-4">
            <Grp label="User Story"><textarea value={form.description} onChange={set('description')} className="ds-textarea" rows={3} placeholder="En tant que… je veux… afin de…"/></Grp>
            <Grp label="Critères d'acceptation (DoD)">
              <div className="ds-input min-h-[80px] flex flex-col">
                <CriteresEditor items={critereItems} onChange={setCritereItems} />
              </div>
            </Grp>
          </div>}
          {/* Ligne 4 : champs secondaires */}
          <div className="grid grid-cols-8 gap-4">
            {form.type_tache!=='Conteneur' && <Grp label="Sprint début">
              <SelectPicker value={form.sprint_debut} onChange={v=>setForm(f=>({...f,sprint_debut:v}))}
                options={sprintNumeros.map(s=>({value:s,label:s}))} placeholder="-- Sprint --"/>
            </Grp>}
            {form.type_tache!=='Conteneur' && <Grp label="Sprint fin">
              <SelectPicker value={form.sprint_fin} onChange={v=>setForm(f=>({...f,sprint_fin:v}))}
                options={sprintNumeros.map(s=>({value:s,label:s}))} placeholder="Même sprint"/>
            </Grp>}
            {form.type_tache!=='Conteneur' && <Grp label="Effort (j)"><input type="number" value={form.effort_j} onChange={set('effort_j')} className="ds-input" min={0} step={0.1}/></Grp>}
            {form.type_tache!=='Conteneur' && <Grp label="Assigné à">
              <div className="pt-1">
                {wouldBeSousTache ? (
                  <AssignPicker value={form.assigne_a} membres={membresActifs} onAssign={setMembre} />
                ) : (
                  <AssignPickerMulti value={parseAssignees(form.assigne_a)} membres={membresActifs} onChange={setMembresMulti} />
                )}
              </div>
            </Grp>}
            {form.type_tache!=='Conteneur' && <Grp label="Équipe">
              <SelectPicker value={form.equipe} onChange={v=>setForm(f=>({...f,equipe:v}))}
                options={equipeNoms.map(e=>({value:e,label:e}))} placeholder="-- Équipe --"/>
            </Grp>}
            {form.type_tache!=='Conteneur' && <Grp label="Thème">
              <SelectPicker value={form.metier} onChange={v=>setForm(f=>({...f,metier:v}))}
                options={METIERS_DEFAULT.map(m=>({value:m,label:m}))} placeholder="-- Thème --" searchable/>
            </Grp>}
            {form.type_tache!=='Conteneur' && <Grp label="Type de fonction">
              <SelectPicker value={form.type_fonction} onChange={v=>setForm(f=>({...f,type_fonction:v}))}
                options={[
                  {value:'Fonction principale',label:'Principale'},
                  {value:'Fonction secondaire',label:'Secondaire'},
                  {value:'Fonction support',label:'Support'},
                  {value:'Fonction exclue',label:'Exclue'},
                ]} placeholder="-- Type --"/>
            </Grp>}
            {form.type_tache!=='Conteneur' && <Grp label="Exigences"><DodLinkPicker value={form.lien_dod} onChange={v=>setForm(f=>({...f,lien_dod:v}))} items={dodItems}/></Grp>}
          </div>
          {/* Ligne 5 : commentaire + boutons */}
          <div className="grid grid-cols-2 gap-4 items-end">
            <Grp label="Commentaire PO">
              <MentionField as="textarea" value={form.commentaire} onChange={v=>setForm(f=>({...f,commentaire:v}))}
                membres={membresActifs} className="ds-textarea" rows={2}/>
            </Grp>
            <div className="flex gap-2 pb-0.5 flex-wrap">
              <button type="submit" className={cn('ds-btn-primary',isEditing&&'bg-indigo-500 border-indigo-600')} disabled={isPending}>
                {isEditing ? '💾 Modifier' : '✅ Créer'}
              </button>
              {isEditing&&editTask&&!isSousTache(editTask,byId)&&(
                <button type="button" onClick={()=>setSousTacheParent(editTask)}
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
                const effJ=effortEffectif(t,childMap)
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
                          {subs.length>0&&<span className="bg-indigo-100 text-indigo-600 px-1 rounded text-[11px] font-semibold">{subs.filter(s=>s.statut==='Fait').length}/{subs.length}</span>}
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

      {sousTacheParent&&(
        <SousTacheModal
          parent={sousTacheParent}
          sprint={sprintActif??null}
          membres={membresActifs}
          onClose={()=>setSousTacheParent(null)}
          onCreate={async payload=>{
            const res=await createSub.mutateAsync({parentId:sousTacheParent.id_tache,payload})
            toast(`✅ ${res.id_tache} créée`)
          }}
        />
      )}
    </div>
  )
}

function EditTab({taches,parents,closedSprints,equipeNoms,membresActifs,equipes,updateTache,createTache,deleteTache,createSub,toast,allTaches,produitId,dependances,initFocusId,initShowSansEpic}:{
  taches:Tache[];parents:Tache[];allTaches:Tache[];closedSprints:string[];equipeNoms:string[]
  membresActifs:UserProfile[];equipes:Equipe[]
  updateTache:ReturnType<typeof useUpdateTache>;createTache:ReturnType<typeof useCreateTache>;deleteTache:ReturnType<typeof useDeleteTache>
  createSub:ReturnType<typeof useCreateSousTache>;toast:ReturnType<typeof useToast>
  produitId:number|null;dependances:import('@/hooks/useTacheDependances').TacheDependance[]
  initFocusId?:string;initShowSansEpic?:boolean
}) {
  const { data: epicsList=[] } = useEpics()
  const { data: iterationCounts=new Map<string,number>() } = useIterationCounts(produitId)
  const { data: lastIterSprints=new Map<string,string>() } = useLastIterationSprints(produitId)
  const createEpic = useCreateEpic()
  const { isAdmin } = useAuth()
  const { data: jalonsList=[] } = useJalons()
  const { data: sprints=[] } = useSprints()
  const sprintNumeros = existingSprintNumeros(sprints)
  const epicColorMap = useMemo(() => new Map(epicsList.map(e => [epicFullName(e), e.couleur])), [epicsList])
  const epicBgMap = useMemo(() => new Map(epicsList.map(e => [epicFullName(e), e.bg_couleur])), [epicsList])
  const jalonColorMap = useMemo(() => new Map(jalonsList.map(j => [j.code, j.couleur])), [jalonsList])
  const jalonCodes = useMemo(() => jalonsList.map(j => j.code), [jalonsList])
  const [search,setSearch]=useState('')
  // Par Epic ne peut pas montrer les tâches sans Epic (rien à regrouper
  // dessous) — on démarre sur "Aucun" quand on arrive via "à compléter".
  const [groupBy,setGroupBy]=useState<GroupBy>(initShowSansEpic?'none':'epic')
  const [selEpics,setSelEpics]=useState<string[]>([])
  const [selJalons,setSelJalons]=useState<string[]>([])
  const [selStatuts,setSelStatuts]=useState<string[]>([])
  const [selMoscows,setSelMoscows]=useState<string[]>([])
  const [selTypes,setSelTypes]=useState<string[]>([])
  const [showSansEpic,setShowSansEpic]=useState(!!initShowSansEpic)
  const [showFilters,setShowFilters]=useState(!!initShowSansEpic)
  const [page,setPage]=useState(1)
  const [selected,setSelected]=useState<string[]>([])
  const [panelId,setPanelId]=useState<string|null>(null)
  const [expanded,setExpanded]=useState<string[]>([])
  // Bulk edit : champs à appliquer sur la sélection (vide = "ne pas toucher")
  const [bulk,setBulk]=useState<Record<string,string>>({statut:'',epic:'',jalon:'',sprint_debut:'',moscow:'',equipe:'',assigne_a:'',metier:'',priorite:''})
  const [dupTarget,setDupTarget]=useState('')
  const [sousTacheParent,setSousTacheParent]=useState<Tache|null>(null)
  const [quickAdd,setQuickAdd]=useState<{epicLabel:string;conteneurParent?:Tache}|null>(null)

  const childMap:Record<string,Tache[]>={}
  taches.filter(t=>t.parent_id).forEach(c=>{if(!childMap[c.parent_id!]) childMap[c.parent_id!]=[]; childMap[c.parent_id!].push(c)})

  const byId=useMemo(()=>buildTacheIndex(allTaches),[allTaches])

  const epicListe=useMemo(()=>[...new Set(parents.map(t=>t.epic).filter(Boolean))].sort(naturalCompare),[parents])

  function toggleIn<T>(arr:T[],val:T):T[] { return arr.includes(val)?arr.filter(x=>x!==val):[...arr,val] }
  const activeFilterCount=selEpics.length+selJalons.length+selStatuts.length+selMoscows.length+selTypes.length+(search?1:0)+(showSansEpic?1:0)
  const hasActiveFilters=activeFilterCount>0
  function resetFilters(){setSelEpics([]);setSelJalons([]);setSelStatuts([]);setSelMoscows([]);setSelTypes([]);setSearch('');setShowSansEpic(false);setPage(1)}

  const filtered=useMemo(()=>parents.filter(t=>{
    if(search&&!t.titre.toLowerCase().includes(search.toLowerCase())&&!t.id_tache.toLowerCase().includes(search.toLowerCase())) return false
    if(showSansEpic&&t.epic) return false
    if(selEpics.length&&!selEpics.includes(t.epic??'')) return false
    if(selJalons.length&&!selJalons.includes(t.jalon??'')) return false
    if(selStatuts.length&&!selStatuts.includes(t.statut)) return false
    if(selMoscows.length&&!selMoscows.includes(t.moscow??'')) return false
    if(selTypes.length&&!selTypes.includes(t.type_fonction??'')) return false
    return true
  }),[parents,search,showSansEpic,selEpics,selJalons,selStatuts,selMoscows,selTypes])

  function effJ(t:Tache):number{
    return effortEffectif(t,childMap)
  }
  const totalEffort=filtered.reduce((s,t)=>s+effJ(t),0)
  const PAGE_SIZE=50
  const filteredPaged=useMemo(()=>{
    const start=(page-1)*PAGE_SIZE
    return filtered.slice(start,start+PAGE_SIZE)
  },[filtered,page])
  const totalPages=Math.ceil(filtered.length/PAGE_SIZE)

  // Regroupement sur l'ensemble filtré (pas la page en cours) : sinon un Epic
  // dont les tâches sont réparties sur deux pages apparaît deux fois (une
  // fois par page), chacune avec un sous-ensemble différent de ses tâches.
  const groups:{key:string;tasks:Tache[]}[] =
    groupBy==='epic'  ? epicListe.map(e=>({key:e,tasks:filtered.filter(t=>t.epic===e)})).filter(g=>g.tasks.length) :
    groupBy==='jalon' ? jalonCodes.map(j=>({key:j,tasks:filtered.filter(t=>t.jalon===j)})).filter(g=>g.tasks.length) :
    [{key:'all',tasks:filteredPaged}]

  // Le détail complet (champs, itérations, dépendances) vit dans
  // TacheDetailPanel — composant partagé avec la vue sprint de Setup.
  function openPanel(t:Tache){
    setPanelId(t.id_tache)
  }

  // Ligne de tableau, réutilisée pour les racines (Conteneur ou US) ET pour
  // les US rattachées à un Conteneur (indent=true) — ces dernières restent
  // de vraies US (toutes les colonnes, propre bouton "SS"), contrairement
  // aux sous-tâches feuilles qui gardent le résumé abrégé "↳ id — titre".
  // Un Conteneur n'a jamais lui-même de parent (garanti côté création/panneau),
  // donc la récursion s'arrête toujours à ce seul niveau d'indentation.
  function renderRow(t:Tache,indent:boolean){
    const subs=childMap[t.id_tache]??[]
    const isClosed=closedSprints.includes(t.sprint??'')
    const isExp=expanded.includes(t.id_tache)
    const isConteneur=t.type_tache==='Conteneur'
    const spDisplay=(t.sprint_debut&&t.sprint_fin&&t.sprint_debut!==t.sprint_fin)
      ?`${t.sprint_debut}→${t.sprint_fin}`:(t.sprint_debut||t.sprint||'—')
    return (
      <React.Fragment key={t.id_tache}>
        <tr className={cn('cursor-pointer',isConteneur&&'bg-slate-50/60',selected.includes(t.id_tache)&&'bg-indigo-50',panelId===t.id_tache&&'!bg-indigo-100')}
          onClick={()=>openPanel(t)}>
          <td onClick={e=>e.stopPropagation()}>
            <input type="checkbox" checked={selected.includes(t.id_tache)} className="accent-indigo-500 w-3.5 h-3.5"
              onChange={e=>setSelected(prev=>e.target.checked?[...prev,t.id_tache]:prev.filter(x=>x!==t.id_tache))}/>
          </td>
          <td className="font-semibold text-indigo-600 whitespace-nowrap">
            <div className={cn('flex items-center gap-1',indent&&'pl-4')}>
              {indent&&<CornerDownRight size={10} className="text-subtle shrink-0"/>}
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
          <td className="max-w-[200px]"><div className="truncate font-medium flex items-center gap-1.5">
            {isConteneur && <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">Conteneur</span>}
            {t.titre}
          </div></td>
          <td>{t.type_fonction?<TypeFonctionBadge value={t.type_fonction}/>:<span className="text-subtle">—</span>}</td>
          <td>
            <div className="flex items-center gap-1.5">
              <StatutBadge value={t.statut}/>
              {(()=>{const blockers=isBloqueeParDependance(t.id_tache,dependances,allTaches)
                return blockers.length>0 && (
                  <span title={`Bloquée par : ${blockers.join(', ')}`}
                    className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                    ⛔ {blockers.length}
                  </span>
                )})()}
            </div>
          </td>
          <td className="text-center">{t.priorite?<PrioBadge value={t.priorite}/>:<span className="text-subtle">—</span>}</td>
          <td>{t.moscow?<MoscowBadge value={t.moscow}/>:<span className="text-subtle">—</span>}</td>
          <td><EpicBadge value={t.epic??''} color={epicColorMap.get(t.epic??'') ?? undefined} bg={epicBgMap.get(t.epic??'') ?? undefined}/></td>
          <td className="text-center">{t.jalon?<JalonBadge value={t.jalon} color={jalonColorMap.get(t.jalon)}/>:<span className="text-subtle">—</span>}</td>
          <td className="text-subtle whitespace-nowrap text-xs">{spDisplay}</td>
          <td className="text-xs font-semibold text-navy">{t.assigne_a||<span className="text-subtle font-normal">—</span>}</td>
          <td className="text-xs text-subtle truncate max-w-[120px]">{t.equipe||'—'}</td>
          <td className="text-xs text-subtle truncate max-w-[140px]">{t.metier||'—'}</td>
          <td onClick={e=>e.stopPropagation()}>
            {!isClosed&&!isSousTache(t,byId)&&(
              <button onClick={()=>setSousTacheParent(t)}
                className="ds-btn ds-btn-sm flex items-center gap-1"><CornerDownRight size={11}/> SS</button>
            )}
          </td>
        </tr>
        {isExp&&(isConteneur
          ? subs.map(s=>renderRow(s,true))
          : subs.map(s=>(
              <tr key={s.id_tache} className="cursor-pointer !bg-bg/50" onClick={()=>openPanel(s)}>
                <td/><td className="pl-8 text-subtle whitespace-nowrap">↳ {s.id_tache}</td>
                <td className="italic text-subtle">{s.titre}</td>
                <td><StatutBadge value={s.statut}/></td>
                <td colSpan={10}/>
              </tr>
            )))}
      </React.Fragment>
    )
  }

  // Ouvre automatiquement la tâche visée par une notification (?focus=ID_TACHE)
  useEffect(()=>{
    if(!initFocusId) return
    const t=taches.find(x=>x.id_tache===initFocusId)
    if(t){
      openPanel(t)
      // Déplie tout le chemin (jusqu'à 2 ancêtres : Conteneur > US > sous-tâche)
      const toExpand:string[]=[]
      if(t.parent_id){
        toExpand.push(t.parent_id)
        const parentTask=taches.find(x=>x.id_tache===t.parent_id)
        if(parentTask?.parent_id) toExpand.push(parentTask.parent_id)
      }
      if(toExpand.length) setExpanded(prev=>[...new Set([...prev,...toExpand])])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[initFocusId,taches.length])

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

  // Duplique une tâche ET toute sa descendance (childMap) : gère aussi bien
  // une simple US (+ sous-tâches) qu'un Conteneur (+ US qu'il contient, elles-
  // mêmes avec leurs sous-tâches) — même logique récursive dans les deux cas.
  async function duplicateTacheRecursive(t:Tache,newParentId:string|null,opts:{epic?:string;sprint?:string}={}):Promise<Tache>{
    const sprintFields = opts.sprint!==undefined ? {sprint:opts.sprint,sprint_debut:opts.sprint,sprint_fin:opts.sprint} : {}
    const newT=await createTache.mutateAsync({
      ...t,id:undefined,id_tache:undefined,parent_id:newParentId,
      epic:opts.epic??t.epic,statut:'À faire',iteration:(t.iteration??1)+1,
      ...(newParentId?{}:{commentaire:`Dupliqué depuis ${t.id_tache}`}),
      ...sprintFields,
    } as Partial<Tache>)
    for(const child of (childMap[t.id_tache]??[])) await duplicateTacheRecursive(child,newT.id_tache,opts)
    return newT
  }

  // Duplique des tâches racines (US ou Conteneur, avec tout leur contenu) vers un sprint cible ('' = backlog)
  async function duplicateIds(ids:string[],target:string){
    let count=0
    for(const id of ids){
      const t=parents.find(p=>p.id_tache===id); if(!t) continue
      await duplicateTacheRecursive(t,null,{sprint:target})
      count++
    }
    toast(`✅ ${count} élément(s) dupliqué(s) vers ${target||'le backlog'}`)
  }

  // Duplique un Epic entier : crée un nouvel Epic (code suivant disponible)
  // puis duplique récursivement tout son contenu (Conteneurs/US/sous-tâches).
  async function duplicateEpic(epicLabel:string){
    const epic=epicsList.find(e=>epicFullName(e)===epicLabel); if(!epic) return
    const ok=await confirm({title:`Dupliquer l'Epic "${epic.nom}" ?`,message:'Toutes les tâches de cet Epic (Conteneurs, US, sous-tâches) seront dupliquées dans un nouvel Epic.',confirmLabel:'Dupliquer'})
    if(!ok) return
    const nums=epicsList.map(e=>parseInt(e.code.replace(/\D/g,''),10)).filter(n=>!isNaN(n))
    const nextNum=nums.length?Math.max(...nums)+1:1
    const newCode=`EPIC ${nextNum}`
    const newNom=`${epic.nom} (copie)`
    await createEpic.mutateAsync({code:newCode,nom:newNom,couleur:epic.couleur??'#4A4CC8',bg_couleur:epic.bg_couleur??'#EEF2FF'})
    const newEpicLabel=epicFullName({code:newCode,nom:newNom})
    const roots=parents.filter(t=>t.epic===epicLabel)
    for(const t of roots) await duplicateTacheRecursive(t,null,{epic:newEpicLabel})
    toast(`✅ Epic dupliqué : ${newCode} — ${newNom}`)
  }

  // Vide un Epic : supprime TOUTES ses tâches (Conteneurs, US, sous-tâches),
  // récursivement via la vraie hiérarchie (childMap) — pas via le seul champ
  // texte `epic` des tâches, qui peut être désynchronisé sur des descendants
  // (ex: bulk-edit de l'Epic sur une US sans cascade sur ses sous-tâches).
  // Réservé aux admins : action destructive et irréversible sur tout un Epic.
  function collectSubtreeIds(t:Tache):string[]{
    const subs=childMap[t.id_tache]??[]
    return [t.id_tache, ...subs.flatMap(collectSubtreeIds)]
  }
  async function clearEpic(epicLabel:string){
    const roots=parents.filter(t=>t.epic===epicLabel)
    const ids=roots.flatMap(collectSubtreeIds)
    if(!ids.length){ toast('Aucune tâche dans cet Epic','error'); return }
    const ok=await confirm({
      title:`Vider l'Epic "${epicShortName(epicLabel)}" ?`,
      message:`⚠️ Attention : ${ids.length} tâche(s) (Conteneurs, US, sous-tâches) de cet Epic vont être supprimées DÉFINITIVEMENT. Cette action est irréversible.`,
      confirmLabel:'Supprimer définitivement',variant:'danger',
    })
    if(!ok) return
    try {
      for(const id of ids) await deleteTache.mutateAsync(id)
      toast(`✅ ${ids.length} tâche(s) supprimée(s) de l'Epic`)
    } catch(e) {
      toast(e instanceof Error ? e.message : 'Erreur lors de la suppression', 'error')
    }
  }

  async function deleteIds(ids:string[]):Promise<boolean>{
    const ok=await confirm({title:`Supprimer ${ids.length>1?`${ids.length} éléments`:ids[0]} ?`,message:'Action irréversible. Les tâches et leurs sous-tâches seront supprimées.',confirmLabel:'Supprimer',variant:'danger'})
    if(!ok) return false
    try {
      for(const id of ids) await deleteTache.mutateAsync(id)
      toast(`✅ ${ids.length} élément(s) supprimé(s)`)
      return true
    } catch(e) {
      toast(e instanceof Error ? e.message : 'Erreur lors de la suppression', 'error')
      return false
    }
  }

  return (
    <div className="flex gap-4">
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <ToggleGroup value={groupBy} onChange={v=>{setGroupBy(v);setPage(1)}} className="shrink-0" options={[
            { key: 'epic',  label: 'Par Epic',  icon: <BookOpen size={11}/> },
            { key: 'jalon', label: 'Par Jalon - Incrément majeur', icon: <Target size={11}/> },
            { key: 'none',  label: 'Aucun',     icon: <AlignJustify size={11}/> },
          ]} />
          <div className="ds-searchbar flex-1">
            <Search size={13} className="text-subtle"/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Rechercher ID, titre…"/>
            {search&&<button onClick={()=>setSearch('')}><X size={12} className="text-subtle"/></button>}
          </div>
          <button onClick={()=>setShowFilters(v=>!v)}
            className={cn('relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shrink-0',
              showFilters?'bg-brand text-white border-navy':'bg-card text-subtle border-border hover:text-navy')}>
            <SlidersHorizontal size={13}/>
            Filtres
            {!showFilters && hasActiveFilters && (
              <span className="absolute -top-1.5 -right-1.5 bg-indigo-500 text-white text-[11px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          <span className="text-xs text-subtle shrink-0">{filtered.length} US · {totalEffort}j</span>
        </div>

        {showFilters && <div className="bg-bg border border-border rounded-xl p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="ds-label w-12 shrink-0">Epic</span>
            <div className="flex gap-1.5 flex-wrap">
              {epicListe.map(epic=>(
                <FilterChip key={epic} label={epicCode(epic)} active={selEpics.includes(epic)}
                  onClick={()=>{setSelEpics(prev=>toggleIn(prev,epic));setPage(1)}}
                  activeBg={epicColorMap.get(epic) ?? '#6366F1'} activeText="#fff"/>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="ds-label shrink-0">Jalon - Incrément majeur</span>
              <div className="flex gap-1.5">
                {jalonCodes.map(j=>(
                  <FilterChip key={j} label={j} active={selJalons.includes(j)}
                    onClick={()=>{setSelJalons(prev=>toggleIn(prev,j));setPage(1)}}/>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="ds-label w-12 shrink-0">Statut</span>
              <div className="flex gap-1.5 flex-wrap">
                {STATUTS_FILTRE.map(s=>{const sc=STATUT_CHIP_COLORS[s]; return (
                  <FilterChip key={s} label={s} active={selStatuts.includes(s)}
                    onClick={()=>{setSelStatuts(prev=>toggleIn(prev,s));setPage(1)}}
                    activeBg={sc.bg} activeText={sc.text}/>
                )})}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="ds-label shrink-0">Autre</span>
              <FilterChip label="Epic manquant (à compléter)" active={showSansEpic}
                onClick={()=>{setShowSansEpic(v=>!v);setPage(1)}}
                activeBg="#EA580C" activeText="#fff"/>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="ds-label w-12 shrink-0">MoSCoW</span>
              <div className="flex gap-1.5 flex-wrap">
                {MOSCOWS_FILTRE.map(m=>(
                  <FilterChip key={m} label={m.replace(' Have','')} active={selMoscows.includes(m)}
                    onClick={()=>{setSelMoscows(prev=>toggleIn(prev,m));setPage(1)}}/>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="ds-label w-12 shrink-0">Type</span>
              <div className="flex gap-1.5 flex-wrap">
                {TYPES_FN_FILTRE.map(tf=>(
                  <FilterChip key={tf} label={tf.replace('Fonction ','')} active={selTypes.includes(tf)}
                    onClick={()=>{setSelTypes(prev=>toggleIn(prev,tf));setPage(1)}}/>
                ))}
              </div>
            </div>
            {hasActiveFilters ? (
              <button onClick={resetFilters} className="ml-auto ds-btn ds-btn-sm flex items-center gap-1">
                <X size={11}/> Réinitialiser
              </button>
            ):null}
          </div>
        </div>}
        {selected.length>0&&(
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-600">{selected.length} élément(s) sélectionné(s) — appliquer à toutes :</span>
              <button onClick={()=>setSelected([])} className="text-subtle hover:text-red transition-colors"><X size={13}/></button>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <SelectPicker value={bulk.statut} onChange={v=>setBulk(b=>({...b,statut:v}))} className="w-36"
                options={['À faire','En cours','Fait','Bloqué'].map(s=>({value:s,label:s}))} placeholder="Statut…"/>
              <SelectPicker value={bulk.priorite} onChange={v=>setBulk(b=>({...b,priorite:v}))} className="w-24"
                options={['P1','P2','P3','P4'].map(p=>({value:p,label:p}))} placeholder="Priorité…"/>
              <SelectPicker value={bulk.moscow} onChange={v=>setBulk(b=>({...b,moscow:v}))} className="w-32"
                options={MOSCOW_LIST.map(m=>({value:m,label:m}))} placeholder="MoSCoW…"/>
              <SelectPicker value={bulk.epic} onChange={v=>setBulk(b=>({...b,epic:v}))} className="w-64"
                options={epicsList.map(e=>({value:epicFullName(e),label:epicFullName(e)}))} placeholder="Epic…" searchable/>
              <SelectPicker value={bulk.jalon} onChange={v=>setBulk(b=>({...b,jalon:v}))} className="w-52"
                options={jalonCodes.map(j=>({value:j,label:j}))} placeholder="Jalon - Incrément majeur…"/>
              <SelectPicker value={bulk.sprint_debut} onChange={v=>setBulk(b=>({...b,sprint_debut:v}))} className="w-32"
                options={sprintNumeros.map(s=>({value:s,label:s}))} placeholder="Sprint…"/>
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
            <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-indigo-200/60">
              <span className="text-[11px] font-semibold text-subtle uppercase tracking-wide">Autres actions</span>
              <SelectPicker value={dupTarget} onChange={setDupTarget} className="w-32"
                options={sprintNumeros.map(s=>({value:s,label:s}))} placeholder="Backlog"/>
              <button onClick={async()=>{await duplicateIds(selected,dupTarget);setSelected([])}}
                disabled={createTache.isPending}
                className="ds-btn ds-btn-sm flex items-center gap-1"><Copy size={11}/> Dupliquer</button>
              <button onClick={async()=>{if(await deleteIds(selected)) setSelected([])}}
                disabled={deleteTache.isPending}
                className="ds-btn-danger ds-btn-sm flex items-center gap-1 ml-auto"><Trash2 size={11}/> Supprimer</button>
            </div>
          </div>
        )}
        {/* ── Vue mobile : liste de cartes ── */}
        <div className="md:hidden flex flex-col gap-2">
          {filteredPaged.map(t=>{
            const subs=childMap[t.id_tache]??[]
            const blockers=isBloqueeParDependance(t.id_tache,dependances,allTaches)
            return (
              <div key={t.id_tache} onClick={()=>openPanel(t)}
                className={cn('bg-card border rounded-xl p-3 cursor-pointer',panelId===t.id_tache?'border-indigo-300 ring-1 ring-indigo-100':'border-border')}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-indigo-600 shrink-0">{t.id_tache}</span>
                  <EpicBadge value={t.epic??''} className="text-[11px]" color={epicColorMap.get(t.epic??'') ?? undefined} bg={epicBgMap.get(t.epic??'') ?? undefined}/>
                  {subs.length>0&&<span className="bg-indigo-100 text-indigo-600 px-1 rounded text-[11px] font-semibold shrink-0">{subs.filter(s=>s.statut==='Fait').length}/{subs.length}</span>}
                  {blockers.length>0&&<span className="ml-auto text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-full shrink-0">⛔ {blockers.length}</span>}
                </div>
                <p className="text-sm font-medium text-navy leading-snug mb-2">{t.titre}</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <StatutBadge value={t.statut}/>
                  {t.priorite&&<PrioBadge value={t.priorite}/>}
                  {t.moscow&&<MoscowBadge value={t.moscow}/>}
                  {t.jalon&&<JalonBadge value={t.jalon} color={jalonColorMap.get(t.jalon)}/>}
                  {t.assigne_a&&<span className="text-[11px] font-semibold text-navy bg-bg px-1.5 py-0.5 rounded-full">{t.assigne_a}</span>}
                  {(t.sprint_debut||t.sprint)&&<span className="text-[11px] text-subtle ml-auto">{t.sprint_debut||t.sprint}</span>}
                </div>
              </div>
            )
          })}
          {!filteredPaged.length&&(
            <div className="flex items-center justify-center h-20 border-2 border-dashed border-border rounded-xl text-subtle text-xs">Aucune tâche</div>
          )}
        </div>

        {/* ── Vue desktop : arbre façon explorateur pour "par Epic", tableau sinon ── */}
        <div className="hidden md:block bg-card border border-border rounded-xl overflow-x-auto">
          {groupBy==='epic' ? (
            <TacheTree
              filtered={filtered} childMap={childMap} epicsList={epicsList} epicColorMap={epicColorMap}
              byId={byId} allTaches={allTaches} selected={selected}
              onToggleSelect={(id,checked)=>setSelected(prev=>checked?[...prev,id]:prev.filter(x=>x!==id))}
              panelId={panelId} onOpenPanel={openPanel} dependances={dependances} updateTache={updateTache}
              onDuplicateEpic={duplicateEpic} isAdmin={isAdmin} onClearEpic={clearEpic}
              onQuickAdd={(epicLabel,conteneurParent)=>setQuickAdd({epicLabel,conteneurParent})}
              onAddSousTache={setSousTacheParent} iterationCounts={iterationCounts} lastIterSprints={lastIterSprints}
            />
          ) : (
          <table className="ds-table" style={{minWidth:'1400px'}}>
            <thead><tr>
              <th className="w-8 shrink-0"><input type="checkbox" className="accent-indigo-500 w-3.5 h-3.5"
                onChange={e=>setSelected(e.target.checked?filteredPaged.map(t=>t.id_tache):[])}
                checked={selected.length===filteredPaged.length&&filteredPaged.length>0}/></th>
              <th>ID</th>
              <th>Titre</th>
              <th>Type</th>
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
              {groups.map(group=>(
                <React.Fragment key={group.key}>
                  {groupBy!=='none'&&(
                    <tr className="group-row">
                      <td colSpan={14}>
                        <div className="flex items-center gap-2">
                          {`Jalon - Incrément majeur ${group.key}`}
                          <span className="text-subtle font-normal text-xs ml-1">
                            {group.tasks.length} US · {group.tasks.reduce((s,t)=>s+effJ(t),0)}j
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {group.tasks.map(t=>renderRow(t,false))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          )}
        </div>
        {groupBy==='none'&&totalPages>1&&(
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-card">
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

      {panelId&&(
        <TacheDetailPanel
          tacheId={panelId}
          onClose={()=>setPanelId(null)}
          onDuplicate={t=>duplicateIds([t.id_tache],'')}
          onDelete={t=>deleteIds([t.id_tache])}
        />
      )}

      {sousTacheParent&&(
        <SousTacheModal
          parent={sousTacheParent}
          membres={membresActifs}
          onClose={()=>setSousTacheParent(null)}
          onCreate={async payload=>{
            const res=await createSub.mutateAsync({parentId:sousTacheParent.id_tache,payload})
            toast(`✅ ${res.id_tache} créée`)
          }}
        />
      )}

      {quickAdd&&(
        <QuickAddModal
          epicLabel={quickAdd.epicLabel}
          conteneurParent={quickAdd.conteneurParent}
          membres={membresActifs}
          onClose={()=>setQuickAdd(null)}
          onCreate={async payload=>{
            if(quickAdd.conteneurParent){
              const res=await createSub.mutateAsync({parentId:quickAdd.conteneurParent.id_tache,payload})
              toast(`✅ ${res.id_tache} créée`)
            } else {
              const res=await createTache.mutateAsync(payload)
              toast(`✅ ${res.id_tache} créée`)
            }
          }}
        />
      )}

    </div>
  )
}
