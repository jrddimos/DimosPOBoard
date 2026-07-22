import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, NodeResizer,
  useNodesState, useReactFlow,
  type Node, type NodeProps, type NodeTypes, type OnNodeDrag,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Plus, X, LayoutGrid, UserPlus, ArrowUpRight, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCreateTache, useUpdateTache } from '@/hooks/useTaches'
import { useEpics, useCreateEpic, epicFullName } from '@/hooks/useEpics'
import { useToast } from '@/hooks/useToast'
import { confirm } from '@/components/ui/ConfirmModal'
import { ConvertGroupModal } from '@/components/tache/ConvertGroupModal'
import {
  usePostits, usePostitGroups, useCreatePostit, useUpdatePostitPosition, useUpdatePostitColor, useDeletePostit,
  useCreateGroup, useUpdateGroup, useDeleteGroup, useClearBoard, type Postit, type PostitGroup,
} from '@/hooks/usePostitBoard'

const POSTIT_W = 180
const POSTIT_H = 140
const MAX_ZONES = 4
// Petite palette de post-it multicolores, assignée en rotation (pas
// aléatoire pur) pour varier visuellement comme un vrai bloc de sticky notes.
const PALETTE = ['#FEF08A', '#BBF7D0', '#BFDBFE', '#FBCFE8', '#FDE68A', '#DDD6FE']

interface PostitNodeData {
  postitId: number
  idTache: string
  titre: string
  couleur: string
  editing: boolean
  isDraft: boolean
  canWrite: boolean
  onSave: (text: string) => void
  onCancel: () => void
  onStartEdit: () => void
  onDelete: () => void
  onChangeColor: (couleur: string) => void
  [key: string]: unknown
}

interface GroupNodeData {
  groupId: number
  nom: string
  taskCount: number
  canWrite: boolean
  onRename: (nom: string) => void
  onDelete: () => void
  onResize: (w: number, h: number) => void
  onConvert: () => void
  [key: string]: unknown
}

// Une "zone de création" : un point d'ancrage partagé sur le canvas avec son
// propre bouton "+", pour que plusieurs personnes puissent créer des post-it
// en même temps sans que leurs brouillons ne se chevauchent. Pas de notion de
// propriétaire/verrouillage (pas de temps réel dans l'appli) — une zone est
// juste un emplacement libre-service, jusqu'à 4 en parallèle.
interface ZoneNodeData {
  zoneId: number
  canWrite: boolean
  onAdd: () => void
  onDelete: () => void
  [key: string]: unknown
}

type PostitFlowNode = Node<PostitNodeData, 'postit'>
type GroupFlowNode = Node<GroupNodeData, 'group'>
type ZoneFlowNode = Node<ZoneNodeData, 'zone'>
type BoardNode = PostitFlowNode | GroupFlowNode | ZoneFlowNode

// ── Rendu du post-it ────────────────────────────────────────────
function PostitNode({ data }: NodeProps) {
  const d = data as PostitNodeData
  const [value, setValue] = useState(d.titre)
  const valueRef = useRef(value)
  useEffect(() => { valueRef.current = value }, [value])
  const containerRef = useRef<HTMLDivElement>(null)
  // Évite un double-save : Entrée/Échap traitent déjà la sortie d'édition.
  const handledRef = useRef(false)
  useEffect(() => { if (d.editing) { setValue(d.titre); handledRef.current = false } }, [d.editing, d.titre])

  // React Flow appelle preventDefault() sur le pointerdown de son canvas
  // (pour gérer pan/sélection), ce qui empêche le navigateur de retirer le
  // focus du champ — le blur natif ne se déclenche donc pas de façon fiable
  // en cliquant sur le canvas. On détecte le clic en dehors nous-mêmes, en
  // phase de capture (avant que React Flow ne puisse l'intercepter).
  useEffect(() => {
    if (!d.editing) return
    function handlePointerDown(e: PointerEvent) {
      if (handledRef.current) return
      if (containerRef.current && !containerRef.current.contains(e.target as globalThis.Node)) {
        handledRef.current = true
        d.onSave(valueRef.current)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [d.editing, d.onSave])

  if (d.editing) {
    return (
      <div ref={containerRef} className="nodrag rounded-lg shadow-lg p-3 flex flex-col gap-2"
        style={{ width: POSTIT_W, minHeight: POSTIT_H, background: d.couleur }}>
        <input autoFocus value={value} onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); handledRef.current = true; d.onSave(value) }
            if (e.key === 'Escape') { e.preventDefault(); handledRef.current = true; d.onCancel() }
          }}
          className="nodrag w-full bg-transparent border-0 outline-none text-sm font-medium text-navy placeholder:text-navy/40"
          placeholder="Titre de la tâche…" />
        <div className="nodrag flex items-center gap-1 mt-auto">
          {PALETTE.map(c => (
            <button key={c} type="button" onClick={() => d.onChangeColor(c)} title="Changer la couleur"
              className={cn('w-4 h-4 rounded-full border-2 transition-transform', d.couleur === c ? 'border-navy scale-110' : 'border-white/60 hover:scale-110')}
              style={{ background: c }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div onDoubleClick={() => d.canWrite && d.onStartEdit()}
      className="group relative rounded-lg shadow-md p-3 flex flex-col gap-1 cursor-grab active:cursor-grabbing"
      style={{ width: POSTIT_W, minHeight: POSTIT_H, background: d.couleur }}>
      {d.canWrite && (
        <button onClick={e => { e.stopPropagation(); d.onDelete() }} title="Retirer du board (garde la tâche)"
          className="nodrag absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-black/10 text-navy/60 transition-opacity">
          <X size={12} />
        </button>
      )}
      <p className="text-sm font-medium text-navy leading-snug break-words pr-4">{d.titre}</p>
      <span className="mt-auto text-[10px] font-mono text-navy/40">{d.idTache}</span>
    </div>
  )
}

// ── Rendu d'un groupe (cadre nommé, redimensionnable) ───────────
function GroupNode({ data }: NodeProps) {
  const d = data as GroupNodeData
  const [nom, setNom] = useState(d.nom)
  useEffect(() => setNom(d.nom), [d.nom])

  return (
    <>
      {d.canWrite && (
        // Poignées toujours visibles (pas seulement quand le nœud est
        // sélectionné) : plus facile à repérer pour agrandir le cadre.
        <NodeResizer minWidth={220} minHeight={160} isVisible
          onResizeEnd={(_e, params) => d.onResize(params.width, params.height)} />
      )}
      <div className="w-full h-full rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/40 flex flex-col">
        <div className="flex items-center gap-1 px-2 py-1.5">
          <input value={nom} onChange={e => setNom(e.target.value)} disabled={!d.canWrite}
            onBlur={() => { if (nom.trim() && nom.trim() !== d.nom) d.onRename(nom.trim()) }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="nodrag flex-1 min-w-0 bg-transparent border-0 outline-none text-xs font-bold text-indigo-700 uppercase tracking-wide" />
          {d.canWrite && d.taskCount > 0 && (
            <button onClick={d.onConvert} title="Transformer en Epic ou Conteneur (avec les tâches du groupe)"
              className="nodrag shrink-0 p-1 rounded-full hover:bg-indigo-100 text-indigo-500">
              <ArrowUpRight size={12} />
            </button>
          )}
          {d.canWrite && (
            <button onClick={d.onDelete} title="Supprimer le groupe (garde les post-it)"
              className="nodrag shrink-0 p-1 rounded-full hover:bg-indigo-100 text-indigo-400">
              <X size={12} />
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// ── Rendu d'une zone de création ─────────────────────────────────
function ZoneNode({ data }: NodeProps) {
  const d = data as ZoneNodeData
  return (
    // L'anneau extérieur (sans nodrag) sert de poignée de déplacement ; le
    // bouton "+" au centre (nodrag) reste cliquable — sans cette séparation,
    // le bouton occupant tout le nœud, il ne restait aucune surface pour
    // initier un drag.
    <div title="Glisser pour déplacer ce créateur"
      className="group relative w-28 h-28 rounded-full border-2 border-dashed border-indigo-300 bg-white/80 shadow-sm flex items-center justify-center cursor-grab active:cursor-grabbing">
      {d.canWrite && (
        <button onClick={e => { e.stopPropagation(); d.onDelete() }} title="Supprimer ce créateur"
          className="nodrag absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 p-1 rounded-full bg-white shadow border border-red-200 text-red-500 hover:bg-red-50 transition-opacity">
          <X size={12} />
        </button>
      )}
      <button onClick={d.onAdd} disabled={!d.canWrite} title={`Créateur ${d.zoneId} — nouveau post-it (Entrée pour valider, Échap pour annuler)`}
        className="nodrag flex flex-col items-center justify-center gap-0.5 w-20 h-20 rounded-full text-indigo-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
        <Plus size={24} />
        <span className="text-[10px] font-semibold whitespace-nowrap">Créateur {d.zoneId}</span>
      </button>
    </div>
  )
}

interface Zone { id: number; anchor: { x: number; y: number } }
// `gen` force un nouvel id de nœud React Flow à chaque nouveau brouillon —
// sans ça, le composant du post-it (id stable `postit-draft-<zone>`) n'est
// jamais remonté d'une saisie à l'autre, et son état local (le texte tapé)
// reste affiché au lieu de repartir à vide.
type Draft = { x: number; y: number; couleur: string; gen: number }

function buildNodes(groups: PostitGroup[], postits: Postit[], zones: Zone[], drafts: Record<number, Draft>, opts: {
  editingKey: string | null
  canWrite: boolean
  onAddDraft: (zoneId: number, anchor: { x: number; y: number }) => void
  onDeleteZone: (zoneId: number) => void
  onSaveDraft: (zoneId: number, text: string) => void
  onCancelDraft: (zoneId: number) => void
  onChangeDraftColor: (zoneId: number, couleur: string) => void
  onStartEdit: (key: string) => void
  onSaveEdit: (p: Postit, text: string) => void
  onCancelEdit: () => void
  onDeletePostit: (id: number) => void
  onChangePostitColor: (id: number, couleur: string) => void
  onRenameGroup: (id: number, nom: string) => void
  onDeleteGroup: (id: number) => void
  onResizeGroup: (id: number, w: number, h: number) => void
  onConvertGroup: (id: number, nom: string) => void
}): BoardNode[] {
  const groupNodes: GroupFlowNode[] = groups.map(g => ({
    id: `group-${g.id}`, type: 'group', position: { x: g.x, y: g.y },
    style: { width: g.width, height: g.height },
    draggable: opts.canWrite,
    data: {
      groupId: g.id, nom: g.nom, canWrite: opts.canWrite,
      taskCount: postits.filter(p => p.group_id === g.id).length,
      onRename: (nom: string) => opts.onRenameGroup(g.id, nom),
      onDelete: () => opts.onDeleteGroup(g.id),
      onResize: (w: number, h: number) => opts.onResizeGroup(g.id, w, h),
      onConvert: () => opts.onConvertGroup(g.id, g.nom),
    },
  }))

  const zoneNodes: ZoneFlowNode[] = zones.map(z => ({
    id: `zone-${z.id}`, type: 'zone', position: z.anchor,
    // Doit rester déplaçable/sélectionnable : un nœud ni l'un ni l'autre se
    // voit couper tous les événements pointeur par React Flow (pointer-events:
    // none), ce qui rendait aussi le bouton "+" à l'intérieur incliquable.
    draggable: opts.canWrite, selectable: opts.canWrite,
    data: { zoneId: z.id, canWrite: opts.canWrite, onAdd: () => opts.onAddDraft(z.id, z.anchor), onDelete: () => opts.onDeleteZone(z.id) },
  }))

  const postitNodes: PostitFlowNode[] = postits.map(p => {
    const key = `postit-${p.id}`
    return {
      id: key, type: 'postit', position: { x: p.x, y: p.y },
      draggable: opts.canWrite,
      // Toujours au-dessus des brouillons en cours (voir draftNodes plus
      // bas) : une fois une tâche créée, elle doit rester bien visible même
      // si le nouveau post-it vide qui s'enchaîne juste après la chevauche.
      zIndex: 1,
      data: {
        postitId: p.id, idTache: p.id_tache, titre: p.titre, couleur: p.couleur,
        editing: opts.editingKey === key, isDraft: false, canWrite: opts.canWrite,
        onSave: (text: string) => opts.onSaveEdit(p, text),
        onCancel: opts.onCancelEdit,
        onStartEdit: () => opts.onStartEdit(key),
        onDelete: () => opts.onDeletePostit(p.id),
        onChangeColor: (couleur: string) => opts.onChangePostitColor(p.id, couleur),
      },
    }
  })

  // Un brouillon par zone active (plusieurs créations en parallèle).
  const draftNodes: PostitFlowNode[] = Object.entries(drafts).map(([zoneIdStr, draft]) => {
    const zoneId = Number(zoneIdStr)
    return {
      id: `postit-draft-${zoneId}-${draft.gen}`, type: 'postit', position: draft,
      draggable: false,
      zIndex: 0,
      data: {
        postitId: -1, idTache: '', titre: '', couleur: draft.couleur,
        editing: true, isDraft: true, canWrite: opts.canWrite,
        onSave: (text: string) => opts.onSaveDraft(zoneId, text),
        onCancel: () => opts.onCancelDraft(zoneId),
        onStartEdit: () => {}, onDelete: () => {},
        onChangeColor: (couleur: string) => opts.onChangeDraftColor(zoneId, couleur),
      },
    }
  })

  return [...groupNodes, ...zoneNodes, ...postitNodes, ...draftNodes]
}

function BoardInner({ canWrite }: { canWrite: boolean }) {
  const { data: postits = [] } = usePostits()
  const { data: groups = [] } = usePostitGroups()
  const createPostit = useCreatePostit()
  const updatePosition = useUpdatePostitPosition()
  const updateColor = useUpdatePostitColor()
  const deletePostit = useDeletePostit()
  const updateTache = useUpdateTache()
  const createTacheMut = useCreateTache()
  const createGroup = useCreateGroup()
  const updateGroup = useUpdateGroup()
  const deleteGroup = useDeleteGroup()
  const clearBoard = useClearBoard()
  const { data: epicsList = [] } = useEpics()
  const createEpic = useCreateEpic()
  const toast = useToast()
  const [convertTarget, setConvertTarget] = useState<{ groupId: number; nom: string } | null>(null)

  const { screenToFlowPosition, fitView } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState<BoardNode>([])
  const didInitialFitRef = useRef(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  // Zones de création : purement locales à la session (pas persistées) —
  // un simple point d'ancrage partagé, libre-service, jusqu'à 4 à la fois.
  // Ancré à l'origine du canvas (0,0) : combiné au fitView déclenché une fois
  // les nœuds chargés (voir plus bas), il se retrouve naturellement centré à
  // l'ouverture au lieu d'un point choisi au hasard.
  const [zones, setZones] = useState<Zone[]>([{ id: 1, anchor: { x: 0, y: 0 } }])
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const lastPosByZoneRef = useRef<Record<number, { x: number; y: number }>>({})
  // Couleur du dernier post-it créé/choisi, tous créateurs confondus — sert
  // de défaut au prochain post-it au lieu de tourner dans la palette.
  const lastColorRef = useRef(PALETTE[0])
  const draftGenRef = useRef(0)
  const groupDragRef = useRef<{ groupId: number; startX: number; startY: number; children: { id: string; x: number; y: number; dbId: number }[] } | null>(null)

  const handleSaveDraft = useCallback(async (zoneId: number, text: string) => {
    const titre = text.trim()
    const current = drafts[zoneId]
    if (!titre || !current) {
      setDrafts(d => { if (!(zoneId in d)) return d; const next = { ...d }; delete next[zoneId]; return next })
      return
    }
    try {
      await createPostit.mutateAsync({ titre, x: current.x, y: current.y, couleur: current.couleur, groupId: null })
    } catch {
      toast('Erreur lors de la création du post-it', 'error')
      setDrafts(d => { const next = { ...d }; delete next[zoneId]; return next })
      return
    }
    // Enchaîne immédiatement sur un nouveau post-it vide dans la même zone
    // (capture en rafale), en gardant la même couleur par défaut.
    lastColorRef.current = current.couleur
    draftGenRef.current++
    const next = { x: current.x + 24, y: current.y + 24, couleur: current.couleur, gen: draftGenRef.current }
    lastPosByZoneRef.current[zoneId] = next
    setDrafts(d => ({ ...d, [zoneId]: next }))
  }, [drafts, createPostit.mutateAsync, toast])

  const onChangeDraftColor = useCallback((zoneId: number, couleur: string) => {
    lastColorRef.current = couleur
    setDrafts(d => d[zoneId] ? { ...d, [zoneId]: { ...d[zoneId], couleur } } : d)
  }, [])
  const onChangePostitColor = useCallback((id: number, couleur: string) => {
    lastColorRef.current = couleur
    updateColor.mutate({ id, couleur })
  }, [updateColor.mutate])
  const onCancelDraft = useCallback((zoneId: number) => {
    setDrafts(d => { const next = { ...d }; delete next[zoneId]; return next })
  }, [])

  const handleAddDraft = useCallback((zoneId: number, anchor: { x: number; y: number }) => {
    if (!canWrite) return
    const last = lastPosByZoneRef.current[zoneId]
    const pos = last ? { x: last.x + 24, y: last.y + 24 } : { x: anchor.x, y: anchor.y - POSTIT_H - 16 }
    lastPosByZoneRef.current[zoneId] = pos
    draftGenRef.current++
    setDrafts(d => ({ ...d, [zoneId]: { ...pos, couleur: lastColorRef.current, gen: draftGenRef.current } }))
  }, [canWrite])

  const handleDeleteZone = useCallback((zoneId: number) => {
    setZones(z => z.filter(zn => zn.id !== zoneId))
    setDrafts(d => { if (!(zoneId in d)) return d; const next = { ...d }; delete next[zoneId]; return next })
    delete lastPosByZoneRef.current[zoneId]
  }, [])

  const handleAddZone = useCallback(() => {
    if (!canWrite) return
    setZones(z => {
      if (z.length >= MAX_ZONES) return z
      // Comble le premier numéro libre (1..4) plutôt que d'incrémenter
      // aveuglément, pour ne pas dupliquer un ID après suppression d'un
      // créateur intermédiaire.
      const used = new Set(z.map(zn => zn.id))
      let nextId = 1
      while (used.has(nextId)) nextId++
      const base = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      const anchor = { x: base.x + (nextId - 1) * 260, y: base.y + 220 }
      return [...z, { id: nextId, anchor }]
    })
  }, [canWrite, screenToFlowPosition])

  const handleSaveEdit = useCallback(async (p: Postit, text: string) => {
    const titre = text.trim()
    setEditingKey(null)
    if (!titre || titre === p.titre) return
    await updateTache.mutateAsync({ id_tache: p.id_tache, updates: { titre } })
  }, [updateTache.mutateAsync])

  const handleAddGroup = useCallback(async () => {
    if (!canWrite) return
    const pos = screenToFlowPosition({ x: window.innerWidth / 2 - 160, y: window.innerHeight / 2 - 120 })
    await createGroup.mutateAsync({ nom: 'Nouveau groupe', x: pos.x, y: pos.y })
  }, [canWrite, createGroup.mutateAsync, screenToFlowPosition])

  // Vide le board pour repartir propre : supprime tous les post-it et
  // groupes du produit (les tâches restent, cf. useClearBoard), et
  // réinitialise l'état local (créateurs, brouillons en cours).
  const handleClearBoard = useCallback(async () => {
    if (!canWrite) return
    const ok = await confirm({
      title: 'Vider le board Fast Task ?',
      message: `${postits.length} post-it et ${groups.length} groupe(s) seront retirés du board. Les tâches déjà créées ne sont PAS supprimées (retrouvables dans la liste, filtre "Epic manquant").`,
      confirmLabel: 'Vider le board', variant: 'danger',
    })
    if (!ok) return
    await clearBoard.mutateAsync()
    setZones([{ id: 1, anchor: { x: 0, y: 0 } }])
    setDrafts({})
    setEditingKey(null)
    lastPosByZoneRef.current = {}
    didInitialFitRef.current = false
    toast('✅ Board vidé')
  }, [canWrite, postits.length, groups.length, clearBoard, toast])

  // Callbacks passés aux nœuds : stabilisés via useCallback pour ne PAS
  // dépendre des objets de mutation entiers dans l'effet ci-dessous — ceux-ci
  // sont recréés à chaque rendu par React Query (seule `.mutate` est stable),
  // ce qui reconstruisait les nœuds en boucle et perturbait la mesure interne
  // de React Flow (un nœud fraîchement monté "clignotait").
  const onStartEdit = useCallback((key: string) => setEditingKey(key), [])
  const onCancelEdit = useCallback(() => setEditingKey(null), [])
  const onDeletePostit = useCallback((id: number) => deletePostit.mutate(id), [deletePostit.mutate])
  const onRenameGroup = useCallback((id: number, nom: string) => updateGroup.mutate({ id, updates: { nom } }), [updateGroup.mutate])
  const onDeleteGroup = useCallback((id: number) => deleteGroup.mutate(id), [deleteGroup.mutate])
  const onResizeGroup = useCallback((id: number, w: number, h: number) => updateGroup.mutate({ id, updates: { width: w, height: h } }), [updateGroup.mutate])
  const onConvertGroup = useCallback((groupId: number, nom: string) => setConvertTarget({ groupId, nom }), [])

  // Transforme un groupe de post-it en backlog réel : le nom du groupe
  // devient le nom du nouvel Epic/Conteneur, et toutes les tâches du groupe
  // (mêmes id_tache que les post-it) y sont rattachées. Le groupe et ses
  // post-it restent sur le board tels quels — rien n'est supprimé ici.
  const handleConvertConfirm = useCallback(async (choice: { type: 'epic' } | { type: 'conteneur'; epicLabel: string }) => {
    if (!convertTarget) return
    const groupPostits = postits.filter(p => p.group_id === convertTarget.groupId)
    const idsTache = groupPostits.map(p => p.id_tache)
    if (choice.type === 'epic') {
      // Numéro auto-généré par useCreateEpic — on récupère l'Epic créé pour
      // construire le libellé exact attribué à ses tâches.
      const newEpic = await createEpic.mutateAsync({ nom: convertTarget.nom, couleur: '#4A4CC8', bg_couleur: '#EEF2FF' })
      const newEpicLabel = epicFullName(newEpic)
      for (const id_tache of idsTache) await updateTache.mutateAsync({ id_tache, updates: { epic: newEpicLabel } })
      toast(`✅ Epic "${convertTarget.nom}" créé avec ${idsTache.length} tâche(s)`)
    } else {
      const conteneur = await createTacheMut.mutateAsync({ titre: convertTarget.nom, type_tache: 'Conteneur', epic: choice.epicLabel, statut: 'À faire' })
      for (const id_tache of idsTache) await updateTache.mutateAsync({ id_tache, updates: { epic: choice.epicLabel, parent_id: conteneur.id_tache } })
      toast(`✅ Conteneur "${convertTarget.nom}" créé avec ${idsTache.length} tâche(s)`)
    }
    // Une fois graduées vers un vrai Epic/Conteneur, les tâches n'ont plus
    // besoin d'exister comme post-it sur le board — on retire leurs post-it
    // et le groupe qui les contenait (les tâches, elles, restent bien sûr).
    for (const p of groupPostits) await deletePostit.mutateAsync(p.id)
    await deleteGroup.mutateAsync(convertTarget.groupId)
  }, [convertTarget, postits, epicsList, createEpic, createTacheMut, updateTache, deletePostit, deleteGroup, toast])

  useEffect(() => {
    setNodes(buildNodes(groups, postits, zones, drafts, {
      editingKey, canWrite,
      onAddDraft: handleAddDraft,
      onDeleteZone: handleDeleteZone,
      onSaveDraft: handleSaveDraft,
      onCancelDraft,
      onChangeDraftColor,
      onStartEdit,
      onSaveEdit: handleSaveEdit,
      onCancelEdit,
      onDeletePostit,
      onChangePostitColor,
      onRenameGroup,
      onDeleteGroup,
      onResizeGroup,
      onConvertGroup,
    }))
  }, [groups, postits, zones, drafts, editingKey, canWrite, handleAddDraft, handleDeleteZone, handleSaveDraft, onCancelDraft, onChangeDraftColor, onStartEdit, handleSaveEdit, onCancelEdit, onDeletePostit, onChangePostitColor, onRenameGroup, onDeleteGroup, onResizeGroup, onConvertGroup, setNodes])

  // `fitView` (prop booléenne sur <ReactFlow>) ne cadre qu'une seule fois, au
  // tout premier rendu — or `nodes` démarre vide et ne se peuple qu'un
  // instant après via l'effet ci-dessus, donc ce cadrage initial se faisait
  // sur "rien" (viewport par défaut) plutôt que sur le vrai contenu. On
  // déclenche donc le cadrage nous-mêmes, la première fois que des nœuds
  // sont réellement présents.
  useEffect(() => {
    if (didInitialFitRef.current || nodes.length === 0) return
    didInitialFitRef.current = true
    requestAnimationFrame(() => fitView({ padding: 0.2 }))
  }, [nodes, fitView])

  // Glisser un groupe déplace visuellement (en direct) tous les post-it
  // qu'il contient, puis persiste tout au relâchement (pas à chaque frame).
  const handleNodeDragStart: OnNodeDrag<BoardNode> = useCallback((_e, node) => {
    if (node.type !== 'group') return
    const groupId = node.data.groupId
    const children = postits.filter(p => p.group_id === groupId)
      .map(p => ({ id: `postit-${p.id}`, x: p.x, y: p.y, dbId: p.id }))
    groupDragRef.current = { groupId, startX: node.position.x, startY: node.position.y, children }
  }, [postits])

  const handleNodeDrag: OnNodeDrag<BoardNode> = useCallback((_e, node) => {
    const drag = groupDragRef.current
    if (!drag || node.type !== 'group' || node.data.groupId !== drag.groupId) return
    const dx = node.position.x - drag.startX
    const dy = node.position.y - drag.startY
    setNodes(nds => nds.map(n => {
      const child = drag.children.find(c => c.id === n.id)
      return child ? { ...n, position: { x: child.x + dx, y: child.y + dy } } : n
    }))
  }, [setNodes])

  // Un post-it lâché à l'intérieur du rectangle d'un groupe lui est rattaché
  // (group_id) ; lâché ailleurs, il en est détaché — regroupement par simple
  // superposition visuelle, pas par imbrication react-flow (plus simple à
  // raisonner que le système parent/enfant natif pour ce cas d'usage).
  const handleNodeDragStop: OnNodeDrag<BoardNode> = useCallback((_e, node) => {
    if (node.type === 'group') {
      const groupId = node.data.groupId
      updateGroup.mutate({ id: groupId, updates: { x: node.position.x, y: node.position.y } })
      const drag = groupDragRef.current
      if (drag && drag.groupId === groupId) {
        const dx = node.position.x - drag.startX
        const dy = node.position.y - drag.startY
        drag.children.forEach(c => updatePosition.mutate({ id: c.dbId, x: c.x + dx, y: c.y + dy }))
      }
      groupDragRef.current = null
    } else if (node.type === 'postit' && !node.data.isDraft) {
      const centerX = node.position.x + POSTIT_W / 2
      const centerY = node.position.y + POSTIT_H / 2
      const hit = groups.find(g => centerX >= g.x && centerX <= g.x + g.width && centerY >= g.y && centerY <= g.y + g.height)
      updatePosition.mutate({ id: node.data.postitId, x: node.position.x, y: node.position.y, groupId: hit ? hit.id : null })
    } else if (node.type === 'zone') {
      // Zones non persistées en base (locales à la session) : on met juste à
      // jour le state local, sinon l'effet de reconstruction des nœuds la
      // remettrait à sa position d'origine au prochain changement.
      const zoneId = node.data.zoneId
      setZones(z => z.map(zn => zn.id === zoneId ? { ...zn, anchor: { x: node.position.x, y: node.position.y } } : zn))
    }
  }, [groups, updateGroup, updatePosition])

  const nodeTypes = useMemo<NodeTypes>(() => ({ postit: PostitNode, group: GroupNode, zone: ZoneNode }), [])

  return (
    <div className="relative w-full" style={{ height: 'calc(100vh - 220px)' }}>
      <ReactFlow
        nodes={nodes}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        nodesDraggable={canWrite}
        nodesConnectable={false}
        elementsSelectable
        onNodeDragStart={handleNodeDragStart}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!hidden md:!block" />
      </ReactFlow>
      {canWrite && (
        <div className="absolute bottom-5 right-5 flex flex-col items-end gap-2 z-10">
          <button onClick={handleAddGroup} title="Nouveau groupe"
            className="ds-btn bg-card shadow-lg flex items-center gap-1.5"><LayoutGrid size={14} /> Groupe</button>
          <button onClick={handleAddZone} disabled={zones.length >= MAX_ZONES}
            title={zones.length >= MAX_ZONES ? 'Maximum 4 créateurs' : 'Ajouter un créateur (nouvelle zone avec son propre +)'}
            className="ds-btn bg-card shadow-lg flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
            <UserPlus size={14} /> Créateur ({zones.length}/{MAX_ZONES})
          </button>
          <button onClick={handleClearBoard} title="Vider le board (garde les tâches)"
            className="ds-btn-danger bg-card shadow-lg flex items-center gap-1.5">
            <Trash2 size={14} /> Vider le board
          </button>
        </div>
      )}
      {convertTarget && (
        <ConvertGroupModal
          groupNom={convertTarget.nom}
          taskCount={postits.filter(p => p.group_id === convertTarget.groupId).length}
          epicsList={epicsList}
          onClose={() => setConvertTarget(null)}
          onConfirm={handleConvertConfirm}
        />
      )}
    </div>
  )
}

export function FastTaskBoard({ canWrite }: { canWrite: boolean }) {
  return (
    <ReactFlowProvider>
      <BoardInner canWrite={canWrite} />
    </ReactFlowProvider>
  )
}
