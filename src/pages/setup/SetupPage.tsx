import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { useProduit } from '@/contexts/ProduitContext'
import { Spinner } from '@/components/ui/Spinner'
import { SprintStatutBadge, StatutBadge } from '@/components/ui/Badge'
import { useEquipes, useEquipe, useCreateEquipe, useUpdateEquipe, useDeleteEquipe, useAddMembre, useUpdateMembre, useDeleteMembre } from '@/hooks/useEquipes'
import { useAllProfiles } from '@/hooks/useUserManagement'
import { useSprints, useSprintActif, useUpsertSprint, useDeleteSprint } from '@/hooks/useSprints'
import { useTaches, useUpdateTache } from '@/hooks/useTaches'
import { useToast } from '@/hooks/useToast'
import { confirm } from '@/components/ui/ConfirmModal'
import { supabase } from '@/lib/supabase'
import { exportSprintReviewHTML } from '@/lib/exportPdf'
import { downloadCSV } from '@/lib/utils'
import { EPIC_COLORS, JALON_LIST, JALON_COLORS, METIERS_DEFAULT, SPRINTS_LIST, BRAND_COLORS } from '@/constants'
import { Pencil, Trash2, Plus, ChevronDown, ChevronRight, Check, X, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Equipe, SprintStats } from '@/types'

type SetupTab = 'equipes'|'sprints'|'epics'|'jalons'|'metiers'|'export'

const GLOBAL_TABS:{key:SetupTab;label:string}[] = [
  {key:'equipes', label:'👥 Équipes'},
  {key:'metiers', label:'🏷️ Thèmes'},
]
const PRODUCT_TABS:{key:SetupTab;label:string}[] = [
  {key:'sprints', label:'📅 Sprints'},
  {key:'epics',   label:'📖 Epics'},
  {key:'jalons',  label:'🎯 Jalons'},
  {key:'export',  label:'⬇️ Export'},
]

export default function SetupPage() {
  const [params]         = useSearchParams()
  const { produitActif } = useProduit()
  const tabs             = produitActif ? [...GLOBAL_TABS, ...PRODUCT_TABS] : GLOBAL_TABS
  const [tab,setTab]     = useState<SetupTab>('equipes')

  useEffect(()=>{
    const t = params.get('tab') as SetupTab
    const valid = tabs.map(x=>x.key)
    setTab(t && valid.includes(t) ? t : 'equipes')
  },[params, produitActif])

  return (
    <Layout>
      <div className="page-topbar -mx-3 -mt-3 mb-3 px-3 md:-mx-5 md:-mt-5 md:mb-5 md:px-5">
        <div className="flex gap-0.5 bg-bg border border-border rounded-lg p-0.5 flex-wrap">
          {tabs.map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)}
              className={cn('px-4 py-1.5 rounded-md text-xs font-semibold transition-all',
                tab===t.key?'bg-white shadow-sm text-navy':'text-subtle hover:text-navy')}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab==='equipes'&&<EquipesTab/>}
      {tab==='sprints'&&<SprintsTab/>}
      {tab==='epics'  &&<EpicsTab/>}
      {tab==='jalons' &&<JalonsTab/>}
      {tab==='metiers'&&<MetiersTab/>}
      {tab==='export' &&<ExportTab/>}
    </Layout>
  )
}

// ─── Inline edit field ────────────────────────────────────────
function InlineEdit({value, onSave, placeholder=''}:{value:string;onSave:(v:string)=>void;placeholder?:string}) {
  const [editing,setEditing]=useState(false)
  const [val,setVal]=useState(value)
  const ref=useRef<HTMLInputElement>(null)
  useEffect(()=>{if(editing) ref.current?.focus()},[editing])
  if(!editing) return (
    <button onClick={()=>{setVal(value);setEditing(true)}} className="flex items-center gap-1 text-sm font-semibold text-navy hover:text-purple transition-colors group">
      {value||<span className="text-subtle italic">{placeholder}</span>}
      <Pencil size={11} className="opacity-0 group-hover:opacity-60"/>
    </button>
  )
  return (
    <div className="flex items-center gap-1">
      <input ref={ref} value={val} onChange={e=>setVal(e.target.value)}
        className="ds-input py-0.5 text-sm font-semibold w-48"
        onKeyDown={e=>{if(e.key==='Enter'){onSave(val);setEditing(false)}if(e.key==='Escape')setEditing(false)}}/>
      <button onClick={()=>{onSave(val);setEditing(false)}} className="p-1 rounded-lg bg-green/10 text-green hover:bg-green/20"><Check size={12}/></button>
      <button onClick={()=>setEditing(false)} className="p-1 rounded-lg bg-red/10 text-red hover:bg-red/20"><X size={12}/></button>
    </div>
  )
}

// ─── ÉQUIPES TAB ──────────────────────────────────────────────
function EquipesTab() {
  const {data:equipes=[],isLoading:loadEq}=useEquipes()
  const {data:membres=[],isLoading:loadMbr}=useEquipe()
  const {data:profiles=[]}=useAllProfiles()
  const {data:taches=[]}=useTaches()
  const createEquipe=useCreateEquipe(), updateEquipe=useUpdateEquipe(), deleteEquipe=useDeleteEquipe()
  const addMembre=useAddMembre(), updateMembre=useUpdateMembre(), deleteMembre=useDeleteMembre()
  const toast=useToast()
  const [selEquipe,setSelEquipe]=useState<number|null>(null)
  const [newEquipeNom,setNewEquipeNom]=useState('')
  const [newEquipeCouleur,setNewEquipeCouleur]=useState('#4A4CC8')
  const [showAddMembre,setShowAddMembre]=useState(false)
  const [mbrForm,setMbrForm]=useState({trigramme:'',prenom:'',nom:'',role:'',couleur:BRAND_COLORS[0]})
  const setMf=(k:string)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>)=>setMbrForm(f=>({...f,[k]:e.target.value}))

  // Valeurs orphelines : présentes dans taches.equipe mais absentes de la table equipes
  const equipeNoms = new Set(equipes.map(e=>e.nom))
  const orphans = Array.from(new Set(
    taches.map(t=>t.equipe).filter((v): v is string => !!v && !equipeNoms.has(v))
  )).sort()

  if(loadEq||loadMbr) return <Spinner/>

  const selectedEquipe=equipes.find(e=>e.id===selEquipe)
  const membresOfEquipe=membres.filter(m=>m.equipe_id===selEquipe&&m.actif)
  const membresWithoutEquipe=membres.filter(m=>!m.equipe_id&&m.actif)

  async function createEq(){
    if(!newEquipeNom.trim()){toast('Nom obligatoire','error');return}
    await createEquipe.mutateAsync({nom:newEquipeNom.trim(),description:null,couleur:newEquipeCouleur,actif:true})
    toast(`Équipe "${newEquipeNom}" créée`); setNewEquipeNom('')
  }

  async function deleteEq(eq:Equipe){
    const hasMembres=membres.some(m=>m.equipe_id===eq.id)
    if(hasMembres&&!await confirm({title:"Supprimer l'équipe ?",message:`${eq.nom} a des membres qui seront désaffectés.`,confirmLabel:'Continuer',variant:'danger'})) return
    if(!hasMembres&&!await confirm({title:"Supprimer l'équipe ?",message:`${eq.nom} sera définitivement supprimée.`,confirmLabel:'Supprimer',variant:'danger'})) return
    await deleteEquipe.mutateAsync(eq.id); toast(`"${eq.nom}" supprimée`)
    if(selEquipe===eq.id) setSelEquipe(null)
  }

  async function addMbrToEquipe(){
    if(!mbrForm.trigramme||!mbrForm.prenom||!mbrForm.nom){toast('Champs obligatoires','error');return}
    await addMembre.mutateAsync({trigramme:mbrForm.trigramme.toUpperCase(),prenom:mbrForm.prenom,nom:mbrForm.nom,role:mbrForm.role,couleur:mbrForm.couleur,actif:true,equipe_id:selEquipe,user_id:null})
    toast(`${mbrForm.prenom} ${mbrForm.nom} ajouté`); setMbrForm({trigramme:'',prenom:'',nom:'',role:'',couleur:BRAND_COLORS[0]}); setShowAddMembre(false)
  }

  async function assignMembre(membreId:number, equipeId:number|null){
    await updateMembre.mutateAsync({id:membreId,updates:{equipe_id:equipeId}})
    toast(equipeId?'Membre affecté':'Membre retiré de l\'équipe')
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Liste équipes */}
      <div className="flex flex-col gap-3">
        <div className="ds-card">
          <div className="ds-card-title">Créer une équipe</div>
          <div className="flex flex-col gap-2">
            <input value={newEquipeNom} onChange={e=>setNewEquipeNom(e.target.value)} className="ds-input" placeholder="Nom de l'équipe…"
              onKeyDown={e=>{if(e.key==='Enter') createEq()}}/>
            <div className="flex gap-1.5 flex-wrap">
              {BRAND_COLORS.map(c=>(
                <button key={c} type="button" onClick={()=>setNewEquipeCouleur(c)}
                  className={cn('w-5 h-5 rounded-full transition-transform hover:scale-110',newEquipeCouleur===c&&'ring-2 ring-navy ring-offset-1')}
                  style={{background:c}}/>
              ))}
            </div>
            <button onClick={createEq} className="ds-btn-primary" disabled={createEquipe.isPending}><Plus size={13}/>Créer</button>
          </div>
        </div>

        <div className="ds-card">
          <div className="ds-card-title">Équipes ({equipes.length})</div>
          <div className="flex flex-col gap-1.5">
            {equipes.filter(e=>e.actif).map(eq=>{
              const nb=membres.filter(m=>m.equipe_id===eq.id&&m.actif).length
              const isSelected=selEquipe===eq.id
              return (
                <div key={eq.id}
                  className={cn('flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all',
                    isSelected?'border-purple bg-purple/5':'border-border bg-white hover:border-purple/30')}>
                  <div className="w-3 h-3 rounded-full shrink-0" style={{background:eq.couleur??'#4A4CC8'}}/>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={()=>setSelEquipe(isSelected?null:eq.id)}>
                    <InlineEdit value={eq.nom} onSave={v=>updateEquipe.mutateAsync({id:eq.id,updates:{nom:v}})}/>
                    <div className="text-xs text-subtle">{nb} membre{nb>1?'s':''}</div>
                  </div>
                  <button onClick={()=>deleteEq(eq)} className="p-1 rounded hover:bg-red/10 text-subtle hover:text-red shrink-0"><Trash2 size={12}/></button>
                </div>
              )
            })}
            {!equipes.length&&<p className="text-subtle text-xs">Aucune équipe créée.</p>}
          </div>
        </div>
      </div>

      {/* Détail équipe sélectionnée */}
      <div className="lg:col-span-2 flex flex-col gap-4">
        {selectedEquipe ? (
          <>
            <div className="ds-card">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full" style={{background:selectedEquipe.couleur??'#4A4CC8'}}/>
                <div>
                  <InlineEdit value={selectedEquipe.nom} onSave={v=>updateEquipe.mutateAsync({id:selectedEquipe.id,updates:{nom:v}})}/>
                  <div className="text-xs text-subtle">{membresOfEquipe.length} membre{membresOfEquipe.length>1?'s':''}</div>
                </div>
                <button onClick={()=>setShowAddMembre(s=>!s)} className="ds-btn-primary ml-auto ds-btn-sm"><Plus size={12}/>Ajouter membre</button>
              </div>

              {showAddMembre&&(
                <div className="bg-bg border border-border rounded-xl p-3 mb-3 flex flex-col gap-2 animate-in">
                  <div className="grid grid-cols-3 gap-2">
                    <div><div className="ds-label mb-1">Trigramme *</div><input value={mbrForm.trigramme} onChange={e=>setMbrForm(f=>({...f,trigramme:e.target.value.toUpperCase()}))} className="ds-input" maxLength={4} placeholder="JDU"/></div>
                    <div><div className="ds-label mb-1">Prénom *</div><input value={mbrForm.prenom} onChange={setMf('prenom')} className="ds-input" placeholder="Jean"/></div>
                    <div><div className="ds-label mb-1">Nom *</div><input value={mbrForm.nom} onChange={setMf('nom')} className="ds-input" placeholder="Dupont"/></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><div className="ds-label mb-1">Rôle</div><input value={mbrForm.role} onChange={setMf('role')} className="ds-input" placeholder="PO, BE Mécanique…"/></div>
                    <div><div className="ds-label mb-1">Couleur</div>
                      <div className="flex gap-1.5 flex-wrap mt-1">
                        {BRAND_COLORS.map(c=>(
                          <button key={c} type="button" onClick={()=>setMbrForm(f=>({...f,couleur:c}))}
                            className={cn('w-5 h-5 rounded-full transition-transform hover:scale-110',mbrForm.couleur===c&&'ring-2 ring-navy ring-offset-1')}
                            style={{background:c}}/>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={()=>setShowAddMembre(false)} className="ds-btn ds-btn-sm">Annuler</button>
                    <button onClick={addMbrToEquipe} className="ds-btn-primary ds-btn-sm" disabled={addMembre.isPending}>Ajouter</button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {membresOfEquipe.map(m=>{
                  const linkedProfile = profiles.find(p=>p.user_id===m.user_id)
                  return (
                  <div key={m.id} className="flex flex-col gap-1.5 p-2.5 bg-bg rounded-xl border border-border">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0" style={{background:m.couleur??'#4A4CC8'}}>{m.trigramme}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-navy">{m.prenom} {m.nom}</div>
                        <div className="text-xs text-subtle">{m.role||'—'}</div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={async()=>{
                          const prenom=window.prompt('Prénom :',m.prenom)??m.prenom
                          const nom=window.prompt('Nom :',m.nom)??m.nom
                          const role=window.prompt('Rôle :',m.role??'')??m.role??''
                          await updateMembre.mutateAsync({id:m.id,updates:{prenom,nom,role}});toast('Modifié')
                        }} className="p-1.5 rounded hover:bg-white text-subtle hover:text-navy"><Pencil size={11}/></button>
                        <button onClick={()=>assignMembre(m.id,null)} title="Retirer de l'équipe" className="p-1.5 rounded hover:bg-orange/10 text-subtle hover:text-orange"><Users size={11}/></button>
                        <button onClick={async()=>{if(!await confirm({title:'Supprimer ce membre ?',message:`${m.prenom} ${m.nom} sera supprimé.`,confirmLabel:'Supprimer',variant:'danger'}))return;await deleteMembre.mutateAsync(m.id);toast('Supprimé')}} className="p-1.5 rounded hover:bg-red/10 text-subtle hover:text-red"><Trash2 size={11}/></button>
                      </div>
                    </div>
                    {/* Lien compte utilisateur */}
                    <div className="flex items-center gap-1.5 pl-10">
                      <select
                        value={m.user_id??''}
                        onChange={async e=>{
                          const val=e.target.value||null
                          await updateMembre.mutateAsync({id:m.id,updates:{user_id:val}})
                          toast(val?'Compte lié':'Compte dissocié')
                        }}
                        className="text-xs py-0.5 px-2 rounded-lg border border-border bg-white text-subtle w-full max-w-[180px] cursor-pointer focus:outline-none focus:border-purple/50"
                      >
                        <option value="">— Aucun compte lié —</option>
                        {profiles.map(p=>(
                          <option key={p.user_id} value={p.user_id}>{p.display_name}</option>
                        ))}
                      </select>
                      {linkedProfile&&(
                        <span className="text-[10px] text-purple font-semibold truncate">✓ {linkedProfile.display_name}</span>
                      )}
                    </div>
                  </div>
                )})}
                {!membresOfEquipe.length&&<p className="text-subtle text-xs col-span-2">Aucun membre. Utilisez le bouton "Ajouter membre" ou affectez des membres sans équipe ci-dessous.</p>}
              </div>
            </div>

            {membresWithoutEquipe.length>0&&(
              <div className="ds-card">
                <div className="ds-card-title">Membres sans équipe — cliquer pour affecter à {selectedEquipe.nom}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {membresWithoutEquipe.map(m=>(
                    <button key={m.id} onClick={()=>assignMembre(m.id,selectedEquipe.id)}
                      className="flex items-center gap-2 p-2.5 bg-bg rounded-xl border border-dashed border-border hover:border-purple hover:bg-purple/5 transition-all text-left">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0" style={{background:m.couleur??'#4A4CC8'}}>{m.trigramme}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-navy">{m.prenom} {m.nom}</div>
                        <div className="text-xs text-subtle">{m.role||'—'}</div>
                      </div>
                      <Plus size={12} className="text-subtle"/>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="ds-card flex flex-col items-center justify-center py-16 text-subtle gap-3">
            <Users size={40} className="opacity-20"/>
            <p className="text-sm font-medium">Sélectionnez une équipe</p>
            <p className="text-xs">Cliquez sur une équipe dans la liste pour gérer ses membres</p>
          </div>
        )}
      </div>

      {/* ── Nettoyage : valeurs orphelines dans taches.equipe ── */}
      {orphans.length>0&&(
        <div className="lg:col-span-3 ds-card border-orange/30 bg-orange/5 mt-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-orange"/>
            <div className="ds-card-title mb-0">Valeurs non référencées dans les tâches ({orphans.length})</div>
          </div>
          <p className="text-xs text-subtle mb-3">
            Ces noms d'équipe existent dans des tâches mais n'ont pas d'entrée dans la table Équipes.
            Créez-les comme équipe ou remap-lez vers une équipe existante pour aligner les données.
          </p>
          <div className="flex flex-col gap-2">
            {orphans.map(orphan=>(
              <OrphanEquipeRow key={orphan} orphan={orphan} equipes={equipes}
                onCreateEquipe={async()=>{
                  await createEquipe.mutateAsync({nom:orphan,description:null,couleur:BRAND_COLORS[0],actif:true})
                  toast(`Équipe "${orphan}" créée`)
                }}
                onRemap={async(targetNom)=>{
                  if(!await confirm({title:'Remapper les tâches ?',message:`Toutes les tâches avec équipe "${orphan}" seront mises à jour vers "${targetNom}".`,confirmLabel:'Remapper'})) return
                  await supabase.from('taches').update({equipe:targetNom}).eq('equipe',orphan)
                  toast(`${orphan} → ${targetNom}`)
                }}
                onClear={async()=>{
                  if(!await confirm({title:'Vider le champ équipe ?',message:`Les tâches avec "${orphan}" n'auront plus d'équipe.`,confirmLabel:'Vider',variant:'danger'})) return
                  await supabase.from('taches').update({equipe:null}).eq('equipe',orphan)
                  toast(`Champ équipe vidé pour "${orphan}"`)
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function OrphanEquipeRow({orphan,equipes,onCreateEquipe,onRemap,onClear}:{
  orphan:string; equipes:Equipe[]
  onCreateEquipe:()=>void; onRemap:(nom:string)=>void; onClear:()=>void
}) {
  const [remapTarget,setRemapTarget]=useState('')
  return (
    <div className="flex flex-wrap items-center gap-2 p-2.5 bg-white rounded-xl border border-orange/20">
      <span className="text-sm font-semibold text-navy flex-1 min-w-0 truncate">"{orphan}"</span>
      <button onClick={onCreateEquipe} className="ds-btn ds-btn-sm text-green hover:bg-green/10">
        <Plus size={11}/>Créer comme équipe
      </button>
      <div className="flex items-center gap-1">
        <select value={remapTarget} onChange={e=>setRemapTarget(e.target.value)} className="ds-select text-xs py-1 w-36">
          <option value="">Remapper vers…</option>
          {equipes.filter(e=>e.actif).map(e=><option key={e.id} value={e.nom}>{e.nom}</option>)}
        </select>
        <button onClick={()=>{if(remapTarget) onRemap(remapTarget)}} disabled={!remapTarget}
          className="ds-btn ds-btn-sm disabled:opacity-40">✓</button>
      </div>
      <button onClick={onClear} className="ds-btn ds-btn-sm text-subtle hover:text-red hover:bg-red/10">
        <Trash2 size={11}/>Vider
      </button>
    </div>
  )
}

// ─── SPRINTS TAB ──────────────────────────────────────────────
function SprintsTab() {
  const {data:sprints=[],isLoading}=useSprints()
  const {data:sprintActif}=useSprintActif()
  const {data:taches=[]}=useTaches()
  const upsertSprint=useUpsertSprint(),deleteSprint=useDeleteSprint()
  const updateTache=useUpdateTache()
  const toast=useToast()
  const [selected,setSelected]=useState('')
  const [showTasks,setShowTasks]=useState(true)
  const [freeObj,setFreeObj]=useState('')
  const [freeRev,setFreeRev]=useState('')
  const [items,setItems]=useState<string[]>([])
  const [checks,setChecks]=useState<Record<string,boolean>>({})
  const [newItem,setNewItem]=useState('')
  const [openChecklist,setOpenChecklist]=useState(true)
  const [closeModal,setCloseModal]=useState(false)
  const [tacheDest,setTacheDest]=useState<Record<string,'next'|'backlog'>>({})

  const sprint=sprints.find(s=>s.numero===selected)
  const spTaches=taches.filter(t=>!t.parent_id&&(t.sprint===selected||t.sprint_debut===selected))
  const unfinished=spTaches.filter(t=>t.statut!=='Fait')
  const statLabel:{[k:string]:string}={planifie:'planifié',en_cours:'en cours',pause:'en pause',cloture:'clôturé'}
  const doneCount=items.filter(i=>checks[i]).length
  const pct=items.length?Math.round(doneCount/items.length*100):0

  // Droits d'édition selon statut
  const canEditObj = !sprint || sprint.statut==='planifie' || sprint.statut==='pause'
  const canToggleCheck = !sprint || sprint.statut!=='cloture'

  // Sprint suivant dans la liste
  const nextSprint=(()=>{const idx=SPRINTS_LIST.indexOf(selected);return idx>=0&&idx<SPRINTS_LIST.length-1?SPRINTS_LIST[idx+1]:null})()

  function parseSprint(s:{objectifs?:string|null;review?:string|null}|undefined){
    const oLines=(s?.objectifs??'').split('\n')
    const parsed=oLines.filter(l=>l.trimStart().startsWith('- ')).map(l=>l.trimStart().slice(2).trim()).filter(Boolean)
    const fObj=oLines.filter(l=>!l.trimStart().startsWith('- ')).join('\n').trim()
    const rLines=(s?.review??'').split('\n')
    const ch:Record<string,boolean>={}
    parsed.forEach(i=>{ch[i]=false})
    rLines.filter(l=>l.trim().startsWith('[x] ')||l.trim().startsWith('[ ] ')).forEach(l=>{
      const ok=l.trim().startsWith('[x] ');const txt=l.trim().slice(4).trim();ch[txt]=ok
    })
    const fRev=rLines.filter(l=>!l.trim().startsWith('[x] ')&&!l.trim().startsWith('[ ] ')).join('\n').trim()
    setItems(parsed);setChecks(ch);setFreeObj(fObj);setFreeRev(fRev)
  }

  useEffect(()=>{
    if(sprintActif?.numero&&!selected){setSelected(sprintActif.numero);parseSprint(sprintActif)}
  },[sprintActif])

  function selectSprint(num:string){
    setSelected(num);parseSprint(sprints.find(x=>x.numero===num));setShowTasks(true)
  }

  async function action(type:'start'|'pause'|'close'|'unlock'){
    if(!selected){toast('Sélectionnez un sprint','error');return}
    if(type==='close'){
      if(unfinished.length>0){
        const dest:Record<string,'next'|'backlog'>={};
        unfinished.forEach(t=>{dest[t.id_tache]=nextSprint?'next':'backlog'})
        setTacheDest(dest);setCloseModal(true);return
      }
      await doClose(computeStats(spTaches));return
    }
    const now=new Date().toISOString()
    const map:{[k:string]:{statut:string;est_actif:boolean;started_at?:string}}={
      start:{statut:'en_cours',est_actif:true,started_at:now},
      pause:{statut:'pause',est_actif:false},
      unlock:{statut:'planifie',est_actif:false},
    }
    if(type==='start') await supabase.from('sprints').update({est_actif:false}).neq('numero',selected)
    await upsertSprint.mutateAsync({numero:selected,...map[type]} as Parameters<typeof upsertSprint.mutateAsync>[0])
    toast(`Sprint ${selected} mis à jour`)
  }

  function computeStats(tasks:typeof spTaches):SprintStats{
    const total=tasks.length
    const fait=tasks.filter(t=>t.statut==='Fait').length
    return{
      total,
      fait,
      encours: tasks.filter(t=>t.statut==='En cours').length,
      bloque:  tasks.filter(t=>t.statut==='Bloqué').length,
      effort:  tasks.reduce((s,t)=>s+(t.effort_j??0),0),
      pct:     total?Math.round(fait/total*100):0,
    }
  }

  async function doClose(stats:SprintStats){
    const now=new Date().toISOString()
    await upsertSprint.mutateAsync({numero:selected,statut:'cloture',est_actif:false,closed_at:now,stats} as Parameters<typeof upsertSprint.mutateAsync>[0])
    toast(`Sprint ${selected} clôturé`)
  }

  async function confirmClose(){
    // Snapshot des stats AVANT de déplacer les tâches
    const stats=computeStats(spTaches)
    for(const [id_tache,dest] of Object.entries(tacheDest)){
      if(dest==='next'&&nextSprint)
        await updateTache.mutateAsync({id_tache,updates:{sprint:nextSprint,sprint_debut:nextSprint}})
      else
        await updateTache.mutateAsync({id_tache,updates:{sprint:'',sprint_debut:null,sprint_fin:null}})
    }
    await doClose(stats)
    setCloseModal(false)
  }

  async function save(){
    if(!selected){toast('Sélectionnez un sprint','error');return}
    const objParts=[freeObj.trim(),...items.map(i=>`- ${i}`)].filter(Boolean)
    const revParts=[freeRev.trim(),...items.map(i=>`${checks[i]?'[x]':'[ ]'} ${i}`)].filter(Boolean)
    await upsertSprint.mutateAsync({numero:selected,objectifs:objParts.join('\n'),review:revParts.join('\n')} as Parameters<typeof upsertSprint.mutateAsync>[0])
    toast('Sauvegardé ✅')
  }

  function addItem(){
    const txt=newItem.trim();if(!txt)return
    setItems(p=>[...p,txt]);setChecks(p=>({...p,[txt]:false}));setNewItem('')
  }
  function removeItem(item:string){
    setItems(p=>p.filter(i=>i!==item));setChecks(p=>{const n={...p};delete n[item];return n})
  }
  function toggleCheck(item:string){if(canToggleCheck)setChecks(p=>({...p,[item]:!p[item]}))}

  if(isLoading) return <Spinner/>
  return (
    <>
    {/* ── Modal clôture avec US non terminées ──────────────── */}
    {closeModal&&(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
          <div className="p-5 border-b border-border">
            <h3 className="text-base font-bold text-navy">Clôturer le sprint {selected}</h3>
            <p className="text-sm text-subtle mt-1">{unfinished.length} US non terminée(s) — que faire avec ces US ?</p>
          </div>
          {/* Boutons globaux */}
          <div className="flex gap-2 px-5 pt-4">
            {nextSprint&&(
              <button onClick={()=>setTacheDest(Object.fromEntries(Object.keys(tacheDest).map(k=>[k,'next'])))}
                className="ds-btn ds-btn-sm flex-1">Tout → {nextSprint}</button>
            )}
            <button onClick={()=>setTacheDest(Object.fromEntries(Object.keys(tacheDest).map(k=>[k,'backlog'])))}
              className="ds-btn ds-btn-sm flex-1">Tout → Backlog</button>
          </div>
          {/* Liste par tâche */}
          <div className="flex flex-col gap-2 px-5 py-4 overflow-y-auto flex-1">
            {unfinished.map(t=>(
              <div key={t.id_tache} className="flex items-center gap-2 p-2.5 rounded-xl bg-bg text-xs">
                <span className="font-semibold text-purple w-16 shrink-0">{t.id_tache}</span>
                <span className="flex-1 truncate text-navy">{t.titre}</span>
                <div className="flex gap-1 shrink-0">
                  {nextSprint&&(
                    <button onClick={()=>setTacheDest(p=>({...p,[t.id_tache]:'next'}))}
                      className={cn('px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors',
                        tacheDest[t.id_tache]==='next'?'bg-purple text-white':'bg-border/60 text-subtle hover:bg-purple/20')}>
                      {nextSprint}
                    </button>
                  )}
                  <button onClick={()=>setTacheDest(p=>({...p,[t.id_tache]:'backlog'}))}
                    className={cn('px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors',
                      tacheDest[t.id_tache]==='backlog'?'bg-navy text-white':'bg-border/60 text-subtle hover:bg-navy/20')}>
                    Backlog
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 justify-end px-5 py-4 border-t border-border">
            <button onClick={()=>setCloseModal(false)} className="ds-btn ds-btn-sm">Annuler</button>
            <button onClick={confirmClose} disabled={updateTache.isPending}
              className="ds-btn-primary ds-btn-sm">Clôturer le sprint</button>
          </div>
        </div>
      </div>
    )}

    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Colonne gauche ────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <div className="ds-card">
            <div className="ds-card-title">Sprint</div>
            <select value={selected} onChange={e=>selectSprint(e.target.value)} className="ds-select mb-3">
              <option value="">-- Choisir --</option>
              {SPRINTS_LIST.map(s=>{const sp=sprints.find(x=>x.numero===s);return <option key={s} value={s}>{s}{sp?` — ${statLabel[sp.statut]||sp.statut}`:''}</option>})}
            </select>
            {sprint&&<div className="mb-3"><SprintStatutBadge value={sprint.statut}/></div>}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button onClick={()=>action('start')} disabled={!selected||sprint?.statut==='en_cours'} className="ds-btn text-xs py-1.5 bg-green text-white border-green hover:bg-green/90 disabled:opacity-40">▶ Démarrer</button>
              <button onClick={()=>action('pause')} disabled={!selected||sprint?.statut!=='en_cours'} className="ds-btn text-xs py-1.5 bg-orange text-white border-orange hover:bg-orange/90 disabled:opacity-40">⏸ Pause</button>
              <button onClick={()=>action('close')} disabled={!selected} className="ds-btn-primary text-xs py-1.5 disabled:opacity-40">✓ Clôturer</button>
              {sprint?.statut==='cloture'&&<button onClick={()=>action('unlock')} className="ds-btn text-xs py-1.5">🔓 Rouvrir</button>}
            </div>
            <div className="flex gap-2 pt-3 border-t border-border">
              <button className="ds-btn ds-btn-sm flex items-center gap-1" onClick={async()=>{
                const num=window.prompt('Numéro du nouveau sprint (ex: S17):');if(!num)return
                await upsertSprint.mutateAsync({numero:num.toUpperCase(),statut:'planifie',est_actif:false});toast(`Sprint ${num} créé`)
              }}><Plus size={11}/>Nouveau</button>
              <button className="ds-btn ds-btn-sm text-red hover:bg-red/10 flex items-center gap-1" onClick={async()=>{
                if(!selected){toast('Sélectionnez','error');return}
                if(spTaches.length>0){toast(`${spTaches.length} US dans ce sprint`,'error');return}
                if(!await confirm({title:'Supprimer ce sprint ?',message:`Le sprint ${selected} sera supprimé.`,confirmLabel:'Supprimer',variant:'danger'}))return
                await deleteSprint.mutateAsync(selected);toast('Supprimé');setSelected('')
              }}><Trash2 size={11}/>Supprimer</button>
              {sprint&&<button className="ds-btn ds-btn-sm flex items-center gap-1" onClick={()=>exportSprintReviewHTML(sprint,spTaches)}>📄 Export Review</button>}
            </div>
          </div>
          {sprint&&spTaches.length>0&&(()=>{
            // Stats live depuis spTaches — snapshot DB utilisé uniquement si clôturé sans tâches restantes
            const liveStats = computeStats(spTaches)
            const stats = sprint.statut==='cloture'&&sprint.stats&&spTaches.length===0 ? sprint.stats : liveStats
            const isClosed = sprint.statut==='cloture'
            return (
              <div className="ds-card">
                <div className="flex items-center gap-2 mb-3">
                  <div className="ds-card-title mb-0">{isClosed?'Stats clôture':'Stats en cours'}</div>
                  {!isClosed&&<span className="text-xs text-subtle italic">mise à jour en temps réel</span>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {([['Total US',stats.total],['Terminées',`${stats.fait} (${stats.pct}%)`],['En cours',stats.encours],['Bloquées',stats.bloque],['Effort total',`${stats.effort}j`]] as [string,string|number][]).map(([k,v])=>(
                    <div key={k} className="bg-bg rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-navy">{v}</div>
                      <div className="text-xs text-subtle">{k}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>

        {/* ── Colonne droite ─────────────────────────────────── */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Objectifs */}
            <div className={cn('ds-card flex flex-col gap-3',!canEditObj&&'opacity-70')}>
              <div className="flex items-center gap-2">
                <div className="ds-label mb-0 flex-1">Objectifs — {selected||'—'}</div>
                {!canEditObj&&<span className="text-xs text-orange font-semibold">🔒 Sprint en cours</span>}
              </div>
              <textarea value={freeObj} onChange={e=>setFreeObj(e.target.value)} rows={9}
                readOnly={!canEditObj}
                className={cn('ds-textarea w-full resize-y',!canEditObj&&'cursor-not-allowed bg-bg/50')}
                placeholder="Notes libres sur les objectifs…"/>
              <button onClick={()=>setOpenChecklist(o=>!o)}
                className="flex items-center gap-2 text-xs font-semibold text-navy hover:text-purple transition-colors">
                {openChecklist?<ChevronDown size={13}/>:<ChevronRight size={13}/>}
                Objectifs clés ({items.length})
                {canEditObj&&(
                  <div className="flex gap-1 ml-auto" onClick={e=>e.stopPropagation()}>
                    <input value={newItem} onChange={e=>setNewItem(e.target.value)}
                      onKeyDown={e=>e.key==='Enter'&&addItem()}
                      className="ds-input text-xs h-6 px-2 w-32" placeholder="Ajouter…"/>
                    <button onClick={addItem} className="ds-btn ds-btn-sm h-6 px-1.5"><Plus size={10}/></button>
                  </div>
                )}
              </button>
              {openChecklist&&(
                items.length===0
                  ? <p className="text-xs text-subtle italic pl-4">Aucun objectif clé</p>
                  : <ul className="flex flex-col gap-1 pl-4">
                    {items.map(item=>(
                      <li key={item} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-bg group text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple/50 shrink-0"/>
                        <span className="flex-1 text-navy">{item}</span>
                        {canEditObj&&(
                          <button onClick={()=>removeItem(item)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red/10 text-subtle hover:text-red transition-all"><X size={10}/></button>
                        )}
                      </li>
                    ))}
                  </ul>
              )}
            </div>

            {/* Review */}
            <div className="ds-card flex flex-col gap-3">
              <div className="ds-label mb-0">Sprint Review — {selected||'—'}</div>
              <textarea value={freeRev} onChange={e=>setFreeRev(e.target.value)} rows={9}
                className="ds-textarea w-full resize-y" placeholder="Bilan du sprint…"/>
              <button onClick={()=>setOpenChecklist(o=>!o)}
                className="flex items-center gap-2 text-xs font-semibold text-navy hover:text-purple transition-colors">
                {openChecklist?<ChevronDown size={13}/>:<ChevronRight size={13}/>}
                Checklist objectifs
                {items.length>0&&<span className={cn('ml-auto text-xs font-bold',pct===100?'text-green':'text-subtle')}>{doneCount}/{items.length} · {pct}%</span>}
              </button>
              {openChecklist&&(
                <>
                  {items.length>0&&(
                    <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-green rounded-full transition-all" style={{width:`${pct}%`}}/>
                    </div>
                  )}
                  {items.length===0
                    ? <p className="text-xs text-subtle italic pl-4">Définissez des objectifs clés côté Objectifs</p>
                    : <ul className="flex flex-col gap-1.5 pl-2">
                      {items.map(item=>(
                        <li key={item}
                          onClick={()=>toggleCheck(item)}
                          className={cn('flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition-colors text-xs',
                            canToggleCheck?'cursor-pointer':'cursor-default',
                            checks[item]?'bg-green/10 text-green':'bg-bg hover:bg-border/40 text-navy')}>
                          <span className={cn('w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors',
                            checks[item]?'bg-green border-green text-white':'border-border bg-white')}>
                            {checks[item]&&<Check size={10}/>}
                          </span>
                          <span className={cn('flex-1',checks[item]&&'line-through opacity-70')}>{item}</span>
                        </li>
                      ))}
                    </ul>
                  }
                </>
              )}
            </div>

            <button onClick={save} disabled={!selected} className="ds-btn-primary ds-btn-sm self-start disabled:opacity-40 col-span-2">Sauvegarder</button>
          </div>
        </div>
      </div>

      {/* ── US pleine largeur ───────────────────────────────── */}
      <SprintTaskManager selected={selected} taches={taches} showTasks={showTasks} setShowTasks={setShowTasks}/>
    </div>
    </>
  )
}

// ─── INLINE LIST (Epics/Jalons/Métiers) ──────────────────────
function InlineList({items,onRename,onDelete,colorFn,countFn,isSystem}:{
  items:string[];onRename:(old:string,next:string)=>void;onDelete:(nom:string)=>void
  colorFn:(s:string)=>string;countFn:(s:string)=>number;isSystem:(s:string)=>boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map(item=>{
        const color=colorFn(item), nb=countFn(item), sys=isSystem(item)
        return (
          <div key={item} className="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-border group">
            <div className="w-6 h-6 rounded-md shrink-0" style={{background:color}}/>
            <div className="flex-1 min-w-0">
              <InlineEdit value={item} onSave={v=>onRename(item,v)} placeholder={item}/>
              <div className="text-xs text-subtle">{nb} US{sys?' · Système':''}</div>
            </div>
            {nb===0&&(
              <button onClick={()=>onDelete(item)}
                className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red/10 text-subtle hover:text-red transition-all">
                <Trash2 size={12}/>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function EpicsTab() {
  const {data:taches=[]}=useTaches(); const toast=useToast()
  const [newNum,setNewNum]=useState(''), [newNom,setNewNom]=useState('')
  const counts:Record<string,number>={};taches.forEach(t=>{if(t.epic) counts[t.epic]=(counts[t.epic]??0)+1})
  const epics=Object.keys(counts).sort()
  async function rename(old:string,next:string){
    if(!next||next===old)return
    const ok1 = await confirm({title:'Renommer partout ?',message:`"${old}" → "${next}" dans toutes les tâches.`,confirmLabel:'Renommer'}); if(!ok1)return
    await supabase.from('taches').update({epic:next}).eq('epic',old); toast('Epic renommé')
  }
  async function del(nom:string){
    const ok2 = await confirm({title:'Supprimer cet Epic ?',message:`Les tâches perdront leur Epic.`,confirmLabel:'Supprimer',variant:'danger'}); if(!ok2)return
    await supabase.from('taches').update({epic:''}).eq('epic',nom); toast('Epic supprimé')
  }
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="ds-card flex items-end gap-2">
        <div className="flex-none"><div className="ds-label mb-1">Numéro</div><input value={newNum} onChange={e=>setNewNum(e.target.value)} className="ds-input w-28" placeholder="EPIC 14"/></div>
        <div className="flex-1"><div className="ds-label mb-1">Nom</div><input value={newNom} onChange={e=>setNewNom(e.target.value)} className="ds-input" placeholder="Nom de l'Epic"/></div>
        <button onClick={()=>{if(!newNum||!newNom)return;toast(`Epic "${newNum} — ${newNom}" prêt`);setNewNum('');setNewNom('')}} className="ds-btn-primary flex items-center gap-1"><Plus size={13}/>Ajouter</button>
      </div>
      <p className="text-xs text-subtle -mt-2">Cliquez sur le nom pour le renommer directement. Supprimer ne supprime pas les US mais vide leur champ Epic.</p>
      <InlineList items={epics}
        onRename={rename} onDelete={del}
        colorFn={s=>EPIC_COLORS[s]??'#4A4CC8'} countFn={s=>counts[s]??0} isSystem={()=>false}/>
    </div>
  )
}

function JalonsTab() {
  const {data:taches=[]}=useTaches(); const toast=useToast()
  const [code,setCode]=useState('')
  const counts:Record<string,number>={};taches.forEach(t=>{if(t.jalon) counts[t.jalon]=(counts[t.jalon]??0)+1})
  JALON_LIST.forEach(j=>{if(!counts[j]) counts[j]=0})
  const jalons=Object.keys(counts).sort()
  async function rename(old:string,next:string){
    if(!next||next===old)return
    const ok3 = await confirm({title:'Renommer partout ?',message:`"${old}" → "${next}" dans toutes les tâches.`,confirmLabel:'Renommer'}); if(!ok3)return
    await supabase.from('taches').update({jalon:next}).eq('jalon',old); toast('Jalon renommé')
  }
  async function del(nom:string){
    const ok4 = await confirm({title:'Supprimer ce Jalon ?',message:`Les tâches perdront leur jalon.`,confirmLabel:'Supprimer',variant:'danger'}); if(!ok4)return
    await supabase.from('taches').update({jalon:null}).eq('jalon',nom); toast('Jalon supprimé')
  }
  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <div className="ds-card flex items-end gap-2">
        <div><div className="ds-label mb-1">Code</div><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} className="ds-input w-20" maxLength={5} placeholder="I7"/></div>
        <button onClick={()=>{if(!code)return;toast(`Jalon "${code}" ajouté`);setCode('')}} className="ds-btn-primary flex items-center gap-1"><Plus size={13}/>Ajouter</button>
      </div>
      <p className="text-xs text-subtle -mt-2">Cliquez sur le code pour le renommer. Supprimer vide le champ Jalon des tâches concernées.</p>
      <InlineList items={jalons}
        onRename={rename} onDelete={del}
        colorFn={s=>JALON_COLORS[s]??'#4A4CC8'} countFn={s=>counts[s]??0}
        isSystem={s=>JALON_LIST.includes(s as typeof JALON_LIST[number])}/>
    </div>
  )
}

function MetiersTab() {
  const {data:taches=[]}=useTaches(); const toast=useToast()
  const [nom,setNom]=useState('')
  const counts:Record<string,number>={};taches.forEach(t=>{if(t.metier) counts[t.metier]=(counts[t.metier]??0)+1})
  const metiers=Object.keys(counts).sort()
  async function rename(old:string,next:string){
    if(!next||next===old)return
    const ok5 = await confirm({title:'Renommer partout ?',message:`"${old}" → "${next}" dans toutes les tâches.`,confirmLabel:'Renommer'}); if(!ok5)return
    await supabase.from('taches').update({metier:next}).eq('metier',old); toast('Métier renommé')
  }
  async function del(n:string){
    const ok6 = await confirm({title:'Supprimer ce Métier ?',message:`Les tâches perdront leur métier.`,confirmLabel:'Supprimer',variant:'danger'}); if(!ok6)return
    await supabase.from('taches').update({metier:null}).eq('metier',n); toast('Métier supprimé')
  }
  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <div className="ds-card flex items-end gap-2">
        <div className="flex-1"><div className="ds-label mb-1">Nom</div><input value={nom} onChange={e=>setNom(e.target.value)} className="ds-input" placeholder="Ex: Mécatronique"/></div>
        <button onClick={()=>{if(!nom)return;toast(`Métier "${nom}" ajouté`);setNom('')}} className="ds-btn-primary flex items-center gap-1"><Plus size={13}/>Ajouter</button>
      </div>
      <p className="text-xs text-subtle -mt-2">Cliquez sur le nom pour le renommer. Supprimer vide le champ Métier des tâches concernées.</p>
      <InlineList items={metiers}
        onRename={rename} onDelete={del}
        colorFn={()=>'#4A4CC8'} countFn={s=>counts[s]??0}
        isSystem={s=>METIERS_DEFAULT.includes(s)}/>
    </div>
  )
}


// ── Composant gestion US du sprint ───────────────────────────
function SprintTaskManager({selected,taches,showTasks,setShowTasks}:{
  selected:string;taches:ReturnType<typeof useTaches>['data'];showTasks:boolean;setShowTasks:(v:boolean)=>void
}) {
  const updateTache = useUpdateTache()
  const toast       = useToast()
  const [showAdd,  setShowAdd]   = useState(false)
  const [search,   setSearch]    = useState('')
  const [fEpic,    setFEpic]     = useState('')
  const [fStatut,  setFStatut]   = useState('')
  const [fMoscow,  setFMoscow]   = useState('')
  const [selection,setSelection] = useState<Set<string>>(new Set())
  const T = taches ?? []

  const spTaches  = T.filter(t=>!t.parent_id&&(t.sprint===selected||t.sprint_debut===selected))
  const available = T.filter(t=>!t.parent_id&&t.sprint!==selected&&t.sprint_debut!==selected)

  const epics   = [...new Set(available.map(t=>t.epic).filter(Boolean))].sort()
  const statuts = ['À faire','En cours','Fait','Bloqué']
  const moscows = ['Must Have','Should Have','Could Have',"Won't Have"]

  const filtered = available.filter(t=>{
    if(search   && !t.id_tache.toLowerCase().includes(search.toLowerCase()) && !t.titre.toLowerCase().includes(search.toLowerCase())) return false
    if(fEpic    && t.epic    !== fEpic)   return false
    if(fStatut  && t.statut  !== fStatut) return false
    if(fMoscow  && t.moscow  !== fMoscow) return false
    return true
  })

  const allFilteredSelected = filtered.length>0 && filtered.every(t=>selection.has(t.id_tache))

  function toggleOne(id:string){
    setSelection(prev=>{ const s=new Set(prev); s.has(id)?s.delete(id):s.add(id); return s })
  }
  function toggleAll(){
    setSelection(prev=>{
      const s=new Set(prev)
      if(allFilteredSelected) filtered.forEach(t=>s.delete(t.id_tache))
      else filtered.forEach(t=>s.add(t.id_tache))
      return s
    })
  }

  async function removeFromSprint(id_tache:string){
    await updateTache.mutateAsync({id_tache,updates:{sprint:'',sprint_debut:null}})
    toast(`${id_tache} retiré du sprint`)
  }

  async function addSelection(){
    if(!selection.size) return
    for(const id_tache of selection)
      await updateTache.mutateAsync({id_tache,updates:{sprint:selected,sprint_debut:selected}})
    toast(`${selection.size} US ajoutée(s) au sprint ${selected}`)
    setSelection(new Set())
    setShowAdd(false)
  }

  return (
    <div className="ds-card">
      <div className="flex items-center gap-2 mb-2">
        <button className="flex items-center gap-2 flex-1" onClick={()=>setShowTasks(!showTasks)}>
          <div className="ds-card-title mb-0 flex-1">US du sprint {selected} ({spTaches.length})</div>
          {showTasks?<ChevronDown size={14} className="text-subtle"/>:<ChevronRight size={14} className="text-subtle"/>}
        </button>
        {selected&&(
          <button onClick={()=>{setShowAdd(s=>!s);setSelection(new Set())}}
            className="ds-btn ds-btn-sm flex items-center gap-1"><Plus size={11}/>Ajouter US</button>
        )}
      </div>

      {/* ── Panneau backlog ──────────────────────────────────── */}
      {showAdd&&(
        <div className="mb-3 border border-border rounded-xl overflow-hidden">
          {/* Filtres */}
          <div className="flex flex-wrap gap-2 p-3 bg-bg border-b border-border">
            <div className="ds-searchbar flex-1 min-w-[160px]">
              <span className="text-subtle text-xs">🔍</span>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ID ou titre…"/>
            </div>
            <select value={fEpic}   onChange={e=>setFEpic(e.target.value)}
              className="ds-input text-xs px-2 py-1 h-8 min-w-[110px]">
              <option value="">Tous les epics</option>
              {epics.map(e=><option key={e} value={e}>{e}</option>)}
            </select>
            <select value={fStatut} onChange={e=>setFStatut(e.target.value)}
              className="ds-input text-xs px-2 py-1 h-8 min-w-[110px]">
              <option value="">Tous statuts</option>
              {statuts.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            <select value={fMoscow} onChange={e=>setFMoscow(e.target.value)}
              className="ds-input text-xs px-2 py-1 h-8 min-w-[120px]">
              <option value="">Tous MoSCoW</option>
              {moscows.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* En-tête liste */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-bg/60 border-b border-border text-xs text-subtle font-semibold">
            <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll}
              className="w-3.5 h-3.5 accent-purple shrink-0"/>
            <span className="w-16 shrink-0">ID</span>
            <span className="flex-1">Titre</span>
            <span className="w-20 text-center shrink-0">Epic</span>
            <span className="w-20 text-center shrink-0">Statut</span>
            <span className="w-20 text-center shrink-0">MoSCoW</span>
            <span className="w-10 text-right shrink-0">Effort</span>
          </div>

          {/* Lignes */}
          <div className="max-h-64 overflow-y-auto divide-y divide-border">
            {filtered.length===0
              ? <div className="py-6 text-center text-subtle text-xs">Aucune US disponible</div>
              : filtered.map(t=>(
                <label key={t.id_tache}
                  className={cn('flex items-center gap-2 px-3 py-2 text-xs cursor-pointer transition-colors',
                    selection.has(t.id_tache)?'bg-purple/5':'hover:bg-bg/60')}>
                  <input type="checkbox" checked={selection.has(t.id_tache)} onChange={()=>toggleOne(t.id_tache)}
                    className="w-3.5 h-3.5 accent-purple shrink-0"/>
                  <span className="font-semibold text-purple w-16 shrink-0">{t.id_tache}</span>
                  <span className="flex-1 truncate text-navy">{t.titre}</span>
                  <span className="w-20 text-center truncate text-subtle">{t.epic||'—'}</span>
                  <span className="w-20 text-center shrink-0"><StatutBadge value={t.statut}/></span>
                  <span className="w-20 text-center truncate text-subtle text-[10px]">{t.moscow||'—'}</span>
                  <span className="w-10 text-right text-subtle shrink-0">{t.effort_j??0}j</span>
                </label>
              ))
            }
          </div>

          {/* Pied de page */}
          <div className="flex items-center justify-between px-3 py-2 bg-bg border-t border-border">
            <span className="text-xs text-subtle">{filtered.length} US · {selection.size} sélectionnée(s)</span>
            <div className="flex gap-2">
              <button onClick={()=>{setShowAdd(false);setSelection(new Set())}}
                className="ds-btn ds-btn-sm">Annuler</button>
              <button onClick={addSelection} disabled={!selection.size||updateTache.isPending}
                className="ds-btn-primary ds-btn-sm flex items-center gap-1">
                <Plus size={11}/>Ajouter {selection.size>0?`${selection.size} US`:''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── US du sprint ────────────────────────────────────── */}
      {showTasks&&(
        <div className="max-h-80 overflow-y-auto border border-border rounded-xl divide-y divide-border">
          {spTaches.length?spTaches.map(t=>(
            <div key={t.id_tache} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-bg/50">
              <span className="font-semibold text-purple w-16 shrink-0">{t.id_tache}</span>
              <span className="flex-1 truncate text-navy">{t.titre}</span>
              <StatutBadge value={t.statut}/>
              <span className="text-subtle">{t.effort_j??0}j</span>
              <button onClick={()=>removeFromSprint(t.id_tache)} title="Retirer du sprint"
                className="p-1 rounded hover:bg-red/10 text-subtle hover:text-red shrink-0"><X size={11}/></button>
            </div>
          )):<div className="py-6 text-center text-subtle text-xs">Aucune US dans ce sprint</div>}
        </div>
      )}
    </div>
  )
}

function ExportTab() {
  const toast=useToast()
  const exports=[
    {label:'Toutes les tâches',desc:'ID, Epic, Titre, Jalon, Sprint, Statut, Effort…',table:'taches',
     cols:['id_tache','epic','titre','type_fonction','jalon','sprint_debut','sprint_fin','statut','effort_j','moscow','priorite','equipe','metier','assigne_a','lien_dod','iteration'],
     headers:['ID','Epic','Titre','Type','Jalon','Sprint début','Sprint fin','Statut','Effort','MoSCoW','Priorité','Équipe','Métier','Assigné','Lien DoD','Itér.']},
    {label:'Sprints',desc:'Numéro, Statut, Objectifs, Review, Dates',table:'sprints',
     cols:['numero','statut','objectifs','review','started_at','closed_at'],headers:['Sprint','Statut','Objectifs','Review','Démarré','Clôturé']},
    {label:'Membres',desc:'Trigramme, Prénom, Nom, Rôle, Équipe',table:'membres',
     cols:['trigramme','prenom','nom','role','actif','equipe_id'],headers:['Tri','Prénom','Nom','Rôle','Actif','Équipe ID']},
    {label:'Équipes',desc:'Nom, Description, Couleur',table:'equipes',
     cols:['nom','description','couleur','actif'],headers:['Nom','Description','Couleur','Actif']},
  ]
  async function doExport(item:typeof exports[0]){
    const {data,error}=await supabase.from(item.table).select('*')
    if(error||!data){toast('Erreur export','error');return}
    downloadCSV(data as Record<string,unknown>[],`Dimos_D3X_${item.table}`,item.headers,item.cols)
    toast(`${data.length} lignes exportées`)
  }
  async function doExportAll(){for(const item of exports){await doExport(item);await new Promise(r=>setTimeout(r,600))};toast('4 fichiers téléchargés')}
  return (
    <div className="max-w-lg flex flex-col gap-2">
      {exports.map(item=>(
        <div key={item.table} className="flex items-center justify-between p-4 bg-white rounded-xl border border-border">
          <div><div className="font-semibold text-navy text-sm">{item.label}</div><div className="text-xs text-subtle mt-0.5">{item.desc}</div></div>
          <button onClick={()=>doExport(item)} className="ds-btn ds-btn-sm">⬇️ CSV</button>
        </div>
      ))}
      <div className="flex items-center justify-between p-4 bg-purple/5 rounded-xl border border-purple/20">
        <div><div className="font-semibold text-navy text-sm">Export complet</div><div className="text-xs text-subtle mt-0.5">Tous les fichiers CSV</div></div>
        <button onClick={doExportAll} className="ds-btn-primary ds-btn-sm">Tout télécharger</button>
      </div>
    </div>
  )
}
