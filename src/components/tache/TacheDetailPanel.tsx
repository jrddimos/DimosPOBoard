import { useState, useEffect, useMemo } from 'react'
import { X, CornerDownRight, RotateCcw, Copy, Trash2 } from 'lucide-react'
import { StatusPicker } from '@/components/ui/StatusPicker'
import { AssignPicker } from '@/components/ui/AssignPicker'
import { MentionField } from '@/components/ui/MentionField'
import { CriteresEditor } from '@/components/ui/CriteresEditor'
import { DodLinkPicker } from '@/components/ui/DodLinkPicker'
import { TacheExtras } from '@/components/tache/TacheExtras'
import { SousTacheModal } from '@/components/tache/SousTacheModal'
import { NewIterationModal } from '@/components/tache/NewIterationModal'
import { Grp, SelectPicker, PriorityPicker, MoSCoWPicker } from '@/components/tache/TacheFormControls'
import { useTaches, useUpdateTache, useCreateSousTache } from '@/hooks/useTaches'
import { useTacheIterations, useCreateIteration, useUpdateIteration, type TacheIteration } from '@/hooks/useTacheIterations'
import { useTacheDependances, useAddDependance, useRemoveDependance } from '@/hooks/useTacheDependances'
import { useEquipes, useUtilisateurs } from '@/hooks/useEquipes'
import { useEpics, epicFullName } from '@/hooks/useEpics'
import { useJalons } from '@/hooks/useJalons'
import { useDod } from '@/hooks/useDod'
import { useToast } from '@/hooks/useToast'
import { useAuth, type UserProfile } from '@/contexts/AuthContext'
import { useProduit } from '@/contexts/ProduitContext'
import { confirm } from '@/components/ui/ConfirmModal'
import { cn, parseCriteres, serializeCriteres, hasPendingCriteres, buildTacheIndex, isSousTache, effortEffectif } from '@/lib/utils'
import { SPRINTS_LIST, METIERS_DEFAULT } from '@/constants'
import type { Tache, Statut } from '@/types'

// Détail d'une itération (boucle de rework) dans le panneau de tâche —
// objectif/résultat en état local avec sauvegarde au blur (évite de spammer
// l'API à chaque frappe), critères/statut sauvegardés immédiatement comme
// partout ailleurs dans ce panneau.
function IterationCard({iteration,membres,onUpdate}:{
  iteration:TacheIteration
  membres:UserProfile[]
  onUpdate:(updates:Partial<Pick<TacheIteration,'objectif'|'criteres'|'effort_j'|'assigne_a'|'sprint'|'statut'|'resultat'|'commentaire'>>)=>void
}) {
  const [objectif,setObjectif]=useState(iteration.objectif??'')
  const [resultat,setResultat]=useState(iteration.resultat??'')
  const [effortJ,setEffortJ]=useState(String(iteration.effort_j??''))
  const [commentaire,setCommentaire]=useState(iteration.commentaire??'')
  useEffect(()=>{
    setObjectif(iteration.objectif??'')
    setResultat(iteration.resultat??'')
    setEffortJ(String(iteration.effort_j??''))
    setCommentaire(iteration.commentaire??'')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[iteration.id])

  return (
    <div className="bg-bg border border-border rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-navy">Itération {iteration.numero}</span>
        <StatusPicker value={iteration.statut} onChange={s=>onUpdate({statut:s})} />
      </div>
      <textarea value={objectif} onChange={e=>setObjectif(e.target.value)} onBlur={()=>onUpdate({objectif})}
        className="ds-textarea text-xs" rows={2} placeholder="Objectif de cette itération…" />
      <CriteresEditor items={parseCriteres(iteration.criteres)}
        onChange={items=>onUpdate({criteres:serializeCriteres(items)})} compact />
      <div className="grid grid-cols-3 gap-2">
        <div>
          <span className="ds-label mb-1 block">Effort (j)</span>
          <input type="number" value={effortJ} onChange={e=>setEffortJ(e.target.value)}
            onBlur={()=>onUpdate({effort_j:Number(effortJ)||0})} className="ds-input text-xs" min={0} step={0.5}/>
        </div>
        <div>
          <span className="ds-label mb-1 block">Assigné à</span>
          <AssignPicker value={iteration.assigne_a} membres={membres} onAssign={a=>onUpdate({assigne_a:a})} />
        </div>
        <div>
          <span className="ds-label mb-1 block">Sprint</span>
          <SelectPicker value={iteration.sprint??''} onChange={s=>onUpdate({sprint:s})}
            options={SPRINTS_LIST.map(s=>({value:s,label:s}))} placeholder="-- Sprint --"/>
        </div>
      </div>
      <div onBlur={()=>onUpdate({commentaire})}>
        <span className="ds-label mb-1 block">Commentaire PO</span>
        <MentionField as="textarea" value={commentaire} onChange={setCommentaire}
          membres={membres} className="ds-textarea text-xs" rows={2}/>
      </div>
      <textarea value={resultat} onChange={e=>setResultat(e.target.value)} onBlur={()=>onUpdate({resultat})}
        className="ds-textarea text-xs" rows={2} placeholder="Résultat / conclusion de cette itération…" />
    </div>
  )
}

// ── Panneau de détail d'une tâche ─────────────────────────────
// Overlay complet (champs, itérations, dépendances, extras) extrait de
// TachesPage pour être réutilisable depuis n'importe quelle page (Setup
// sprint notamment). Autonome : toutes les données viennent des hooks
// produit ; seuls Dupliquer/Supprimer sont délégués via props (les pages
// qui ne les fournissent pas n'affichent pas les boutons).
export function TacheDetailPanel({ tacheId, onClose, onDuplicate, onDelete }: {
  tacheId: string
  onClose: () => void
  onDuplicate?: (t: Tache) => void
  onDelete?: (t: Tache) => Promise<boolean>
}) {
  const { produitActif } = useProduit()
  const produitId = produitActif?.id ?? null
  const { user } = useAuth()
  const userId = user?.id ?? null
  const toast = useToast()
  const { data: allTaches = [] } = useTaches()
  const { data: equipes = [] } = useEquipes()
  const { data: membres = [] } = useUtilisateurs()
  const { data: dodItems = [] } = useDod()
  const { data: epicsList = [] } = useEpics()
  const { data: jalonsList = [] } = useJalons()
  const { data: dependances = [] } = useTacheDependances(produitId)
  const addDependance = useAddDependance()
  const removeDependance = useRemoveDependance()
  const updateTache = useUpdateTache()
  const createSub = useCreateSousTache()
  const { data: iterations = [] } = useTacheIterations(tacheId, produitId)
  const createIteration = useCreateIteration()
  const updateIteration = useUpdateIteration()

  const membresActifs = membres.filter(m => m.actif)
  const equipeNoms = equipes.filter(e => e.actif).map(e => e.nom)
  const jalonCodes = useMemo(() => jalonsList.map(j => j.code), [jalonsList])
  const byId = useMemo(() => buildTacheIndex(allTaches), [allTaches])
  const childMap = useMemo(() => {
    const m: Record<string, Tache[]> = {}
    allTaches.filter(t => t.parent_id).forEach(c => { if (!m[c.parent_id!]) m[c.parent_id!] = []; m[c.parent_id!].push(c) })
    return m
  }, [allTaches])
  // Conteneurs + toute US (racine ou déjà rattachée à un conteneur) — jamais
  // une sous-tâche, pour ne pas créer un 4ᵉ niveau de hiérarchie.
  const validParentOptions = useMemo(() => allTaches.filter(t => !isSousTache(t, byId)), [allTaches, byId])

  const panelTask = allTaches.find(t => t.id_tache === tacheId) ?? null

  const [editForm, setEditForm] = useState<Record<string, unknown>>({})
  // Formulaire initialisé une seule fois par tâche (pas ré-écrasé quand les
  // données refetchent pendant l'édition) — équivalent de l'ancien openPanel.
  const [initedFor, setInitedFor] = useState<string | null>(null)
  useEffect(() => {
    if (!panelTask || initedFor === panelTask.id_tache) return
    const effectiveEffort = effortEffectif(panelTask, childMap)
    const t = panelTask
    setEditForm({titre:t.titre,statut:t.statut,sprint:t.sprint??'',sprint_debut:t.sprint_debut??'',sprint_fin:t.sprint_fin??'',effort_j:effectiveEffort,priorite:t.priorite??'',moscow:t.moscow??'Must Have',assigne_a:t.assigne_a??'',equipe:t.equipe??'',metier:t.metier??'',jalon:t.jalon??'',epic:t.epic??'',type_fonction:t.type_fonction??'Fonction principale',description:t.description??'',criteres:t.criteres??'',lien_dod:t.lien_dod??'',commentaire:t.commentaire??'',parent_id:t.parent_id??''})
    setInitedFor(t.id_tache)
  }, [panelTask, initedFor, childMap])
  function setF(k:string){return(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>setEditForm(f=>({...f,[k]:e.target.value}))}

  const [selectedIterationId,setSelectedIterationId]=useState<number|null>(null)
  const [showNewIteration,setShowNewIteration]=useState(false)
  const [sousTacheParent,setSousTacheParent]=useState<Tache|null>(null)
  const [deleting,setDeleting]=useState(false)
  useEffect(()=>{setSelectedIterationId(null);setShowNewIteration(false)},[tacheId])
  // Par défaut, la dernière itération créée — ou aucune tant que la tâche
  // n'a jamais été reprise (voir useCreateIteration : la 1ʳᵉ itération n'est
  // figée en base qu'au moment où une 2ᵉ est créée).
  const currentIteration=selectedIterationId?iterations.find(it=>it.id===selectedIterationId):iterations[iterations.length-1]
  // Dès qu'une itération existe, effort/assigné/sprint/critères/commentaire
  // vivent sur l'itération courante (IterationCard) — les montrer aussi sur
  // le formulaire principal doublonnerait l'info et prêterait à confusion.
  const hasIterations=iterations.length>0

  function setMembre(tri:string){
    const m=membresActifs.find(x=>x.trigramme===tri)
    const eq=m?.equipe_id?equipes.find(e=>e.id===m.equipe_id):null
    setEditForm(f=>({...f,assigne_a:tri,...(eq?{equipe:eq.nom}:{})}))
  }

  async function savePanel(){
    if(editForm.statut==='Fait' && hasPendingCriteres(String(editForm.criteres??''))){
      const ok=await confirm({title:'Critères non validés',message:'Certains critères d\'acceptation ne sont pas cochés. Clôturer la tâche quand même ?',confirmLabel:'Clôturer',variant:'danger'})
      if(!ok)return
    }
    await updateTache.mutateAsync({id_tache:tacheId,updates:editForm as Partial<Tache>})
    toast(`${tacheId} mis à jour`)
  }

  if(!panelTask) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-brand/40" onClick={onClose}/>
      <div className="fixed inset-x-0 bottom-0 z-50 animate-in md:inset-x-auto md:left-auto md:right-4 md:top-4 md:bottom-4 md:w-3/5 md:min-w-[380px] md:max-w-[860px] 3xl:max-w-[1200px]">
      <div className="ds-card max-h-[80vh] md:max-h-full md:h-full overflow-y-auto rounded-b-none md:rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-indigo-600 flex items-center gap-1.5">
            {panelTask.id_tache}
            {panelTask.type_tache==='Conteneur' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">Conteneur</span>}
          </span>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-navy"><X size={13}/></button>
        </div>
        <h3 className="text-sm font-semibold text-navy leading-snug mb-1.5 line-clamp-2">{panelTask.titre}</h3>
        {!isSousTache(panelTask,byId)&&(
          <button onClick={()=>setSousTacheParent(panelTask)}
            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium mb-3">
            <CornerDownRight size={12}/> Ajouter une sous-tâche
          </button>
        )}

        {/* Itérations : boucles de rework trackées (conception → commande
            → essai → validation, répétées) sans dupliquer la tâche —
            masqué pour les Conteneurs (purement organisationnels). */}
        {panelTask.type_tache!=='Conteneur' && (
          <div className="mb-3">
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {iterations.map(it=>(
                <button key={it.id} onClick={()=>setSelectedIterationId(it.id)}
                  className={cn('text-[11px] font-semibold px-2 py-1 rounded-full border transition-colors',
                    (currentIteration?.id===it.id)?'bg-indigo-600 text-white border-indigo-600':'bg-bg text-subtle border-border hover:border-indigo-300')}>
                  It. {it.numero} {it.statut==='Fait'?'✓':it.statut==='Bloqué'?'⛔':'·'}
                </button>
              ))}
              <button onClick={()=>setShowNewIteration(true)}
                className="text-[11px] font-semibold px-2 py-1 rounded-full border border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50 flex items-center gap-1">
                <RotateCcw size={11}/> Nouvelle itération
              </button>
            </div>
            {currentIteration ? (
              <IterationCard iteration={currentIteration} membres={membresActifs}
                onUpdate={updates=>updateIteration.mutate({
                  id:currentIteration.id,id_tache:panelTask.id_tache,updates,
                  syncToTache:currentIteration.id===iterations[iterations.length-1]?.id,
                })}/>
            ) : (
              <p className="text-[11px] text-subtle italic">Aucune itération enregistrée — cette tâche n'a pas encore été reprise.</p>
            )}
          </div>
        )}

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

          {/* Tâche parente : rattacher/déplacer sous un conteneur ou une autre US.
              Un Conteneur reste toujours racine (jamais de champ ici pour lui).
              Si la tâche a elle-même des sous-tâches, seul un Conteneur (ou aucun
              parent) est autorisé comme destination — sinon on créerait un 4ᵉ niveau. */}
          {panelTask.type_tache!=='Conteneur' && (
          <div className="mt-4 pt-3 border-t-2 border-slate-300">
            <Grp label={<>Tâche parente <span className="font-normal text-subtle/60">(vide = principale)</span></>}>
              <SelectPicker value={String(editForm.parent_id??'')} onChange={v=>setEditForm(f=>({...f,parent_id:v}))}
                options={((childMap[panelTask.id_tache]??[]).length>0
                    ? validParentOptions.filter(p=>p.type_tache==='Conteneur')
                    : validParentOptions
                  ).filter(p=>p.id_tache!==panelTask.id_tache)
                  .map(p=>({value:p.id_tache,label:`${p.id_tache} — ${p.titre}${p.type_tache==='Conteneur'?' (Conteneur)':''}`}))}
                placeholder="— Principale —" searchable/>
            </Grp>
            {(childMap[panelTask.id_tache]??[]).length>0 && (
              <p className="text-xs text-subtle italic mt-1">Cette tâche a ses propres sous-tâches : elle ne peut être rattachée qu'à un Conteneur (ou rester principale).</p>
            )}
          </div>
          )}

          {/* Classification : Epic, Type fonction, Jalon, Priorité */}
          <div className="grid grid-cols-6 gap-3 mt-4 pt-3 border-t-2 border-slate-300">
            <Grp label="Epic" className="col-span-2">
              <SelectPicker value={String(editForm.epic??'')} onChange={v=>setEditForm(f=>({...f,epic:v}))}
                options={epicsList.map(e=>({value:epicFullName(e),label:epicFullName(e)}))} placeholder="-- Epic --" searchable/>
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
                options={jalonCodes.map(j=>({value:j,label:j}))} placeholder="-- Jalon --"/>
            </Grp>
          </div>

          {/* Priorité, MoSCoW, + Effort/Assigné si la tâche n'a pas
              encore d'itération (au-delà, ces champs vivent sur
              l'itération courante — les montrer ici doublonnerait). */}
          <div className={cn('grid gap-3 mt-4 pt-3 border-t-2 border-slate-300',hasIterations?'grid-cols-3':'grid-cols-6')}>
            <Grp label="Priorité" className="col-span-1">
              <PriorityPicker value={String(editForm.priorite??'')} onChange={p=>setEditForm(f=>({...f,priorite:p}))} />
            </Grp>
            <Grp label="MoSCoW" className="col-span-2">
              <MoSCoWPicker value={String(editForm.moscow??'')} onChange={m=>setEditForm(f=>({...f,moscow:m}))}/>
            </Grp>
            {!hasIterations && (
              <>
                <Grp label="Effort (j)" className="col-span-1">
                  {(childMap[panelTask.id_tache]??[]).length > 0 ? (
                    <div className="ds-input text-xs bg-slate-50 text-navy font-semibold flex items-center gap-1.5 cursor-not-allowed">
                      <span>∑ {(childMap[panelTask.id_tache]??[]).reduce((s,c)=>s+(c.effort_j??0),0)}j</span>
                      <span className="text-[11px] text-slate-400 font-normal">{(childMap[panelTask.id_tache]??[]).length} ss</span>
                    </div>
                  ) : (
                    <input type="number" value={Number(editForm.effort_j??0)} onChange={setF('effort_j')} className="ds-input text-xs" min={0} step={0.5}/>
                  )}
                </Grp>
                <Grp label="Assigné à" className="col-span-2">
                  <AssignPicker value={String(editForm.assigne_a??'')} membres={membresActifs} onAssign={setMembre} />
                </Grp>
              </>
            )}
          </div>

          {/* Planning : Sprint début/fin (masqué si itérations, cf. ci-dessus), Équipe, Thème */}
          <div className={cn('grid gap-3 mt-4 pt-3 border-t-2 border-slate-300',hasIterations?'grid-cols-2':'grid-cols-4')}>
            {!hasIterations && (
              <>
                <Grp label="Sprint début">
                  <SelectPicker value={String(editForm.sprint_debut??'')} onChange={v=>setEditForm(f=>({...f,sprint_debut:v}))}
                    options={SPRINTS_LIST.map(s=>({value:s,label:s}))} placeholder="-- Sprint --"/>
                </Grp>
                <Grp label="Sprint fin">
                  <SelectPicker value={String(editForm.sprint_fin??'')} onChange={v=>setEditForm(f=>({...f,sprint_fin:v}))}
                    options={SPRINTS_LIST.map(s=>({value:s,label:s}))} placeholder="-- Sprint --"/>
                </Grp>
              </>
            )}
            <Grp label="Équipe">
              <SelectPicker value={String(editForm.equipe??'')} onChange={v=>setEditForm(f=>({...f,equipe:v}))}
                options={equipeNoms.map(e=>({value:e,label:e}))} placeholder="-- Équipe --"/>
            </Grp>
            <Grp label="Thème">
              <SelectPicker value={String(editForm.metier??'')} onChange={v=>setEditForm(f=>({...f,metier:v}))}
                options={METIERS_DEFAULT.map(m=>({value:m,label:m}))} placeholder="-- Thème --" searchable/>
            </Grp>
          </div>

          {/* Contenu : User Story (+ Critères si pas d'itération, cf. ci-dessus) */}
          <div className={cn('grid gap-3 mt-4 pt-3 border-t-2 border-slate-300',hasIterations?'grid-cols-1':'grid-cols-2')}>
            <Grp label="User Story"><textarea value={String(editForm.description??'')} onChange={setF('description')} className="ds-textarea text-xs" rows={5}/></Grp>
            {!hasIterations && (
              <Grp label="Critères d'acceptation (DoD)">
                <div className="ds-input min-h-[110px] flex flex-col">
                  <CriteresEditor
                    items={parseCriteres(String(editForm.criteres??''))}
                    onChange={items=>setEditForm(f=>({...f,criteres:serializeCriteres(items)}))}
                    compact
                  />
                </div>
              </Grp>
            )}
          </div>

          {/* Exigences (+ Commentaire PO si pas d'itération, cf. ci-dessus) */}
          <div className={cn('grid gap-3 mt-4 pt-3 border-t-2 border-slate-300',hasIterations?'grid-cols-1':'grid-cols-[220px_1fr]')}>
            <Grp label="Exigences">
              <DodLinkPicker value={String(editForm.lien_dod??'')} onChange={v=>setEditForm(f=>({...f,lien_dod:v}))} items={dodItems}/>
            </Grp>
            {!hasIterations && (
              <Grp label="Commentaire PO">
                <MentionField as="textarea" value={String(editForm.commentaire??'')} onChange={v=>setEditForm(f=>({...f,commentaire:v}))}
                  membres={membresActifs} className="ds-textarea text-xs" rows={2}/>
              </Grp>
            )}
          </div>

          {/* Dépendances entre tâches */}
          {produitId && (
            <Grp label="Dépendances" className="mt-4 pt-3 border-t-2 border-slate-300">
              <div className="flex flex-col gap-2">
                <div>
                  <div className="text-[11px] text-navy/70 font-bold uppercase tracking-wide mb-1">Bloquée par</div>
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
                  <div className="text-[11px] text-navy/70 font-bold uppercase tracking-wide mb-1">Bloque</div>
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

          {produitId && (
            <div className="mt-4 pt-3 border-t-2 border-slate-300">
              <TacheExtras produitId={produitId} tache={panelTask} membres={membresActifs} userId={userId} toast={toast} />
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-3 pt-3 border-t-2 border-slate-300">
          <button onClick={savePanel} className="ds-btn-primary flex-1" disabled={updateTache.isPending}>✓ Sauvegarder</button>
          {onDuplicate && !isSousTache(panelTask,byId)&&(
            <button onClick={()=>onDuplicate(panelTask)}
              title="Dupliquer vers le backlog (avec sous-tâches)"
              className="ds-btn flex items-center gap-1"><Copy size={12}/> Dupliquer</button>
          )}
          {onDelete && (
            <button onClick={async()=>{setDeleting(true);try{if(await onDelete(panelTask)) onClose()}finally{setDeleting(false)}}}
              disabled={deleting} title="Supprimer la tâche"
              className="ds-btn-danger"><Trash2 size={12}/></button>
          )}
          <button onClick={onClose} className="ds-btn">Annuler</button>
        </div>
      </div>
      </div>

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

      {showNewIteration&&(
        <NewIterationModal
          taskTitre={panelTask.titre}
          numeroSuivant={(iterations[iterations.length-1]?.numero??1)+1}
          initCriteres={iterations[iterations.length-1]?.criteres??panelTask.criteres}
          initEffort={iterations[iterations.length-1]?.effort_j??panelTask.effort_j}
          initAssigneA={iterations[iterations.length-1]?.assigne_a??panelTask.assigne_a}
          initSprint={iterations[iterations.length-1]?.sprint??panelTask.sprint_debut??panelTask.sprint}
          membres={membresActifs}
          onClose={()=>setShowNewIteration(false)}
          onCreate={async payload=>{
            const it=await createIteration.mutateAsync({id_tache:panelTask.id_tache,...payload})
            setSelectedIterationId(it.id)
            toast(`✅ Itération ${it.numero} créée`)
          }}
        />
      )}
    </>
  )
}
