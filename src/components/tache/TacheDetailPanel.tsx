import { useState, useEffect, useMemo } from 'react'
import { X, CornerDownRight, RotateCcw, Copy, Trash2, CalendarClock, Sparkles } from 'lucide-react'
import { StatusPicker } from '@/components/ui/StatusPicker'
import { AssignPicker, AssignPickerMulti } from '@/components/ui/AssignPicker'
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
import { useDod, useUpdateDodItem } from '@/hooks/useDod'
import { useSprints } from '@/hooks/useSprints'
import { useToast } from '@/hooks/useToast'
import { useAuth, type UserProfile } from '@/contexts/AuthContext'
import { useProduit } from '@/contexts/ProduitContext'
import { confirm } from '@/components/ui/ConfirmModal'
import { cn, parseCriteres, serializeCriteres, hasPendingCriteres, buildTacheIndex, isSousTache, effortEffectif, existingSprintNumeros, formatSprintLabel, parseLienDodCodes, parseAssignees, serializeAssignees } from '@/lib/utils'
import { METIERS_DEFAULT } from '@/constants'
import type { Tache, Statut } from '@/types'

// Origine d'une itération : distingue la reprise automatique de fin de
// sprint (aucun objectif, juste le reste à faire) de la boucle agile
// délibérée créée depuis le backlog — visible directement dans les badges,
// pas seulement au survol.
const ORIGINE_CFG: Record<string, { icon: typeof RotateCcw; label: string; className: string }> = {
  sprint:  { icon: CalendarClock, label: 'Reprise de sprint',  className: 'text-subtle' },
  rework:  { icon: Sparkles,      label: 'Nouvelle itération', className: 'text-indigo-600' },
  initial: { icon: RotateCcw,     label: 'État initial',        className: 'text-subtle' },
}

// Détail d'une itération (boucle de rework) dans le panneau de tâche —
// objectif/résultat en état local avec sauvegarde au blur (évite de spammer
// l'API à chaque frappe), critères/statut sauvegardés immédiatement comme
// partout ailleurs dans ce panneau.
function IterationCard({iteration,membres,sprintNumeros,onUpdate}:{
  iteration:TacheIteration
  membres:UserProfile[]
  sprintNumeros:string[]
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

  const origineCfg = ORIGINE_CFG[iteration.origine] ?? ORIGINE_CFG.rework
  const OrigineIcon = origineCfg.icon
  return (
    <div className="bg-bg border border-border rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-navy">Itération {iteration.numero}</span>
          <span className={cn('flex items-center gap-1 text-[10px] font-semibold', origineCfg.className)}>
            <OrigineIcon size={11} /> {origineCfg.label}
          </span>
        </span>
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
            onBlur={()=>onUpdate({effort_j:Number(effortJ)||0})} className="ds-input text-xs" min={0} step={0.1}/>
        </div>
        <div>
          <span className="ds-label mb-1 block">Assigné à</span>
          <AssignPicker value={iteration.assigne_a} membres={membres} onAssign={a=>onUpdate({assigne_a:a})} />
        </div>
        <div>
          <span className="ds-label mb-1 block">Sprint</span>
          <SelectPicker value={iteration.sprint??''} onChange={s=>onUpdate({sprint:s})}
            options={sprintNumeros.map(s=>({value:s,label:formatSprintLabel(s)}))} placeholder="-- Sprint --"/>
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

// Champs modifiables quand ce panneau est ouvert depuis le Sprint Board
// (cf. SprintBoardPage.tsx) — tout le reste s'affiche mais reste verrouillé
// (grisé, non cliquable) : ce sont des champs de cadrage/backlog, pas des
// actions du quotidien en sprint. Discussion/Pièces jointes (TacheExtras)
// restent toujours pleinement interactives, indépendamment de cette liste.
export const SPRINT_BOARD_EDITABLE_FIELDS = new Set([
  'statut', 'assigne_a', 'criteres', 'sprint_debut', 'sprint_fin', 'commentaire',
])

// ── Panneau de détail d'une tâche ─────────────────────────────
// Overlay complet (champs, itérations, dépendances, extras) extrait de
// TachesPage pour être réutilisable depuis n'importe quelle page (Setup
// sprint notamment). Autonome : toutes les données viennent des hooks
// produit ; seuls Dupliquer/Supprimer sont délégués via props (les pages
// qui ne les fournissent pas n'affichent pas les boutons).
// `editableFields` (non fourni = tout éditable, comportement historique) et
// `centered` (tiroir latéral par défaut) permettent de réutiliser ce même
// panneau dans un contexte plus restreint (Sprint Board).
export function TacheDetailPanel({ tacheId, onClose, onDuplicate, onDelete, editableFields, centered, onRequestStatusChange }: {
  tacheId: string
  onClose: () => void
  onDuplicate?: (t: Tache) => void
  onDelete?: (t: Tache) => Promise<boolean>
  editableFields?: Set<string>
  centered?: boolean
  // Délègue le changement de statut à l'appelant (Sprint Board) plutôt que
  // de sauvegarder directement — permet de réutiliser le même popup
  // effort réalisé/critères que le drag-and-drop et le StatusPicker de la
  // carte Kanban, au lieu du simple contrôle "critères non validés" du
  // panneau, qui n'ouvrait jamais ce popup ni ne bloquait les sous-tâches
  // non terminées.
  onRequestStatusChange?: (t: Tache, statut: Statut) => void
}) {
  const locked = (k: string) => !!editableFields && !editableFields.has(k)
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
  const { data: sprints = [] } = useSprints()
  const sprintNumeros = existingSprintNumeros(sprints)
  const { data: dependances = [] } = useTacheDependances(produitId)
  const addDependance = useAddDependance()
  const removeDependance = useRemoveDependance()
  const updateTache = useUpdateTache()
  const updateDodItem = useUpdateDodItem()
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
  // Champ actuellement en cours de frappe (Titre/Effort/User Story/Commentaire,
  // cf. Groupe B plus bas) — protégé lors d'une resynchronisation live pour ne
  // pas écraser une saisie en cours quand une autre personne modifie la tâche
  // pendant que ce panneau est ouvert (cf. Realtime, useTachesRealtime).
  const [focusedField, setFocusedField] = useState<string | null>(null)
  // Resynchronisé à chaque changement de panelTask — pas seulement à
  // l'ouverture — pour refléter en direct les modifications d'un autre
  // utilisateur sans devoir fermer/rouvrir le panneau. React Query fait du
  // structural sharing : panelTask ne change de référence que si la ligne a
  // réellement changé côté serveur (donc pas de boucle sur un simple refetch
  // identique). Le champ en cours de frappe (focusedField) est préservé.
  useEffect(() => {
    if (!panelTask) return
    const t = panelTask
    // effort_j = effort PROPRE de la tâche (le total propre + sous-tâches est
    // calculé à l'affichage via effortEffectif) — surtout ne pas initialiser
    // avec la somme : la sauvegarde du panneau la matérialiserait dans
    // effort_j et tout serait compté double (cf. migration 0057).
    const fresh:Record<string,unknown>={titre:t.titre,statut:t.statut,sprint:t.sprint??'',sprint_debut:t.sprint_debut??'',sprint_fin:t.sprint_fin??'',effort_j:t.effort_j??0,priorite:t.priorite??'',moscow:t.moscow??'Must Have',assigne_a:t.assigne_a??'',equipe:t.equipe??'',metier:t.metier??'',jalon:t.jalon??'',epic:t.epic??'',type_fonction:t.type_fonction??'Fonction principale',description:t.description??'',criteres:t.criteres??'',lien_dod:t.lien_dod??'',commentaire:t.commentaire??'',parent_id:t.parent_id??''}
    setEditForm(f => focusedField ? {...fresh, [focusedField]: f[focusedField]} : fresh)
  }, [panelTask]) // eslint-disable-line react-hooks/exhaustive-deps
  function setF(k:string){return(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>setEditForm(f=>({...f,[k]:e.target.value}))}
  // Sauvegarde immédiate d'un champ — même convention que le Kanban
  // (updateTache.mutateAsync par champ). Pas de toast : le champ affiché est
  // déjà sa propre confirmation visuelle (cf. Kanban, silencieux pareil).
  async function saveField(k:string, v:unknown){
    setEditForm(f=>({...f,[k]:v}))
    await updateTache.mutateAsync({id_tache:tacheId,updates:{[k]:v}})
  }

  const [selectedIterationId,setSelectedIterationId]=useState<number|null>(null)
  const [showNewIteration,setShowNewIteration]=useState(false)
  const [sousTacheParent,setSousTacheParent]=useState<Tache|null>(null)
  const [deleting,setDeleting]=useState(false)
  useEffect(()=>{setSelectedIterationId(null);setShowNewIteration(false);setFocusedField(null)},[tacheId])
  // Par défaut, la dernière itération créée — ou aucune tant que la tâche
  // n'a jamais été reprise (voir useCreateIteration : la 1ʳᵉ itération n'est
  // figée en base qu'au moment où une 2ᵉ est créée).
  const currentIteration=selectedIterationId?iterations.find(it=>it.id===selectedIterationId):iterations[iterations.length-1]
  // Dès qu'une itération existe, effort/assigné/sprint/critères/commentaire
  // vivent sur l'itération courante (IterationCard) — les montrer aussi sur
  // le formulaire principal doublonnerait l'info et prêterait à confusion.
  const hasIterations=iterations.length>0

  async function setMembre(tri:string){
    const m=membresActifs.find(x=>x.trigramme===tri)
    const eq=m?.equipe_id?equipes.find(e=>e.id===m.equipe_id):null
    const updates={assigne_a:tri,...(eq?{equipe:eq.nom}:{})}
    setEditForm(f=>({...f,...updates}))
    await updateTache.mutateAsync({id_tache:tacheId,updates})
  }

  // Sous-tâche : un seul assigné. US : plusieurs possibles (cf. QuickAddModal).
  async function setMembresMulti(list:string[]){
    const assigne_a=serializeAssignees(list)
    await saveField('assigne_a',assigne_a)
  }

  if(!panelTask) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-brand/40" onClick={onClose}/>
      <div className={centered
        ? 'fixed inset-0 z-50 flex items-center justify-center p-4 animate-in'
        : 'fixed inset-x-0 bottom-0 z-50 animate-in md:inset-x-auto md:left-auto md:right-4 md:top-4 md:bottom-4 md:w-3/5 md:min-w-[380px] md:max-w-[860px] 3xl:max-w-[1200px]'}>
      <div className={cn('ds-card overflow-y-auto shadow-2xl',
        centered ? 'w-full max-w-3xl max-h-[85vh] rounded-2xl' : 'max-h-[80vh] md:max-h-full md:h-full rounded-b-none md:rounded-xl')}>
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
              {iterations.map(it=>{
                const cfg=ORIGINE_CFG[it.origine]??ORIGINE_CFG.rework
                const OIcon=cfg.icon
                const active=currentIteration?.id===it.id
                return (
                  <button key={it.id} onClick={()=>setSelectedIterationId(it.id)} title={cfg.label}
                    className={cn('flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border transition-colors',
                      active?'bg-indigo-600 text-white border-indigo-600':'bg-bg text-subtle border-border hover:border-indigo-300')}>
                    <OIcon size={10} className={active?'text-white/80':undefined} />
                    It. {it.numero} {it.statut==='Fait'?'✓':it.statut==='Bloqué'?'⛔':'·'}
                  </button>
                )
              })}
              <button onClick={()=>setShowNewIteration(true)}
                className="text-[11px] font-semibold px-2 py-1 rounded-full border border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50 flex items-center gap-1">
                <RotateCcw size={11}/> Nouvelle itération
              </button>
            </div>
            {currentIteration ? (
              <IterationCard iteration={currentIteration} membres={membresActifs} sprintNumeros={sprintNumeros}
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
            <Grp label="Titre" className={cn(locked('titre') && 'opacity-50 pointer-events-none')}>
              <input value={String(editForm.titre??'')} onChange={setF('titre')}
                onFocus={()=>setFocusedField('titre')}
                onBlur={()=>{setFocusedField(null);saveField('titre',editForm.titre)}}
                className="ds-input text-xs"/>
            </Grp>
            <Grp label="Statut">
              <StatusPicker
                value={(String(editForm.statut??'À faire')) as Statut}
                onChange={async s=>{
                  // Délégué (Sprint Board) : même popup effort réalisé/
                  // critères/sous-tâches que le drag-and-drop — pas de
                  // double contrôle critères ici, déjà géré par ce popup.
                  if(onRequestStatusChange){onRequestStatusChange(panelTask,s);return}
                  if(s==='Fait' && hasPendingCriteres(String(editForm.criteres??''))){
                    const ok=await confirm({title:'Critères non validés',message:'Certains critères d\'acceptation ne sont pas cochés. Clôturer la tâche quand même ?',confirmLabel:'Clôturer',variant:'danger'})
                    if(!ok)return
                  }
                  await saveField('statut',s)
                }}
              />
            </Grp>
          </div>

          {/* Tâche parente : rattacher/déplacer sous un conteneur ou une autre US.
              Un Conteneur reste toujours racine (jamais de champ ici pour lui).
              Si la tâche a elle-même des sous-tâches, seul un Conteneur (ou aucun
              parent) est autorisé comme destination — sinon on créerait un 4ᵉ niveau. */}
          {panelTask.type_tache!=='Conteneur' && (
          <div className="mt-4 pt-3 border-t-2 border-slate-300">
            <Grp label={<>Tâche parente <span className="font-normal text-subtle/60">(vide = principale)</span></>}
              className={cn(locked('parent_id') && 'opacity-50 pointer-events-none')}>
              <SelectPicker value={String(editForm.parent_id??'')} onChange={v=>saveField('parent_id',v)}
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
            <Grp label="Epic" className={cn('col-span-2', locked('epic') && 'opacity-50 pointer-events-none')}>
              <SelectPicker value={String(editForm.epic??'')} onChange={v=>saveField('epic',v)}
                options={epicsList.map(e=>({value:epicFullName(e),label:epicFullName(e)}))} placeholder="-- Epic --" searchable/>
            </Grp>
            <Grp label="Type fonction" className={cn('col-span-2', locked('type_fonction') && 'opacity-50 pointer-events-none')}>
              <SelectPicker value={String(editForm.type_fonction??'')} onChange={v=>saveField('type_fonction',v)}
                options={[
                  {value:'Fonction principale',label:'Principale'},
                  {value:'Fonction secondaire',label:'Secondaire'},
                  {value:'Fonction support',label:'Support'},
                  {value:'Fonction exclue',label:'Exclue'},
                ]} placeholder="-- Type --"/>
            </Grp>
            <Grp label="Jalon - Incrément majeur" className={cn('col-span-2', locked('jalon') && 'opacity-50 pointer-events-none')}>
              <SelectPicker value={String(editForm.jalon??'')} onChange={v=>saveField('jalon',v)}
                options={jalonCodes.map(j=>({value:j,label:j}))} placeholder="-- Jalon --"/>
            </Grp>
          </div>

          {/* Priorité, MoSCoW, + Effort/Assigné si la tâche n'a pas
              encore d'itération (au-delà, ces champs vivent sur
              l'itération courante — les montrer ici doublonnerait). */}
          <div className={cn('grid gap-3 mt-4 pt-3 border-t-2 border-slate-300',hasIterations?'grid-cols-3':'grid-cols-6')}>
            <Grp label="Priorité" className={cn('col-span-1', locked('priorite') && 'opacity-50 pointer-events-none')}>
              <PriorityPicker value={String(editForm.priorite??'')} onChange={p=>saveField('priorite',p)} />
            </Grp>
            <Grp label="MoSCoW" className={cn('col-span-2', locked('moscow') && 'opacity-50 pointer-events-none')}>
              <MoSCoWPicker value={String(editForm.moscow??'')} onChange={m=>saveField('moscow',m)}/>
            </Grp>
            {!hasIterations && (
              <>
                {/* Verrouillé seulement si un effort est déjà chiffré : on ne
                    doit pas pouvoir corriger une estimation à la volée en
                    sprint, mais une US arrivée sans effort doit pouvoir être
                    chiffrée (sinon personne ne peut jamais la remplir). */}
                <Grp label={(childMap[panelTask.id_tache]??[]).length > 0 ? 'Effort propre (j)' : 'Effort (j)'}
                  className={cn('col-span-1', locked('effort_j') && Number(editForm.effort_j) > 0 && 'opacity-50 pointer-events-none')}>
                  <input type="number" value={String(editForm.effort_j??'')} onChange={setF('effort_j')}
                    onFocus={()=>setFocusedField('effort_j')}
                    onBlur={()=>{setFocusedField(null);saveField('effort_j',Number(editForm.effort_j)||0)}}
                    className="ds-input text-xs" min={0} step={0.1}/>
                  {(childMap[panelTask.id_tache]??[]).length > 0 && (
                    <div className="text-[10px] text-subtle mt-0.5 tabular-nums whitespace-nowrap">
                      + ∑ {(childMap[panelTask.id_tache]??[]).reduce((s,c)=>s+effortEffectif(c,childMap),0)}j ss-tâches
                      = <b>{Number(editForm.effort_j??0)+(childMap[panelTask.id_tache]??[]).reduce((s,c)=>s+effortEffectif(c,childMap),0)}j</b>
                    </div>
                  )}
                </Grp>
                <Grp label="Assigné à" className="col-span-2">
                  {isSousTache(panelTask,byId) ? (
                    <AssignPicker value={String(editForm.assigne_a??'')} membres={membresActifs} onAssign={setMembre} />
                  ) : (
                    <AssignPickerMulti value={parseAssignees(String(editForm.assigne_a??''))} membres={membresActifs} onChange={setMembresMulti} />
                  )}
                </Grp>
              </>
            )}
          </div>

          {/* Planning : Sprint début/fin (masqué si itérations, cf. ci-dessus), Équipe, Thème */}
          <div className={cn('grid gap-3 mt-4 pt-3 border-t-2 border-slate-300',hasIterations?'grid-cols-2':'grid-cols-4')}>
            {!hasIterations && (
              <>
                <Grp label="Sprint début">
                  <SelectPicker value={String(editForm.sprint_debut??'')} onChange={v=>saveField('sprint_debut',v)}
                    options={sprintNumeros.map(s=>({value:s,label:formatSprintLabel(s)}))} placeholder="-- Sprint --"/>
                </Grp>
                <Grp label="Sprint fin">
                  <SelectPicker value={String(editForm.sprint_fin??'')} onChange={v=>saveField('sprint_fin',v)}
                    options={sprintNumeros.map(s=>({value:s,label:formatSprintLabel(s)}))} placeholder="-- Sprint --"/>
                </Grp>
              </>
            )}
            <Grp label="Équipe" className={cn(locked('equipe') && 'opacity-50 pointer-events-none')}>
              <SelectPicker value={String(editForm.equipe??'')} onChange={v=>saveField('equipe',v)}
                options={equipeNoms.map(e=>({value:e,label:e}))} placeholder="-- Équipe --"/>
            </Grp>
            <Grp label="Thème" className={cn(locked('metier') && 'opacity-50 pointer-events-none')}>
              <SelectPicker value={String(editForm.metier??'')} onChange={v=>saveField('metier',v)}
                options={METIERS_DEFAULT.map(m=>({value:m,label:m}))} placeholder="-- Thème --" searchable/>
            </Grp>
          </div>

          {/* Contenu : User Story (+ Critères si pas d'itération, cf. ci-dessus) */}
          <div className={cn('grid gap-3 mt-4 pt-3 border-t-2 border-slate-300',hasIterations?'grid-cols-1':'grid-cols-2')}>
            <Grp label="User Story" className={cn(locked('description') && 'opacity-50 pointer-events-none')}>
              <textarea value={String(editForm.description??'')} onChange={setF('description')}
                onFocus={()=>setFocusedField('description')}
                onBlur={()=>{setFocusedField(null);saveField('description',editForm.description)}}
                className="ds-textarea text-xs" rows={5}/>
            </Grp>
            {!hasIterations && (
              <Grp label="Critères d'acceptation (DoD)">
                <div className="ds-input min-h-[110px] flex flex-col">
                  <CriteresEditor
                    items={parseCriteres(String(editForm.criteres??''))}
                    onChange={items=>saveField('criteres',serializeCriteres(items))}
                    compact
                  />
                </div>
              </Grp>
            )}
          </div>

          {/* Exigences (+ Commentaire PO si pas d'itération, cf. ci-dessus) */}
          <div className={cn('grid gap-3 mt-4 pt-3 border-t-2 border-slate-300',hasIterations?'grid-cols-1':'grid-cols-[220px_1fr]')}>
            <Grp label="Exigences" className={cn(locked('lien_dod') && 'opacity-50 pointer-events-none')}>
              <DodLinkPicker value={String(editForm.lien_dod??'')} onChange={v=>saveField('lien_dod',v)} items={dodItems}/>
            </Grp>
            {!hasIterations && (
              <Grp label="Commentaire PO">
                {/* div englobant + onBlur : MentionField utilise déjà onBlur en
                    interne pour fermer son dropdown de mentions (cf. plus haut,
                    IterationCard fait pareil pour son propre commentaire). */}
                <div onFocus={()=>setFocusedField('commentaire')}
                  onBlur={()=>{setFocusedField(null);saveField('commentaire',editForm.commentaire)}}>
                  <MentionField as="textarea" value={String(editForm.commentaire??'')} onChange={v=>setEditForm(f=>({...f,commentaire:v}))}
                    membres={membresActifs} className="ds-textarea text-xs" rows={2}/>
                </div>
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
          <button onClick={onClose} className="ds-btn flex-1">Fermer</button>
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
          exigencesVerifiees={dodItems.filter(d=>d.verifiee&&parseLienDodCodes(panelTask.lien_dod).includes(d.code))}
          onClose={()=>setShowNewIteration(false)}
          onCreate={async({devalider,...payload})=>{
            const it=await createIteration.mutateAsync({id_tache:panelTask.id_tache,...payload})
            // Rework = l'essai qui avait validé ces exigences ne couvre plus
            // la modification : repassées « à vérifier » (updateDodItem
            // journalise le changement → alimente le compteur de boucles).
            for(const id of devalider){
              const d=dodItems.find(x=>x.id===id)
              if(d)await updateDodItem.mutateAsync({id,updates:{verifiee:false},item:d})
            }
            setSelectedIterationId(it.id)
            toast(`✅ Itération ${it.numero} créée${devalider.length?` — ${devalider.length} exigence${devalider.length>1?'s':''} remise${devalider.length>1?'s':''} en vérification`:''}`)
          }}
        />
      )}
    </>
  )
}
