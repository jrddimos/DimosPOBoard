import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Gantt as SvarGantt, Willow, WillowDark, type ITask } from '@svar-ui/react-gantt'
import '@svar-ui/react-gantt/all.css'
import { Layout } from '@/components/layout/Layout'
import { PageTitle } from '@/components/ui/PageTitle'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { confirm } from '@/components/ui/ConfirmModal'
import {
  Milestone, Settings, Plus, Minus, Trash2, X, Layers, Boxes, CalendarDays, Check, Pencil,
  Rocket, Star, Target, Flag, Zap, Trophy, Gem, Lightbulb, Users, ChevronRight, ChevronLeft, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useGammesProduits, useCreateGammeProduit, useUpdateGammeProduit, useDeleteGammeProduit,
  type GammeProduit,
} from '@/hooks/useGammesProduits'
import {
  useRoadmapItems, useCreateRoadmapItem, useUpdateRoadmapItem, useDeleteRoadmapItem,
  type RoadmapItem, type TrimQuarterObjectifs,
} from '@/hooks/useRoadmapItems'
import { useAuth } from '@/contexts/AuthContext'
import { useDarkModeStore } from '@/hooks/useDarkMode'
import { useEquipes } from '@/hooks/useEquipes'
import { useClickOutside } from '@/hooks/useClickOutside'
import { useToast } from '@/hooks/useToast'
import { getQuarterStart, getQuarterEnd } from '@/utils/produitMetrics'
import { type TrimCheckItem } from '@/hooks/useProduits'
import { BRAND_COLORS } from '@/constants'
import type { Equipe } from '@/types'

// Roadmap : vue globale (menu Global), 100% décorrélée de la table produits
// et de son avancement — ses propres gammes (gammes_produits) et ses propres
// éléments (roadmap_items), avec sa configuration intégrée à la même page.

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// Mélange une couleur hex avec une cible (blanc/noir) pour obtenir un ton
// clair/foncé dérivé — utilisé pour les dégradés des barres du Gantt.
function mix(hex: string, target: string, ratio: number): string {
  const parse = (c: string) => parseInt(c.replace('#', ''), 16)
  const a = parse(hex), b = parse(target)
  const chan = (shift: number) => {
    const av = (a >> shift) & 255, bv = (b >> shift) & 255
    return Math.round(av + (bv - av) * ratio)
  }
  return `#${[chan(16), chan(8), chan(0)].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

function formatQuarterLabel(id: string): string {
  const m = id.match(/Q([1-4])[- ](\d{4})/i)
  return m ? `T${m[1]} ${m[2]}` : id
}

// Liste les identifiants de trimestre ('Q1-2026') couverts entre début et fin
// inclus — sert à proposer un bloc d'objectifs par trimestre dans la modale.
function quartersBetween(debut: string, fin: string): string[] {
  const parse = (id: string) => { const m = id.match(/Q([1-4])-(\d{4})/); return m ? { q: Number(m[1]), y: Number(m[2]) } : null }
  const a = parse(debut), b = parse(fin)
  if (!a || !b) return []
  const result: string[] = []
  let { q, y } = a
  let guard = 0
  while ((y < b.y || (y === b.y && q <= b.q)) && guard++ < 100) {
    result.push(`Q${q}-${y}`)
    q++; if (q > 4) { q = 1; y++ }
  }
  return result
}

// Options de trimestres proposées dans les sélecteurs début/fin (fenêtre
// glissante large, adaptée à une vision long terme — couvre la fenêtre
// d'affichage maximale du Gantt, 6 ans).
function quarterOptions(): { id: string; label: string }[] {
  const startYear = new Date().getFullYear() - 1
  const opts: { id: string; label: string }[] = []
  for (let y = startYear; y < startYear + 8; y++) {
    for (let q = 1; q <= 4; q++) opts.push({ id: `Q${q}-${y}`, label: `T${q} ${y}` })
  }
  return opts
}

// Icônes proposées pour les éléments de roadmap (stockées par id en base).
const ICON_CHOICES: { id: string; Icon: LucideIcon }[] = [
  { id: 'rocket', Icon: Rocket },
  { id: 'star', Icon: Star },
  { id: 'target', Icon: Target },
  { id: 'flag', Icon: Flag },
  { id: 'zap', Icon: Zap },
  { id: 'trophy', Icon: Trophy },
  { id: 'gem', Icon: Gem },
  { id: 'lightbulb', Icon: Lightbulb },
]
const ICON_MAP = new Map(ICON_CHOICES.map(c => [c.id, c.Icon]))

function currentQuarterId(): string {
  const now = new Date()
  return `Q${Math.floor(now.getMonth() / 3) + 1}-${now.getFullYear()}`
}

// Largeur d'une colonne trimestre du Gantt — élargie (70→120) pour laisser
// assez de place au texte des objectifs affichés à l'intérieur de la barre.
const CELL_WIDTH = 120

// Géométrie des lignes produit : la barre elle-même devient une boîte pleine
// hauteur de ligne (plus une pilule fine) — pour chaque trimestre couvert,
// une checklist empilée de ses objectifs collée en haut de la boîte (plus
// d'icône produit à décaler pour). La hauteur de ligne du Gantt (cellHeight)
// est GLOBALE à tout le tableau (gammes comprises), donc calculée
// dynamiquement sur le nombre max d'objectifs d'UN SEUL trimestre parmi tous
// les produits affichés (cf. computeCellHeight), plafonné à OBJ_MAX_VISIBLE
// pour éviter qu'un seul produit très chargé n'étire toutes les lignes du
// Gantt à l'extrême.
const ROW_TOP_PAD = 6
const OBJ_LINE_H = 14
const OBJ_MAX_VISIBLE = 5
const ROW_BOTTOM_PAD = 8
const ROW_MARGIN = 6

function computeCellHeight(tasks: RmRow[]): number {
  let maxObjs = 0
  for (const t of tasks) {
    if (t.kind !== 'item' || !t.markers) continue
    for (const m of t.markers) maxObjs = Math.max(maxObjs, m.objectifs.length)
  }
  const visible = Math.min(Math.max(maxObjs, 1), OBJ_MAX_VISIBLE)
  const contentHeight = ROW_TOP_PAD + visible * OBJ_LINE_H + ROW_BOTTOM_PAD
  return Math.max(40, contentHeight + ROW_MARGIN)
}

// Lignes réellement visibles compte tenu des branches repliées — le Gantt
// masque nativement les enfants d'une ligne dont `open` vaut false (via son
// pointeur `parent`), mais nos propres calculs (hauteur du conteneur,
// hauteur de ligne dynamique) doivent aussi ignorer ce qui est masqué, sinon
// replier une gamme laisse un grand vide au lieu de libérer la place.
function computeVisibleTasks(tasks: RmRow[], collapsedIds: Set<string>): RmRow[] {
  const byId = new Map(tasks.map(t => [String(t.id), t]))
  function hiddenByAncestor(t: RmRow): boolean {
    let p = t.parent
    while (p !== undefined && p !== null && p !== 0 && p !== '0') {
      const pid = String(p)
      if (collapsedIds.has(pid)) return true
      p = byId.get(pid)?.parent
    }
    return false
  }
  return tasks.filter(t => !hiddenByAncestor(t))
}

// Pose une classe-ancre sur la cellule d'échelle du trimestre courant.
// `autoScale` est désactivé (cf. <SvarGantt>) pour que la fenêtre affichée
// respecte strictement horizonYears — mais on continue de mesurer cette
// cellule dans le DOM plutôt que de calculer depuis chartStart, plus simple
// à garder correct si la lib recalcule ses colonnes en interne.
function anchorQuarterNow(date: Date, unit: string): string {
  if (unit !== 'quarter') return ''
  const now = new Date()
  return date.getFullYear() === now.getFullYear() && Math.floor(date.getMonth() / 3) === Math.floor(now.getMonth() / 3)
    ? 'rm-q-anchor' : ''
}

// Champs custom portés par les lignes du Gantt en plus d'ITask (qui accepte
// des clés libres) : ils alimentent les cellules custom de la grille de gauche.
type RmRow = ITask & {
  kind?: 'gamme' | 'sous' | 'item'
  couleur?: string
  count?: number
  icone?: string | null
  done?: number
  total?: number
  // Profondeur d'un item : 1 sous une gamme, 2 sous une sous-gamme.
  depth?: number
  // Badges d'objectifs par trimestre (uniquement les lignes kind='item').
  markers?: BarMarker[]
}

// Drag-and-drop par Pointer Events (pas l'API HTML5 native, ni dnd-kit) :
// SVAR Gantt contrôle lui-même le DOM/les events de ses lignes (sélection au
// clic, etc.) — le drag natif HTML5 (draggable/dragstart) s'est avéré peu
// fiable une fois imbriqué dans son propre gestionnaire de souris (dragstart
// ne partait pas de façon cohérente). Pointer Events + setPointerCapture
// contourne totalement ça : une fois la capture posée sur l'élément source
// au pointerdown, TOUS les events suivants (move/up) lui sont redirigés quoi
// que fasse la lib, on n'a plus besoin que le dragstart natif se déclenche.
// La cible sous le curseur est retrouvée via document.elementFromPoint +
// l'attribut data-rm-row-id posé sur chaque ligne (gamme/sous/item).
interface RmDragProps {
  draggedId: string | null
  dragOverId: string | null
  onPointerDown: (e: React.PointerEvent<HTMLElement>, row: RmRow) => void
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void
}

// Cellule "nom" : gammes en tête de section (chevron dépliable + pastille +
// compteur), sous-gammes indentées (même chevron), produits avec leur icône
// colorée, indentés selon leur profondeur. Le chevron d'une gamme replie/
// déplie tout son arbre (elle + ses sous-gammes) en un clic — cf. toggleBranch.
// `drag` (absent = DnD désactivé, ex. vue par équipe ou non-admin) : une
// sous-gamme ou un produit peut être glissé sur une gamme/sous-gamme pour y
// être déplacé (cf. RoadmapGanttView pour la logique de validation/drop).
function NameCell({ row, collapsed, onToggle, drag }: { row: RmRow; collapsed: boolean; onToggle: (row: RmRow) => void; drag?: RmDragProps }) {
  const couleur = row.couleur ?? '#4A4CC8'
  const rowId = String(row.id)
  const isDragging = drag?.draggedId === rowId
  const isDragOver = drag?.dragOverId === rowId
  if (row.kind === 'gamme' || row.kind === 'sous') {
    const sous = row.kind === 'sous'
    // Seules les sous-gammes se déplacent (vers une AUTRE gamme de premier
    // niveau) — les gammes de premier niveau restent fixes, uniquement
    // cibles de drop.
    const draggableSelf = !!drag && sous
    return (
      <span
        data-rm-row-id={rowId} data-rm-row-kind={row.kind}
        className={cn('flex items-center gap-1.5 min-w-0 rounded-md transition-colors', sous && 'pl-4', draggableSelf && 'touch-none',
          isDragging && 'opacity-40', isDragOver && 'bg-indigo-50 ring-1 ring-inset ring-indigo-300')}
        onPointerDown={draggableSelf ? e => drag!.onPointerDown(e, row) : undefined}
        onPointerMove={drag?.draggedId ? drag.onPointerMove : undefined}
        onPointerUp={drag?.draggedId ? drag.onPointerUp : undefined}
      >
        <button
          onClick={e => { e.stopPropagation(); onToggle(row) }}
          title={collapsed ? 'Déplier' : 'Replier'}
          className="p-0.5 -ml-0.5 rounded hover:bg-bg text-subtle hover:text-navy shrink-0 transition-colors"
        >
          <ChevronRight size={sous ? 10 : 11} className={cn('transition-transform duration-150', !collapsed && 'rotate-90')} />
        </button>
        <span
          className={cn('rounded-full shrink-0', sous ? 'w-2 h-2' : 'w-2.5 h-2.5')}
          style={{ background: couleur, boxShadow: sous ? undefined : `0 0 0 3px ${couleur}26` }}
        />
        <span className={cn('truncate text-navy', sous ? 'text-[11px] font-bold' : 'text-[11px] font-extrabold uppercase tracking-wide')}>{row.text}</span>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 tabular-nums" style={{ background: `${couleur}1f`, color: couleur }}>{row.count}</span>
      </span>
    )
  }
  const Icon = ICON_MAP.get(row.icone ?? '') ?? Rocket
  return (
    <span
      data-rm-row-id={rowId} data-rm-row-kind={row.kind}
      className={cn('flex items-center gap-2 min-w-0 rounded-md transition-colors', drag && 'touch-none', isDragging && 'opacity-40')}
      style={{ paddingLeft: (row.depth ?? 1) * 16 }}
      onPointerDown={drag ? e => drag.onPointerDown(e, row) : undefined}
      onPointerMove={drag?.draggedId ? drag.onPointerMove : undefined}
      onPointerUp={drag?.draggedId ? drag.onPointerUp : undefined}
    >
      <span
        className="w-5 h-5 rounded-md flex items-center justify-center text-white shrink-0 shadow-sm"
        style={{ background: `linear-gradient(135deg, ${mix(couleur, '#ffffff', 0.25)}, ${couleur})` }}
      ><Icon size={11} /></span>
      <span className="text-xs font-semibold text-navy truncate">{row.text}</span>
    </span>
  )
}

function buildRoadmapColumns(nameHeader: string, collapsedIds: Set<string>, onToggle: (row: RmRow) => void, drag?: RmDragProps) {
  return [
    {
      id: 'text', header: nameHeader, flexgrow: 1, align: 'left' as const,
      // treetoggle:false — sans ça la grille pose SON PROPRE chevron natif
      // devant la cellule (colonne "arbre" par défaut), en plus du nôtre
      // dans NameCell : deux chevrons qui se marchaient dessus.
      treetoggle: false,
      cell: ({ row }: { row: RmRow }) => <NameCell row={row} collapsed={collapsedIds.has(String(row.id))} onToggle={onToggle} drag={drag} />,
    },
  ]
}

const ROADMAP_SCALES = [
  { unit: 'year' as const, step: 1, format: (d: Date) => String(d.getFullYear()) },
  { unit: 'quarter' as const, step: 1, format: (d: Date) => `T${Math.floor(d.getMonth() / 3) + 1}` },
]

// Liste d'objectifs positionnée sur la barre, au centre de chaque trimestre
// couvert par l'élément (left en % de la largeur de la barre) — `objectifs`
// porte la liste déjà filtrée (par équipe le cas échéant) affichée telle
// quelle sous la barre, cf. RoadmapBarContent.
type BarMarker = { trimestre: string; left: number; done: number; total: number; tooltip: string; icone?: string | null; objectifs: TrimCheckItem[] }

// Calcule les badges d'objectifs d'un item sur une fenêtre [start, end]
// donnée (positions en % relatives à CETTE fenêtre, pas forcément la période
// complète de l'item). Sans equipeId : tous les objectifs du trimestre. Avec
// equipeId : uniquement ceux taggés à cette équipe — utilisé pour la vue
// Roadmap "par équipe", où la barre ne doit refléter que sa contribution.
function buildItemMarkers(it: RoadmapItem, start: Date, end: Date, equipeId?: number): { markers: BarMarker[]; done: number; total: number } {
  const span = end.getTime() - start.getTime()
  let done = 0, total = 0
  const markers: BarMarker[] = quartersBetween(it.trimestre_debut, it.trimestre_fin).flatMap(qid => {
    const qs = getQuarterStart(qid), qe = getQuarterEnd(qid)
    if (!qs || !qe) return []
    if (qs.getTime() < start.getTime() || qe.getTime() > end.getTime()) return []
    const qData = it.trimestre_objectifs?.find(t => t.trimestre === qid)
    const allObjectifs = qData?.objectifs ?? []
    const objectifs = equipeId == null ? allObjectifs : allObjectifs.filter(o => o.equipe_ids?.includes(equipeId))
    const doneQ = objectifs.filter(o => o.checked).length
    total += objectifs.length
    done += doneQ
    const tooltip = objectifs.length
      ? `${formatQuarterLabel(qid)} — ${doneQ}/${objectifs.length} objectif(s)\n` + objectifs.map(o => `${o.checked ? '✓' : '○'} ${o.texte}`).join('\n')
      : `${formatQuarterLabel(qid)} — aucun objectif${equipeId == null ? ' (cliquez pour en ajouter)' : ' de cette équipe'}`
    const mid = (qs.getTime() + qe.getTime()) / 2
    return [{ trimestre: qid, left: span ? ((mid - start.getTime()) / span) * 100 : 50, done: doneQ, total: objectifs.length, tooltip, icone: qData?.icone, objectifs }]
  })
  return { markers, done, total }
}

// Fenêtre [start, end] resserrée aux seuls trimestres où au moins un badge a
// du contenu (total > 0) — sert à faire porter la barre "équipe" uniquement
// sur les trimestres où elle a vraiment un objectif taggé, pas toute la
// période de l'item d'origine.
function activeWindowFromMarkers(markers: BarMarker[]): { start: Date; end: Date } | null {
  const active = markers.filter(m => m.total > 0)
  if (!active.length) return null
  const starts = active.map(m => getQuarterStart(m.trimestre)).filter((d): d is Date => !!d)
  const ends = active.map(m => getQuarterEnd(m.trimestre)).filter((d): d is Date => !!d)
  if (!starts.length || !ends.length) return null
  return { start: new Date(Math.min(...starts.map(d => d.getTime()))), end: new Date(Math.max(...ends.map(d => d.getTime()))) }
}

// Feuilles de style des barres du Gantt à partir de la palette type→couleur
// collectée pendant la construction des tâches — identique pour la vue par
// gamme et la vue par équipe (seul le regroupement des lignes change).
// `rowHeight` doit être un pixel exact (pas un `calc(100% - Npx)`) : les
// barres sont positionnées en absolute DANS le chart (pas dans un wrapper de
// ligne dédié), donc un `height:100%` s'y résout à la hauteur de tout le
// chart plutôt qu'à celle de SA seule ligne — c'est ce qui faisait déborder
// la boîte d'objectifs sur la ligne suivante.
function buildColorCss(typeColors: Map<string, { color: string; kind: 'gamme' | 'sous' | 'item' }>, rowHeight: number): string {
  return [...typeColors.entries()].map(([type, { color, kind }]) => {
    if (kind !== 'item') {
      const h = kind === 'gamme' ? 14 : 10
      return `
        .wx-gantt .wx-bar.wx-task.${type} {
          height: ${h}px !important;
          margin-top: ${kind === 'gamme' ? 9 : 11}px;
          background: linear-gradient(90deg, ${color}30, ${color}59);
          border: 1px solid ${color}66;
          border-radius: 999px;
          box-shadow: none;
        }
        .wx-gantt .wx-bar.wx-task.${type}:hover { filter: none; box-shadow: none; }
      `
    }
    const light = mix(color, '#ffffff', 0.5)
    return `
      .wx-gantt .wx-bar.wx-task.${type} {
        /* Boîte pleine hauteur de ligne (plus une pilule fine) : les
           objectifs sont affichés À L'INTÉRIEUR de la barre elle-même
           (icône produit en haut, checklist par trimestre en dessous, cf.
           RoadmapBarContent), pas dans la ligne en dessous. Hauteur en pixel
           exact (pas calc(100%…), cf. commentaire sur buildColorCss). */
        height: ${rowHeight - ROW_MARGIN}px !important;
        margin-top: ${ROW_MARGIN / 2}px;
        background: linear-gradient(135deg, ${light} 0%, ${color} 100%);
        border: none;
        border-radius: 14px;
        box-shadow: 0 3px 10px -2px ${color}77;
      }
      .wx-gantt .wx-bar.wx-task.${type}:hover {
        filter: brightness(1.08) saturate(1.1);
        box-shadow: 0 6px 18px -2px ${color}99;
      }
    `
  }).join('\n')
}

function truncateObjectif(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

// Contenu custom des barres du Gantt : icône de l'élément en haut de la
// boîte + pour chaque trimestre couvert, une petite carte contenant la
// checklist empilée de ses objectifs (case cochée/non cochée + texte),
// directement lisible sans clic (l'édition — cocher, ajouter, tagger une
// équipe — reste au clic, cf. ItemDetailPopover). Les champs custom (markers,
// icone) sont portés par la tâche elle-même (ITask accepte des clés libres).
// `.rm-bar` capte lui-même le clic (sur tout son périmètre, pas juste un
// badge) pour rouvrir le popover sur toute la ligne ; le contenu affiché
// reste en lecture seule (pas de case à cocher directement dans le Gantt).
function RoadmapBarContent({ data, api }: { data: ITask; api?: { exec: (action: string, params: unknown) => void } }) {
  const markers = (data as RmRow).markers
  if (!markers) return null
  const nowQ = currentQuarterId()
  return (
    <div className="rm-bar" onClick={() => api?.exec('select-task', { id: data.id })}>
      {markers.map(m => {
        const stackDone = m.total > 0 && m.done === m.total
        return (
          <div
            key={m.trimestre} title={m.tooltip}
            className={cn('rm-obj-stack', m.trimestre === nowQ && 'rm-now-stack', stackDone && 'rm-stack-done')}
            style={{ left: `${m.left}%` }}
          >
            {m.objectifs.length === 0 ? (
              <span className="rm-obj-empty">—</span>
            ) : (
              <>
                {/* Le nombre de lignes rendues ne doit JAMAIS dépasser
                    OBJ_MAX_VISIBLE (espace réservé par computeCellHeight) —
                    la ligne "+N de plus" occupe alors un des créneaux, pas un
                    créneau EN PLUS (sinon débordement sous la boîte). */}
                {(m.objectifs.length <= OBJ_MAX_VISIBLE ? m.objectifs : m.objectifs.slice(0, OBJ_MAX_VISIBLE - 1)).map(o => (
                  <span key={o.id} className="rm-obj-line">
                    <span className={cn('rm-chk', o.checked && 'rm-chk-done')}>
                      {o.checked && <Check size={7} strokeWidth={3.5} />}
                    </span>
                    <span className={cn('rm-obj-text', o.checked && 'rm-obj-done')}>{truncateObjectif(o.texte, 22)}</span>
                  </span>
                ))}
                {m.objectifs.length > OBJ_MAX_VISIBLE && (
                  <span className="rm-obj-more">+{m.objectifs.length - (OBJ_MAX_VISIBLE - 1)} de plus</span>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Style de base injecté une seule fois : arrondis, ombres, transitions des
// barres et badges d'objectifs, indépendamment de la couleur par gamme/élément.
const BASE_GANTT_CSS = `
  .wx-gantt { --wx-gantt-bar-border-radius: 999px; }
  .wx-gantt .wx-bar.wx-task { transition: filter .15s ease, box-shadow .15s ease; cursor: pointer; overflow: visible; }
  .wx-gantt .wx-scale-cell { font-weight: 700; letter-spacing: .3px; }
  /* L'ascenseur horizontal natif du chart vit DANS le scroller et recouvre
     donc toujours la dernière ligne : on le masque totalement, le défilement
     passe par la barre externe .rm-hscroll rendue sous la carte (le scroll à
     la molette/trackpad du chart continue de fonctionner). */
  .wx-gantt .wx-chart { scrollbar-width: none !important; }
  .wx-gantt .wx-chart::-webkit-scrollbar { display: none; width: 0; height: 0; }
  /* La grille de gauche a aussi son propre ascenseur horizontal qui recouvre
     sa dernière ligne — nos cellules tronquent leur contenu, on le supprime. */
  .wx-gantt .wx-table-container { overflow-x: hidden !important; }
  /* Ascenseur vertical fin */
  .wx-gantt::-webkit-scrollbar { width: 8px; }
  .wx-gantt::-webkit-scrollbar-track { background: transparent; }
  .wx-gantt::-webkit-scrollbar-thumb { background: rgba(100,116,139,.35); border-radius: 999px; }
  /* Barre de défilement horizontale externe, alignée sous la zone chart */
  .rm-hscroll { scrollbar-width: thin; }
  .rm-hscroll::-webkit-scrollbar { height: 8px; }
  .rm-hscroll::-webkit-scrollbar-track { background: transparent; }
  .rm-hscroll::-webkit-scrollbar-thumb { background: rgba(100,116,139,.45); border-radius: 999px; }
  .rm-hscroll::-webkit-scrollbar-thumb:hover { background: rgba(100,116,139,.7); }
  .rm-bar { position: absolute; inset: 0; cursor: pointer; }
  /* Objectifs affichés À L'INTÉRIEUR de la barre colorée (pas sur le fond de
     carte) : texte blanc fixe, plus besoin d'adapter au thème clair/sombre.
     Chaque trimestre a sa propre petite carte (fond + coins arrondis) pour
     bien lire "ça appartient à CE trimestre", pas juste du texte qui flotte.
     overflow:hidden en garde-fou : le nombre de lignes est plafonné côté JS
     (cf. RoadmapBarContent) mais ça évite tout débordement résiduel. */
  .rm-obj-stack {
    position: absolute; top: ${ROW_TOP_PAD}px;
    transform: translateX(-50%);
    width: ${CELL_WIDTH - 16}px; max-height: ${OBJ_MAX_VISIBLE * OBJ_LINE_H + 4}px;
    display: flex; flex-direction: column; gap: 1px; overflow: hidden;
    padding: 2px 4px; border-radius: 8px;
    background: rgba(255,255,255,.09); box-shadow: inset 0 0 0 1px rgba(255,255,255,.16);
    pointer-events: none;
  }
  .rm-obj-stack.rm-now-stack { background: rgba(255,255,255,.18); box-shadow: inset 0 0 0 1px rgba(255,255,255,.35); }
  .rm-obj-stack.rm-stack-done { background: rgba(255,255,255,.14); }
  .rm-obj-line { display: flex; align-items: center; gap: 3px; }
  .rm-obj-text {
    font-size: 9px; line-height: 13px; font-weight: 600; color: rgba(255,255,255,.95);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
  }
  .rm-obj-text.rm-obj-done { text-decoration: line-through; color: rgba(255,255,255,.6); }
  .rm-chk {
    display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
    width: 8px; height: 8px; border-radius: 2px; border: 1px solid rgba(255,255,255,.7);
    background: rgba(255,255,255,.1);
  }
  .rm-chk.rm-chk-done { background: #fff; border-color: #fff; color: #1e293b; }
  .rm-obj-empty { font-size: 9px; font-style: italic; color: rgba(255,255,255,.55); }
  .rm-obj-more { font-size: 8px; font-weight: 700; color: rgba(255,255,255,.75); margin-left: 11px; }
`

function StatTile({ icon, label, value, from, to, index = 0 }: { icon: ReactNode; label: string; value: string | number; from: string; to: string; index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3, ease: 'easeOut' }}
      className="ds-card !p-3 flex items-center gap-2.5"
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0"
        style={{ background: `linear-gradient(135deg, ${from}, ${to})`, boxShadow: `0 4px 12px -3px ${from}88` }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-base font-bold text-navy leading-tight truncate">{value}</p>
        <p className="text-[11px] text-subtle truncate">{label}</p>
      </div>
    </motion.div>
  )
}

type ViewKey = 'roadmap' | 'gammes'

export default function RoadmapPage() {
  const [view, setView] = useState<ViewKey>('roadmap')

  return (
    <Layout>
      <div className="page-topbar -mx-3 -mt-3 mb-3 px-3 md:-mx-5 md:-mt-5 md:mb-5 md:px-5">
        <PageTitle icon={<Milestone size={15} />} label="Roadmap" />
        <div className="ml-auto">
          <ToggleGroup value={view} onChange={setView} options={[
            { key: 'roadmap', label: 'Roadmap', icon: <Milestone size={12} /> },
            { key: 'gammes', label: 'Gérer les gammes', icon: <Settings size={12} /> },
          ]} />
        </div>
      </div>
      {view === 'roadmap' ? <RoadmapGanttView /> : <GammesSetupView />}
    </Layout>
  )
}

// ── Vue Roadmap (Gantt) ─────────────────────────────────────────
function RoadmapGanttView() {
  const { data: gammes = [] } = useGammesProduits()
  const { data: items = [] } = useRoadmapItems()
  const { data: equipesData = [] } = useEquipes()
  const equipes = useMemo(() => equipesData.filter(e => e.actif), [equipesData])
  const { isAdmin } = useAuth()
  const createItem = useCreateRoadmapItem()
  const updateItem = useUpdateRoadmapItem()
  const deleteItem = useDeleteRoadmapItem()
  const updateGamme = useUpdateGammeProduit()
  const toast = useToast()
  const dark = useDarkModeStore(s => s.dark)
  const [selected, setSelected] = useState<string | null>(null)
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; item?: RoadmapItem } | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [horizonYears, setHorizonYears] = useState(3)
  // Décalage (en années) de la fenêtre affichée par rapport à l'année en
  // cours — la taille de la fenêtre (horizonYears) reste fixe, on la fait
  // juste glisser dans le temps via Précédent/Suivant, au lieu de rester
  // figée sur "année en cours → +N".
  const [windowOffset, setWindowOffset] = useState(0)
  // Vue "par gamme" (structure produit, défaut) ou "par équipe" (transverse :
  // quels objectifs, toutes gammes confondues, portent chaque équipe et
  // quand — répond à « mon équipe X travaille sur quoi ce trimestre »).
  const [groupBy, setGroupBy] = useState<'gamme' | 'equipe'>('gamme')
  // Gammes masquées via les puces filtres de la légende (ids de gammes).
  const [hiddenGammes, setHiddenGammes] = useState<Set<number>>(new Set())
  // Symétrique, pour la légende de la vue par équipe.
  const [hiddenEquipes, setHiddenEquipes] = useState<Set<number>>(new Set())

  // Branches repliées (gammes/sous-gammes/équipes, ids de ligne du Gantt) —
  // persisté en localStorage pour que l'arbre garde son état d'une visite à
  // l'autre (pas juste le temps de la session).
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('roadmap-collapsed-branches') ?? '[]')) } catch { return new Set() }
  })
  useEffect(() => {
    try { localStorage.setItem('roadmap-collapsed-branches', JSON.stringify([...collapsedIds])) } catch { /* ignore */ }
  }, [collapsedIds])
  // Replie/déplie une ligne — pour une gamme (pas une sous-gamme, ni une
  // équipe), cascade sur toutes ses sous-gammes en même temps : "rapidement
  // tout l'arbre d'une gamme" en un seul clic, pas sous-gamme par sous-gamme.
  function toggleBranch(row: RmRow) {
    const id = String(row.id)
    const collapsing = !collapsedIds.has(id)
    const targets = [id]
    if (row.kind === 'gamme' && id.startsWith('gamme-')) {
      const numId = Number(id.slice('gamme-'.length))
      targets.push(...gammes.filter(sg => sg.parent_id === numId).map(sg => `gamme-${sg.id}`))
    }
    setCollapsedIds(prev => {
      const next = new Set(prev)
      for (const t of targets) { if (collapsing) next.add(t); else next.delete(t) }
      return next
    })
  }
  // Empreinte stable de l'état replié/déplié — force un remount complet du
  // Gantt (cf. key sur <SvarGantt>) à chaque bascule, pour être sûr que le
  // nouvel `open` de chaque tâche est bien repris (pas de re-diff partiel
  // hasardeux côté lib) et que l'overlay "Aujourd'hui" se recale sur le
  // nouveau DOM du chart (cf. dépendance de l'effet de scroll juste après).
  const collapsedFingerprint = [...collapsedIds].sort().join(',')

  // ── Drag-and-drop : déplacer un produit ou une sous-gamme vers une autre
  // gamme (cf. RmDragProps/NameCell) — réservé aux admins, désactivé dans la
  // vue par équipe (regroupement dérivé, pas l'arbre gammes réel). Les
  // handlers eux-mêmes sont définis plus bas (après activeTasks), cf. dragProps.
  const [dragged, setDragged] = useState<{ id: string; kind: RmRow['kind'] } | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  // Popover détail (clic sur une barre produit) : position d'ancrage en
  // coordonnées viewport, capturée sur le clic qui a sélectionné la tâche —
  // SVAR Gantt (version libre) n'expose pas de hauteur de ligne par tâche,
  // impossible donc de "déplier" la ligne elle-même dans le Gantt ; le détail
  // flotte par-dessus au lieu d'être intégré à la grille.
  const [anchorPos, setAnchorPos] = useState<{ x: number; y: number } | null>(null)
  const detailContainerRef = useRef<HTMLDivElement>(null)

  // L'élément affiché dans le panneau détail est re-dérivé de la liste à
  // chaque rendu pour rester frais après chaque mutation (auto-save).
  const detailItem = detailId !== null ? items.find(i => i.id === detailId) ?? null : null
  const detailGamme = detailItem ? gammes.find(g => g.id === detailItem.gamme_id) : undefined
  const detailParent = detailGamme?.parent_id != null ? gammes.find(g => g.id === detailGamme.parent_id) : undefined
  // Un clic ailleurs que dans le Gantt (qui contient aussi bien les barres que
  // le popover lui-même, rendu comme enfant du même conteneur malgré son
  // positionnement fixed) ferme le détail — cliquer une AUTRE barre reste à
  // l'intérieur de ce conteneur et se contente de changer detailId.
  useClickOutside(detailContainerRef, () => setDetailId(null), detailItem !== null)

  const { tasks, taskTypes, colorCss, stats, gammeLegend, rowHeight } = useMemo(() => {
    const tasks: RmRow[] = []
    // Couleur par type de barre, avec le kind pour générer un style différent :
    // bandeau translucide (gamme), bandeau fin (sous-gamme), pilule (produit).
    const typeColors = new Map<string, { color: string; kind: 'gamme' | 'sous' | 'item' }>()
    const gammeLegend: { id: number; nom: string; couleur: string; count: number }[] = []
    let nbGammesActives = 0
    let nbItemsAffiches = 0
    let totalObjectifs = 0
    let doneObjectifs = 0

    const parGamme = new Map<number, RoadmapItem[]>()
    for (const it of items) {
      const arr = parGamme.get(it.gamme_id)
      if (arr) arr.push(it); else parGamme.set(it.gamme_id, [it])
    }

    // Items valides (bornes de trimestres parsables) d'une gamme ou sous-gamme.
    const validItems = (gammeId: number) => (parGamme.get(gammeId) ?? [])
      .map(it => ({ it, start: getQuarterStart(it.trimestre_debut), end: getQuarterEnd(it.trimestre_fin) }))
      .filter((x): x is { it: RoadmapItem; start: Date; end: Date } => !!x.start && !!x.end)
      .sort((a, b) => a.start.getTime() - b.start.getTime())

    // Pousse un produit (barre pilule + badges d'objectifs par trimestre).
    const pushItem = (
      { it, start, end }: { it: RoadmapItem; start: Date; end: Date },
      parent: string, fallbackCouleur: string, depth: number,
    ) => {
      const type = slugify(it.nom) || `item-${it.id}`
      const itemCouleur = it.couleur ?? fallbackCouleur
      typeColors.set(type, { color: itemCouleur, kind: 'item' })

      const { markers, done: itemDone, total: itemTotal } = buildItemMarkers(it, start, end)
      totalObjectifs += itemTotal
      doneObjectifs += itemDone

      tasks.push({
        id: `item-${it.id}`, text: it.nom, type, parent, start, end,
        markers, icone: it.icone ?? 'rocket',
        kind: 'item', couleur: itemCouleur, done: itemDone, total: itemTotal, depth,
      })
      nbItemsAffiches++
    }

    // Comparaisons larges (== null) : tolère un parent_id absent (undefined)
    // tant que la migration 0048 n'a pas été jouée sur la base.
    const sousParGamme = new Map<number, GammeProduit[]>()
    for (const g of gammes) {
      if (g.parent_id == null) continue
      const arr = sousParGamme.get(g.parent_id)
      if (arr) arr.push(g); else sousParGamme.set(g.parent_id, [g])
    }

    for (const g of gammes) {
      if (g.parent_id != null) continue
      const directs = validItems(g.id)
      const sousBlocs = (sousParGamme.get(g.id) ?? [])
        .map(sg => ({ sg, valid: validItems(sg.id) }))
        .filter(b => b.valid.length > 0)
      const count = directs.length + sousBlocs.reduce((n, b) => n + b.valid.length, 0)
      if (!count) continue

      const couleur = g.couleur ?? '#94A3B8'
      // La légende liste toutes les gammes planifiées, y compris les masquées
      // (il faut pouvoir les réafficher via la puce).
      gammeLegend.push({ id: g.id, nom: g.nom, couleur, count })
      if (hiddenGammes.has(g.id)) continue

      const gammeId = `gamme-${g.id}`
      typeColors.set(gammeId, { color: couleur, kind: 'gamme' })
      nbGammesActives++

      const allDates = [...directs, ...sousBlocs.flatMap(b => b.valid)]
      const start = new Date(Math.min(...allDates.map(v => v.start.getTime())))
      const end = new Date(Math.max(...allDates.map(v => v.end.getTime())))
      tasks.push({ id: gammeId, text: g.nom, type: gammeId, parent: 0, start, end, kind: 'gamme', couleur, count, open: !collapsedIds.has(gammeId) })

      directs.forEach(v => pushItem(v, gammeId, couleur, 1))

      for (const { sg, valid } of sousBlocs) {
        const sousId = `gamme-${sg.id}`
        const sousCouleur = sg.couleur ?? couleur
        typeColors.set(sousId, { color: sousCouleur, kind: 'sous' })
        const sStart = new Date(Math.min(...valid.map(v => v.start.getTime())))
        const sEnd = new Date(Math.max(...valid.map(v => v.end.getTime())))
        tasks.push({ id: sousId, text: sg.nom, type: sousId, parent: gammeId, start: sStart, end: sEnd, kind: 'sous', couleur: sousCouleur, count: valid.length, open: !collapsedIds.has(sousId) })
        valid.forEach(v => pushItem(v, sousId, sousCouleur, 2))
      }
    }

    const taskTypes = [...typeColors.keys()].map(id => ({ id, label: id }))
    // Calculée AVANT buildColorCss : la hauteur de la barre "item" doit être
    // un pixel exact (pas un `calc(100% - Npx)`) — en position absolute dans
    // le chart, `100%` ne se résout pas forcément à la hauteur de SA ligne
    // mais à celle d'un ancêtre plus grand, d'où le débordement observé.
    const rowHeight = computeCellHeight(computeVisibleTasks(tasks, collapsedIds))
    const colorCss = buildColorCss(typeColors, rowHeight)

    return {
      tasks, taskTypes, colorCss, gammeLegend, rowHeight,
      stats: { nbGammes: nbGammesActives, nbItems: nbItemsAffiches, totalObjectifs, doneObjectifs },
    }
  }, [items, gammes, hiddenGammes, collapsedIds])

  // ── Regroupement alternatif : par équipe ────────────────────────
  // Transverse aux gammes : pour chaque équipe active, ne garde que les
  // produits où elle a au moins un objectif taggé sur au moins un trimestre,
  // et resserre la barre de chacun sur sa fenêtre réelle d'implication (pas
  // la période complète du produit) — répond à « mon équipe X travaille sur
  // quoi, et quand ».
  const { tasks: equipeTasks, taskTypes: equipeTaskTypes, colorCss: equipeColorCss, equipeLegend, rowHeight: equipeRowHeight } = useMemo(() => {
    const tasks: RmRow[] = []
    const typeColors = new Map<string, { color: string; kind: 'gamme' | 'sous' | 'item' }>()
    const equipeLegend: { id: number; nom: string; couleur: string; count: number }[] = []

    const validItems = items
      .map(it => ({ it, start: getQuarterStart(it.trimestre_debut), end: getQuarterEnd(it.trimestre_fin) }))
      .filter((x): x is { it: RoadmapItem; start: Date; end: Date } => !!x.start && !!x.end)

    for (const eq of equipes) {
      const couleur = eq.couleur ?? '#4A4CC8'
      const concerned = validItems
        .map(v => {
          const probe = buildItemMarkers(v.it, v.start, v.end, eq.id)
          const window = activeWindowFromMarkers(probe.markers)
          if (!window) return null
          const final = buildItemMarkers(v.it, window.start, window.end, eq.id)
          return { it: v.it, start: window.start, end: window.end, markers: final.markers, done: final.done, total: final.total }
        })
        .filter((x): x is { it: RoadmapItem; start: Date; end: Date; markers: BarMarker[]; done: number; total: number } => !!x)
        .sort((a, b) => a.start.getTime() - b.start.getTime())

      // La légende liste toutes les équipes actives, y compris sans objectif
      // taggé (0) et les masquées (il faut pouvoir les réafficher).
      equipeLegend.push({ id: eq.id, nom: eq.nom, couleur, count: concerned.length })
      if (!concerned.length || hiddenEquipes.has(eq.id)) continue

      const eqRowId = `equipe-${eq.id}`
      typeColors.set(eqRowId, { color: couleur, kind: 'gamme' })
      const start = new Date(Math.min(...concerned.map(v => v.start.getTime())))
      const end = new Date(Math.max(...concerned.map(v => v.end.getTime())))
      tasks.push({ id: eqRowId, text: eq.nom, type: eqRowId, parent: 0, start, end, kind: 'gamme', couleur, count: concerned.length, open: !collapsedIds.has(eqRowId) })

      concerned.forEach(({ it, start, end, markers, done, total }) => {
        const type = slugify(`${eq.nom}-${it.nom}`) || `equipe-${eq.id}-item-${it.id}`
        const itemCouleur = it.couleur ?? couleur
        typeColors.set(type, { color: itemCouleur, kind: 'item' })
        tasks.push({
          id: `equipe-${eq.id}-item-${it.id}`, text: it.nom, type, parent: eqRowId, start, end,
          markers, icone: it.icone ?? 'rocket',
          kind: 'item', couleur: itemCouleur, done, total, depth: 1,
        })
      })
    }

    const taskTypes = [...typeColors.keys()].map(id => ({ id, label: id }))
    const rowHeight = computeCellHeight(computeVisibleTasks(tasks, collapsedIds))
    return { tasks, taskTypes, colorCss: buildColorCss(typeColors, rowHeight), equipeLegend, rowHeight }
  }, [items, equipes, hiddenEquipes, collapsedIds])

  function onSelectTask(ev: { id: string | number }) {
    const idStr = String(ev.id)
    setSelected(idStr)
    // La vue par équipe préfixe les lignes produit en `equipe-{id}-item-{id}`
    // (un même produit peut apparaître sous plusieurs équipes) — les deux
    // formats ouvrent le même popover détail.
    const m = idStr.match(/^(?:equipe-\d+-)?item-(\d+)$/)
    // Clic sur une ligne gamme/sous-gamme (pas un produit) : ferme le popover
    // plutôt que de laisser affiché le détail d'un autre produit, périmé.
    setDetailId(m ? Number(m[1]) : null)
  }

  // Auto-save d'un trimestre du panneau détail (objectifs et/ou icône).
  function saveQuarter(item: RoadmapItem, qid: string, patch: Partial<Omit<TrimQuarterObjectifs, 'trimestre'>>) {
    const prev = item.trimestre_objectifs ?? []
    const next = prev.some(t => t.trimestre === qid)
      ? prev.map(t => t.trimestre === qid ? { ...t, ...patch } : t)
      : [...prev, { trimestre: qid, objectifs: [], ...patch }]
    updateItem.mutate({ id: item.id, updates: { trimestre_objectifs: next } })
  }

  async function saveItem(data: {
    gamme_id: number; nom: string; couleur: string | null; icone: string
    trimestre_debut: string; trimestre_fin: string; trimestre_objectifs: TrimQuarterObjectifs[]
  }) {
    if (modal?.mode === 'edit' && modal.item) {
      await updateItem.mutateAsync({ id: modal.item.id, updates: data })
    } else {
      await createItem.mutateAsync({ ...data, ordre: items.length })
    }
    setModal(null)
  }

  async function removeItem() {
    if (!modal?.item) return
    const ok = await confirm({
      title: 'Supprimer ce produit ?', message: `"${modal.item.nom}" sera retiré de la roadmap.`,
      confirmLabel: 'Supprimer', variant: 'danger',
    })
    if (ok) { await deleteItem.mutateAsync(modal.item.id); setModal(null) }
  }

  const ThemeWrapper = dark ? WillowDark : Willow
  const now = new Date()
  const trimestreActuel = `T${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`

  // Overlay "aujourd'hui" + trimestre courant : les markers natifs et le
  // surlignage du corps du Gantt sont réservés à l'édition PRO de la lib, on
  // les dessine donc nous-mêmes par-dessus la zone chart, synchronisés sur
  // son scroll horizontal (et sur les redimensionnements de la grille).
  const ganttBoxRef = useRef<HTMLDivElement>(null)
  const chartElRef = useRef<HTMLElement | null>(null)
  const extScrollRef = useRef<HTMLDivElement>(null)
  const [chartBox, setChartBox] = useState<{
    left: number; width: number; scrollLeft: number; scrollWidth: number
    // Position (en coordonnées du contenu scrollable, stables au scroll) et
    // largeur de la cellule d'échelle du trimestre courant (.rm-q-anchor).
    band: { left: number; width: number } | null
  } | null>(null)

  useEffect(() => {
    const box = ganttBoxRef.current
    const chart = box?.querySelector<HTMLElement>('.wx-chart')
    if (!box || !chart) return
    chartElRef.current = chart
    const update = () => {
      const chartRect = chart.getBoundingClientRect()
      const cell = chart.querySelector<HTMLElement>('.rm-q-anchor')
      // Barre externe alignée sur le scroll du chart (molette, drag...).
      const ext = extScrollRef.current
      if (ext && ext.scrollLeft !== chart.scrollLeft) ext.scrollLeft = chart.scrollLeft
      setChartBox(prev => {
        // Cellule virtualisée hors écran : on garde la dernière mesure connue,
        // les coordonnées de contenu ne bougent pas avec le scroll.
        let band = prev?.band ?? null
        if (cell) {
          const r = cell.getBoundingClientRect()
          band = { left: r.left - chartRect.left + chart.scrollLeft, width: r.width }
        }
        return {
          left: chartRect.left - box.getBoundingClientRect().left,
          width: chart.clientWidth,
          scrollLeft: chart.scrollLeft,
          scrollWidth: chart.scrollWidth,
          band,
        }
      })
    }
    update()
    chart.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(chart)
    return () => { chart.removeEventListener('scroll', update); ro.disconnect(); chartElRef.current = null }
  }, [horizonYears, windowOffset, groupBy, tasks.length, equipeTasks.length, collapsedFingerprint])
  // Fenêtre du Gantt : 3 ans par défaut (année en cours + suivantes),
  // extensible/réductible via le stepper, décalable via Précédent/Suivant
  // (windowOffset) — indépendamment des éléments (autoScale désactivé,
  // cf. <SvarGantt>, pour que la fenêtre affichée respecte strictement ça).
  const chartStart = new Date(now.getFullYear() + windowOffset, 0, 1)
  const chartEnd = new Date(now.getFullYear() + windowOffset + horizonYears - 1, 11, 31, 23, 59, 59)
  // Si on a navigué (Précédent/Suivant) hors de la période contenant
  // aujourd'hui, il ne faut PAS afficher la ligne "Aujourd'hui" avec la
  // dernière position mesurée (obsolète) — seulement quand elle est bien
  // dans la fenêtre actuellement affichée.
  const todayInWindow = now.getTime() >= chartStart.getTime() && now.getTime() <= chartEnd.getTime()

  // Bascule Gamme/Équipe : deux jeux de lignes/légende/styles construits en
  // parallèle plus haut, on choisit juste lequel alimente le rendu ici.
  const isEquipeView = groupBy === 'equipe' && equipes.length > 0
  const activeTasks = isEquipeView ? equipeTasks : tasks
  const activeTaskTypes = isEquipeView ? equipeTaskTypes : taskTypes
  const activeColorCss = isEquipeView ? equipeColorCss : colorCss
  const activeLegend = isEquipeView ? equipeLegend : gammeLegend
  const activeHidden = isEquipeView ? hiddenEquipes : hiddenGammes
  const setActiveHidden = isEquipeView ? setHiddenEquipes : setHiddenGammes
  // Pour retrouver la ligne complète (kind, text, id numérique) sous le
  // curseur pendant un drag, à partir du data-rm-row-id lu dans le DOM.
  const rowsById = useMemo(() => new Map(activeTasks.map(t => [String(t.id), t])), [activeTasks])

  function parseNumId(id: string): number | null {
    const m = id.match(/^(?:gamme|item)-(\d+)$/)
    return m ? Number(m[1]) : null
  }
  function canDrop(kind: RmRow['kind'] | undefined, target: RmRow): boolean {
    if (target.kind !== 'gamme' && target.kind !== 'sous') return false
    if (kind === 'item') return true
    if (kind === 'sous') return target.kind === 'gamme' // une sous-gamme ne va que sous une gamme de 1er niveau
    return false
  }
  function handlePointerDownRow(e: React.PointerEvent<HTMLElement>, row: RmRow) {
    if (row.kind !== 'item' && row.kind !== 'sous') return
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragged({ id: String(row.id), kind: row.kind })
  }
  function handlePointerMoveRow(e: React.PointerEvent<HTMLElement>) {
    if (!dragged) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const targetEl = el?.closest<HTMLElement>('[data-rm-row-id]')
    const targetRow = targetEl ? rowsById.get(targetEl.dataset.rmRowId!) : undefined
    setDragOverId(targetRow && canDrop(dragged.kind, targetRow) ? String(targetRow.id) : null)
  }
  async function handlePointerUpRow(e: React.PointerEvent<HTMLElement>) {
    const d = dragged
    const overId = dragOverId
    setDragged(null); setDragOverId(null)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* déjà relâché */ }
    if (!d || !overId) return
    const row = rowsById.get(overId)
    if (!row || !canDrop(d.kind, row)) return
    const targetNumId = parseNumId(overId)
    if (targetNumId == null) return
    if (d.kind === 'item') {
      const itemNumId = parseNumId(d.id)
      const it = itemNumId != null ? items.find(i => i.id === itemNumId) : undefined
      if (!it || it.gamme_id === targetNumId) return
      await updateItem.mutateAsync({ id: it.id, updates: { gamme_id: targetNumId } })
      toast(`"${it.nom}" déplacé vers "${row.text}"`)
    } else {
      const sousNumId = parseNumId(d.id)
      const sg = sousNumId != null ? gammes.find(g => g.id === sousNumId) : undefined
      if (!sg || sg.parent_id === targetNumId) return
      await updateGamme.mutateAsync({ id: sg.id, updates: { parent_id: targetNumId } })
      toast(`"${sg.nom}" déplacée vers "${row.text}"`)
    }
  }
  const dragProps: RmDragProps | undefined = (isAdmin && !isEquipeView) ? {
    draggedId: dragged?.id ?? null, dragOverId,
    onPointerDown: handlePointerDownRow, onPointerMove: handlePointerMoveRow, onPointerUp: handlePointerUpRow,
  } : undefined
  const columns = buildRoadmapColumns(isEquipeView ? 'Équipe / Produit' : 'Gamme / Produit', collapsedIds, toggleBranch, dragProps)
  // Lignes réellement visibles (branches repliées exclues) — sert à la fois
  // au calcul de la hauteur de ligne dynamique et à la hauteur du conteneur,
  // pour que replier une branche libère vraiment de la place au lieu de
  // laisser un vide de la taille de ce qui est masqué.
  const visibleTasks = useMemo(() => computeVisibleTasks(activeTasks, collapsedIds), [activeTasks, collapsedIds])
  // Même valeur que celle utilisée par buildColorCss pour CE jeu de tâches
  // (calculée dans le même useMemo, avant la CSS) — jamais recalculée à
  // partir d'un autre live state pour éviter tout écart avec la CSS déjà générée.
  const dynamicCellHeight = isEquipeView ? equipeRowHeight : rowHeight

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatTile index={0} icon={<Layers size={16} />} label="Gammes actives" value={stats.nbGammes} from="#6366f1" to="#818cf8" />
        <StatTile index={1} icon={<Boxes size={16} />} label="Produits planifiés" value={stats.nbItems} from="#4A4CC8" to="#8b7ff0" />
        <StatTile index={2} icon={<Trophy size={16} />} label="Objectifs validés" value={stats.totalObjectifs ? `${stats.doneObjectifs}/${stats.totalObjectifs}` : '—'} from="#f59e0b" to="#fde047" />
        <StatTile index={3} icon={<CalendarDays size={16} />} label="Trimestre en cours" value={trimestreActuel} from="#ea580c" to="#fb923c" />
      </div>

      <div className="flex items-center justify-between mb-3 gap-3">
        {activeLegend.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {activeLegend.map(g => {
              const hidden = activeHidden.has(g.id)
              return (
                <button
                  key={g.id}
                  onClick={() => setActiveHidden(prev => {
                    const next = new Set(prev)
                    if (next.has(g.id)) next.delete(g.id); else next.add(g.id)
                    return next
                  })}
                  title={hidden ? 'Afficher' : 'Masquer'}
                  className={cn(
                    'inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full border px-2.5 py-1 transition-all',
                    hidden ? 'opacity-45 grayscale border-border text-subtle' : 'text-navy shadow-sm',
                  )}
                  style={hidden ? undefined : { background: `${g.couleur}14`, borderColor: `${g.couleur}44` }}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: g.couleur }} />
                  {g.nom}
                  <span
                    className="tabular-nums text-[9px] font-bold px-1.5 py-px rounded-full"
                    style={hidden ? undefined : { background: `${g.couleur}22`, color: g.couleur }}
                  >{g.count}</span>
                </button>
              )
            })}
          </div>
        ) : <span />}
        <div className="flex items-center gap-2 shrink-0">
          {equipes.length > 0 && (
            <ToggleGroup value={groupBy} onChange={setGroupBy} options={[
              { key: 'gamme', label: 'Par gamme', icon: <Layers size={11} /> },
              { key: 'equipe', label: 'Par équipe', icon: <Users size={11} /> },
            ]} />
          )}
          <div className="flex items-center gap-0.5 text-xs font-semibold text-subtle bg-card border border-border rounded-lg px-1 py-0.5">
            <button onClick={() => setWindowOffset(o => o - horizonYears)}
              className="p-1 rounded hover:bg-bg hover:text-navy" title="Période précédente"><ChevronLeft size={12} /></button>
            {windowOffset !== 0 && (
              <button onClick={() => setWindowOffset(0)}
                className="px-1 rounded hover:bg-bg hover:text-navy text-[10px] uppercase tracking-wide" title="Revenir à aujourd'hui">Auj.</button>
            )}
            <button onClick={() => setWindowOffset(o => o + horizonYears)}
              className="p-1 rounded hover:bg-bg hover:text-navy" title="Période suivante"><ChevronRight size={12} /></button>
            <span className="w-px h-4 bg-border mx-0.5" />
            <button onClick={() => setHorizonYears(y => Math.max(1, y - 1))} disabled={horizonYears <= 1}
              className="p-1 rounded hover:bg-bg hover:text-navy disabled:opacity-40" title="Réduire la fenêtre d'un an"><Minus size={12} /></button>
            <span className="px-1 tabular-nums">{horizonYears} an{horizonYears > 1 ? 's' : ''}</span>
            <button onClick={() => setHorizonYears(y => Math.min(6, y + 1))} disabled={horizonYears >= 6}
              className="p-1 rounded hover:bg-bg hover:text-navy disabled:opacity-40" title="Étendre la fenêtre d'un an"><Plus size={12} /></button>
          </div>
          {isAdmin && (
            <button
              onClick={() => setModal({ mode: 'create' })}
              disabled={gammes.length === 0}
              className="ds-btn-primary flex items-center gap-1 disabled:opacity-50"
              title={gammes.length === 0 ? "Crée d'abord une gamme dans « Gérer les gammes »" : undefined}
            ><Plus size={13} /> Nouveau produit</button>
          )}
        </div>
      </div>

      {activeTasks.length === 0 ? (
        isEquipeView ? (
          <p className="text-sm text-subtle italic">
            {equipeLegend.some(e => e.count > 0)
              ? 'Toutes les équipes concernées sont masquées — réactive-les via les puces ci-dessus.'
              : "Aucune équipe n'a d'objectif taggé pour le moment — tague des équipes sur les objectifs d'un produit (panneau détail, par trimestre)."}
          </p>
        ) : items.length > 0 ? (
          <p className="text-sm text-subtle italic">Toutes les gammes sont masquées — réactive-les via les puces ci-dessus.</p>
        ) : (
          <div className="ds-card flex flex-col items-center justify-center text-center py-14 gap-3">
            <span
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-white"
              style={{ background: 'linear-gradient(135deg,#6366f1,#4A4CC8)', boxShadow: '0 8px 24px -6px #6366f199' }}
            ><Milestone size={26} /></span>
            <div>
              <p className="text-sm font-bold text-navy">La roadmap est vide</p>
              <p className="text-xs text-subtle mt-1">
                {gammes.length === 0
                  ? 'Commence par créer une gamme dans « Gérer les gammes », puis planifie tes premiers produits.'
                  : 'Planifie tes gammes et leurs jalons, trimestre par trimestre.'}
              </p>
            </div>
            {isAdmin && gammes.length > 0 && (
              <button onClick={() => setModal({ mode: 'create' })} className="ds-btn-primary flex items-center gap-1">
                <Plus size={13} /> Nouveau produit
              </button>
            )}
          </div>
        )
      ) : (
        <div ref={detailContainerRef} onClickCapture={e => setAnchorPos({ x: e.clientX, y: e.clientY })}>
          <p className="text-xs text-subtle mb-3">
            Cliquez un produit pour l'éditer — <Check size={10} className="inline text-green" /> objectif validé,
            fond ambré = trimestre complet, halo indigo = trimestre en cours, ligne rouge = aujourd'hui.
            {dragProps && <> Glissez un produit ou une sous-gamme sur une autre gamme pour le/la déplacer.</>}
          </p>
          <style>{activeColorCss + BASE_GANTT_CSS}</style>
          <div ref={ganttBoxRef} className="ds-card overflow-hidden rounded-2xl p-0 relative" style={{ height: Math.max(320, 118 + visibleTasks.length * dynamicCellHeight) }}>
            <div className="absolute inset-x-0 top-0 h-1 z-10" style={{ background: 'linear-gradient(90deg,#6366f1,#4A4CC8,#ea580c,#16a34a)' }} />
            <ThemeWrapper>
              <SvarGantt
                key={`${horizonYears}-${windowOffset}-${groupBy}-${dynamicCellHeight}-${collapsedFingerprint}`}
                tasks={activeTasks} taskTypes={activeTaskTypes} columns={columns} scales={ROADMAP_SCALES}
                start={chartStart} end={chartEnd} autoScale={false}
                highlightTime={anchorQuarterNow}
                readonly selected={selected ? [selected] : []}
                cellWidth={CELL_WIDTH} cellHeight={dynamicCellHeight} scaleHeight={38} gridWidth={450}
                taskTemplate={RoadmapBarContent} onSelectTask={onSelectTask}
              />
            </ThemeWrapper>
            {chartBox?.band && todayInWindow && (() => {
              const qs = getQuarterStart(currentQuarterId())
              const qe = getQuarterEnd(currentQuarterId())
              if (!qs || !qe) return null
              const frac = Math.min(1, Math.max(0, (Date.now() - qs.getTime()) / (qe.getTime() - qs.getTime())))
              const bandLeft = chartBox.band.left - chartBox.scrollLeft
              const lineLeft = bandLeft + frac * chartBox.band.width
              return (
                <div className="absolute inset-y-0 overflow-hidden pointer-events-none z-[6]" style={{ left: chartBox.left, width: chartBox.width }}>
                  <div className="absolute inset-y-0 bg-indigo-500/[0.07] dark:bg-indigo-400/10" style={{ left: bandLeft, width: chartBox.band.width }} />
                  <div className="absolute inset-y-0 w-[2px]" style={{ left: lineLeft, background: 'linear-gradient(180deg, #f43f5e, rgba(225,29,72,.12))' }} />
                  <span
                    className="absolute top-1.5 -translate-x-1/2 text-[8px] font-extrabold uppercase tracking-wider text-white px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{ left: lineLeft + 1, background: 'linear-gradient(135deg, #f43f5e, #e11d48)', boxShadow: '0 2px 8px rgba(225,29,72,.45)' }}
                  >Aujourd'hui</span>
                </div>
              )
            })()}
          </div>

          {chartBox && chartBox.scrollWidth > chartBox.width && (
            <div
              ref={extScrollRef}
              onScroll={e => {
                const chart = chartElRef.current
                if (chart && chart.scrollLeft !== e.currentTarget.scrollLeft) chart.scrollLeft = e.currentTarget.scrollLeft
              }}
              className="rm-hscroll mt-1.5 overflow-x-auto overflow-y-hidden"
              style={{ marginLeft: chartBox.left, width: chartBox.width }}
            >
              <div style={{ width: chartBox.scrollWidth, height: 1 }} />
            </div>
          )}

          {detailItem && (
            <ItemDetailPopover
              item={detailItem}
              gamme={detailGamme}
              parentNom={detailParent?.nom}
              isAdmin={isAdmin}
              equipes={equipes}
              anchor={anchorPos}
              onClose={() => setDetailId(null)}
              onEdit={() => setModal({ mode: 'edit', item: detailItem })}
              onSaveQuarter={(qid, patch) => saveQuarter(detailItem, qid, patch)}
            />
          )}
        </div>
      )}

      {modal && (
        <ItemModal
          mode={modal.mode} item={modal.item} gammes={gammes} isAdmin={isAdmin}
          onClose={() => setModal(null)} onSave={saveItem} onDelete={modal.mode === 'edit' ? removeItem : undefined}
        />
      )}
    </>
  )
}

function ItemModal({ mode, item, gammes, isAdmin, onClose, onSave, onDelete }: {
  mode: 'create' | 'edit'
  item?: RoadmapItem
  gammes: GammeProduit[]
  isAdmin: boolean
  onClose: () => void
  onSave: (data: {
    gamme_id: number; nom: string; couleur: string | null; icone: string
    trimestre_debut: string; trimestre_fin: string; trimestre_objectifs: TrimQuarterObjectifs[]
  }) => void
  onDelete?: () => void
}) {
  const quarters = useMemo(() => quarterOptions(), [])
  const defaultGammeId = item?.gamme_id ?? gammes[0]?.id ?? 0
  const [gammeId, setGammeId] = useState(defaultGammeId)
  const [nom, setNom] = useState(item?.nom ?? '')
  const [icone, setIcone] = useState(item?.icone ?? 'rocket')
  // Couleur explicite du produit ; null = héritée dynamiquement de la
  // gamme/sous-gamme sélectionnée (suit aussi ses changements ultérieurs).
  const [couleur, setCouleur] = useState<string | null>(item?.couleur ?? null)
  const [debut, setDebut] = useState(item?.trimestre_debut ?? quarters[4]?.id ?? quarters[0].id)
  const [fin, setFin] = useState(item?.trimestre_fin ?? item?.trimestre_debut ?? quarters[4]?.id ?? quarters[0].id)

  const startDate = getQuarterStart(debut)
  const endDate = getQuarterStart(fin)
  const canSubmit = nom.trim().length > 0 && !!gammeId && !!startDate && !!endDate && startDate.getTime() <= endDate.getTime()
  const couleurEff = couleur ?? gammes.find(g => g.id === gammeId)?.couleur ?? '#4A4CC8'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand/40 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}
        className="bg-card rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold text-navy">{mode === 'create' ? 'Nouveau produit de roadmap' : 'Modifier le produit'}</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-bg text-subtle hover:text-navy"><X size={14} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <div className="ds-label mb-1">Gamme / Sous-gamme</div>
            <select disabled={!isAdmin} value={gammeId} onChange={e => setGammeId(Number(e.target.value))} className="ds-select w-full">
              {gammes.filter(g => g.parent_id == null).map(g => (
                <optgroup key={g.id} label={g.nom}>
                  <option value={g.id}>{g.nom} (directement)</option>
                  {gammes.filter(sg => sg.parent_id === g.id).map(sg => (
                    <option key={sg.id} value={sg.id}>{sg.nom}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <div className="ds-label mb-1">Nom</div>
            <input disabled={!isAdmin} value={nom} onChange={e => setNom(e.target.value)} className="ds-input w-full" placeholder="Ex : Lancement V3" />
          </div>
          <div className="flex items-center gap-3">
            <input type="color" disabled={!isAdmin} value={couleurEff} onChange={e => setCouleur(e.target.value)}
              className="w-8 h-8 rounded shrink-0 cursor-pointer disabled:cursor-default" />
            <span className="text-xs text-subtle flex-1">
              {couleur ? 'Couleur personnalisée' : 'Couleur héritée de la gamme / sous-gamme'}
            </span>
            {couleur && isAdmin && (
              <button onClick={() => setCouleur(null)} className="text-[11px] font-semibold text-subtle hover:text-navy underline shrink-0">
                Hériter
              </button>
            )}
          </div>
          <div>
            <div className="ds-label mb-1">Icône</div>
            <div className="flex gap-1.5 flex-wrap">
              {ICON_CHOICES.map(({ id, Icon }) => (
                <button
                  key={id} disabled={!isAdmin} onClick={() => setIcone(id)}
                  className={cn('w-8 h-8 rounded-lg flex items-center justify-center border transition-all',
                    icone === id ? 'text-white border-transparent shadow-md scale-110' : 'border-border text-subtle hover:text-navy hover:border-navy/30')}
                  style={icone === id ? { background: `linear-gradient(135deg, ${mix(couleurEff, '#ffffff', 0.25)}, ${couleurEff})` } : undefined}
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="ds-label mb-1">Début</div>
              <select disabled={!isAdmin} value={debut} onChange={e => setDebut(e.target.value)} className="ds-select w-full">
                {quarters.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}
              </select>
            </div>
            <div>
              <div className="ds-label mb-1">Fin</div>
              <select disabled={!isAdmin} value={fin} onChange={e => setFin(e.target.value)} className="ds-select w-full">
                {quarters.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}
              </select>
            </div>
          </div>
          {!canSubmit && nom.trim().length > 0 && (
            <p className="text-[11px] text-red">La fin doit être postérieure ou égale au début.</p>
          )}
          <p className="text-[11px] text-subtle italic">
            Les objectifs par trimestre se gèrent depuis le panneau détail (clic sur la barre dans la roadmap).
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center justify-between mt-5">
            {mode === 'edit' && onDelete ? (
              <button onClick={onDelete} className="text-xs font-semibold text-red hover:underline flex items-center gap-1"><Trash2 size={13} /> Supprimer</button>
            ) : <span />}
            <button
              disabled={!canSubmit}
              onClick={() => onSave({
                gamme_id: gammeId, nom: nom.trim(), couleur, icone, trimestre_debut: debut, trimestre_fin: fin,
                // Conservés tels quels : les trimestres hors nouvelle période restent
                // stockés (invisibles) et réapparaissent si la période est ré-étendue.
                trimestre_objectifs: item?.trimestre_objectifs ?? [],
              })}
              className="ds-btn-primary disabled:opacity-50"
            >{mode === 'create' ? 'Créer' : 'Enregistrer'}</button>
          </div>
        )}
      </motion.div>
    </div>
  )
}

// ── Panneau détail : un élément déplié, une carte par trimestre ──
// Largeur cible du popover (clampée à la fenêtre sur petit écran) et marge
// minimale gardée avec les bords du viewport.
const POPOVER_WIDTH = 620
const POPOVER_MARGIN = 12

// Calcule une position fixed (viewport) à partir du point de clic ayant
// sélectionné la barre — bascule au-dessus du point si la place manque en
// dessous, et clampe horizontalement pour ne jamais déborder de l'écran.
function popoverPlacement(anchor: { x: number; y: number } | null): React.CSSProperties {
  if (!anchor) return { display: 'none' }
  const vw = window.innerWidth, vh = window.innerHeight
  const width = Math.min(POPOVER_WIDTH, vw - POPOVER_MARGIN * 2)
  let left = anchor.x - width / 2
  left = Math.min(Math.max(left, POPOVER_MARGIN), vw - width - POPOVER_MARGIN)
  const spaceBelow = vh - anchor.y - POPOVER_MARGIN
  const spaceAbove = anchor.y - POPOVER_MARGIN
  const openUp = spaceBelow < 260 && spaceAbove > spaceBelow
  return {
    position: 'fixed', left, width, maxHeight: Math.max(180, openUp ? spaceAbove : spaceBelow),
    ...(openUp ? { bottom: vh - anchor.y + 12 } : { top: anchor.y + 12 }),
  }
}

// ── Popover détail : flotte au-dessus du Gantt, ancré sur le clic ────────
// Remplace l'ancien panneau en flux (sous le Gantt) — SVAR Gantt n'autorise
// pas de hauteur par ligne, donc "déplier" la barre elle-même dans la grille
// n'est pas faisable ; le détail se superpose à la place, sans décaler les
// autres lignes. La fermeture (clic ailleurs, autre produit) est gérée par le
// useClickOutside du conteneur parent (RoadmapGanttView), pas ici.
function ItemDetailPopover({ item, gamme, parentNom, isAdmin, equipes, anchor, onClose, onEdit, onSaveQuarter }: {
  item: RoadmapItem
  gamme?: GammeProduit
  parentNom?: string
  isAdmin: boolean
  equipes: Equipe[]
  anchor: { x: number; y: number } | null
  onClose: () => void
  onEdit: () => void
  onSaveQuarter: (qid: string, patch: Partial<Omit<TrimQuarterObjectifs, 'trimestre'>>) => void
}) {
  const couleur = item.couleur ?? gamme?.couleur ?? '#4A4CC8'
  const ItemIcon = ICON_MAP.get(item.icone ?? '') ?? Rocket
  const quarterIds = quartersBetween(item.trimestre_debut, item.trimestre_fin)
  const nowQ = currentQuarterId()

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.15, ease: 'easeOut' }}
      className="z-40 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col"
      style={popoverPlacement(anchor)}
    >
      <div className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ background: `linear-gradient(120deg, ${mix(couleur, '#000000', 0.15)}, ${mix(couleur, '#000000', 0.45)})` }}>
        <span className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0 shadow-inner">
          <ItemIcon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate">{item.nom}</p>
          <p className="text-[11px] text-white/75 truncate">
            {(parentNom ? `${parentNom} › ` : '') + (gamme?.nom ?? 'Gamme inconnue')} · {formatQuarterLabel(item.trimestre_debut)} → {formatQuarterLabel(item.trimestre_fin)}
          </p>
        </div>
        {isAdmin && (
          <button onClick={onEdit}
            className="flex items-center gap-1 text-[11px] font-bold text-white/90 hover:text-white bg-white/15 hover:bg-white/25 rounded-lg px-2.5 py-1.5 transition-colors shrink-0">
            <Pencil size={11} /> Modifier
          </button>
        )}
        <button onClick={onClose} className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 shrink-0"><X size={14} /></button>
      </div>
      <div className="p-4 grid gap-3 overflow-y-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
        {quarterIds.map(qid => (
          <QuarterCard
            key={qid} qid={qid} couleur={couleur} isAdmin={isAdmin} isCurrent={qid === nowQ} equipes={equipes}
            data={item.trimestre_objectifs?.find(t => t.trimestre === qid)}
            onSave={patch => onSaveQuarter(qid, patch)}
          />
        ))}
      </div>
    </motion.div>
  )
}

function QuarterCard({ qid, data, couleur, isAdmin, isCurrent, equipes, onSave }: {
  qid: string
  data?: TrimQuarterObjectifs
  couleur: string
  isAdmin: boolean
  isCurrent: boolean
  equipes: Equipe[]
  onSave: (patch: Partial<Omit<TrimQuarterObjectifs, 'trimestre'>>) => void
}) {
  const [showIcons, setShowIcons] = useState(false)
  const [newText, setNewText] = useState('')
  const objectifs = data?.objectifs ?? []
  const done = objectifs.filter(o => o.checked).length
  const pct = objectifs.length ? Math.round(done / objectifs.length * 100) : 0
  const complete = objectifs.length > 0 && done === objectifs.length
  const QIcon = data?.icone ? ICON_MAP.get(data.icone) : undefined

  function addObjectif() {
    if (!newText.trim()) return
    onSave({ objectifs: [...objectifs, { id: crypto.randomUUID(), texte: newText.trim(), checked: false }] })
    setNewText('')
  }

  return (
    <div
      className={cn('rounded-xl p-3 bg-bg/60 border transition-shadow', isCurrent ? 'border-2 shadow-md' : 'border-border')}
      style={isCurrent ? { borderColor: couleur } : undefined}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={isAdmin ? () => setShowIcons(v => !v) : undefined}
            title={isAdmin ? 'Choisir une icône pour ce trimestre' : undefined}
            className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-white shadow shrink-0', isAdmin && 'hover:scale-110 transition-transform')}
            style={{ background: `linear-gradient(135deg, ${mix(couleur, '#ffffff', 0.25)}, ${couleur})` }}
          >
            {QIcon ? <QIcon size={13} /> : <CalendarDays size={13} />}
          </button>
          <span className="text-xs font-bold text-navy">{formatQuarterLabel(qid)}</span>
          {isCurrent && (
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white shrink-0" style={{ background: couleur }}>
              en cours
            </span>
          )}
        </div>
        {complete ? (
          <span className="text-amber-500 shrink-0" style={{ filter: 'drop-shadow(0 0 4px rgba(251,191,36,.7))' }}>
            <Star size={15} fill="currentColor" />
          </span>
        ) : objectifs.length > 0 && (
          <span className="text-[11px] font-bold tabular-nums text-subtle shrink-0">{done}/{objectifs.length}</span>
        )}
      </div>

      {showIcons && isAdmin && (
        <div className="flex gap-1 mb-2 flex-wrap p-1.5 rounded-lg bg-card border border-border">
          {ICON_CHOICES.map(({ id, Icon }) => (
            <button key={id} onClick={() => { onSave({ icone: id }); setShowIcons(false) }}
              className={cn('w-6 h-6 rounded flex items-center justify-center transition-colors',
                data?.icone === id ? 'text-white' : 'text-subtle hover:text-navy hover:bg-bg')}
              style={data?.icone === id ? { background: couleur } : undefined}>
              <Icon size={12} />
            </button>
          ))}
          <button onClick={() => { onSave({ icone: null }); setShowIcons(false) }}
            title="Aucune icône" className="w-6 h-6 rounded flex items-center justify-center text-subtle hover:text-red hover:bg-red/10">
            <X size={11} />
          </button>
        </div>
      )}

      {objectifs.length > 0 && (
        <div className="h-1 rounded-full bg-border overflow-hidden mb-2">
          <div className="h-full rounded-full transition-all" style={{
            width: `${pct}%`,
            background: complete ? 'linear-gradient(90deg,#fde047,#f59e0b)' : `linear-gradient(90deg, ${mix(couleur, '#ffffff', 0.3)}, ${couleur})`,
          }} />
        </div>
      )}

      <div className="space-y-1">
        {objectifs.length === 0 && <p className="text-[11px] italic text-subtle/60">Aucun objectif pour ce trimestre.</p>}
        {objectifs.map(o => (
          <ObjectifRow
            key={o.id} obj={o} isAdmin={isAdmin} equipes={equipes}
            onToggle={() => onSave({ objectifs: objectifs.map(x => x.id === o.id ? { ...x, checked: !x.checked } : x) })}
            onDelete={() => onSave({ objectifs: objectifs.filter(x => x.id !== o.id) })}
            onCommitText={texte => onSave({ objectifs: objectifs.map(x => x.id === o.id ? { ...x, texte } : x) })}
            onUpdateEquipes={ids => onSave({ objectifs: objectifs.map(x => x.id === o.id ? { ...x, equipe_ids: ids } : x) })}
          />
        ))}
      </div>

      {isAdmin && (
        <div className="flex items-center gap-1.5 mt-2">
          <input
            value={newText} onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addObjectif()}
            placeholder="Nouvel objectif…" className="ds-input text-xs py-1 flex-1"
          />
          <button onClick={addObjectif} disabled={!newText.trim()}
            className="p-1.5 rounded-lg text-white shadow disabled:opacity-40 shrink-0" style={{ background: couleur }}>
            <Plus size={12} />
          </button>
        </div>
      )}
    </div>
  )
}

// Ligne d'objectif : le texte est bufferisé localement et persisté au blur
// (ou Entrée) pour éviter une mutation Supabase à chaque frappe.
function ObjectifRow({ obj, isAdmin, equipes, onToggle, onDelete, onCommitText, onUpdateEquipes }: {
  obj: TrimCheckItem
  isAdmin: boolean
  equipes: Equipe[]
  onToggle: () => void
  onDelete: () => void
  onCommitText: (texte: string) => void
  onUpdateEquipes: (equipeIds: number[]) => void
}) {
  const [texte, setTexte] = useState(obj.texte)
  useEffect(() => { setTexte(obj.texte) }, [obj.texte])
  const taggedEquipes = equipes.filter(e => obj.equipe_ids?.includes(e.id))

  return (
    <div className="flex items-center gap-2 group">
      <button
        onClick={isAdmin ? onToggle : undefined}
        className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
          obj.checked ? 'bg-green border-green' : 'border-border', isAdmin && !obj.checked && 'hover:border-navy/40')}
      >
        {obj.checked && <Check size={10} className="text-white" />}
      </button>
      <input
        value={texte} disabled={!isAdmin}
        onChange={e => setTexte(e.target.value)}
        onBlur={() => texte.trim() !== obj.texte && onCommitText(texte.trim())}
        onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className={cn('flex-1 bg-transparent text-xs outline-none text-navy min-w-0', obj.checked && 'line-through text-subtle')}
      />
      {isAdmin ? (
        equipes.length > 0 && <EquipeTagPicker equipes={equipes} selectedIds={obj.equipe_ids ?? []} onChange={onUpdateEquipes} />
      ) : taggedEquipes.length > 0 && (
        <span className="flex items-center -space-x-1 shrink-0">
          {taggedEquipes.map(e => (
            <span key={e.id} className="w-2.5 h-2.5 rounded-full border border-card" style={{ background: e.couleur ?? '#4A4CC8' }} title={e.nom} />
          ))}
        </span>
      )}
      {isAdmin && (
        <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red/10 text-subtle hover:text-red shrink-0 transition-opacity">
          <X size={10} />
        </button>
      )}
    </div>
  )
}

// Popover de tag multi-select — affiche les pastilles des équipes déjà
// taggées sur l'objectif (ou une icône neutre si aucune), clic pour ouvrir
// la liste à cocher. Compact : pensé pour tenir dans une ligne d'objectif.
function EquipeTagPicker({ equipes, selectedIds, onChange }: {
  equipes: Equipe[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)
  const selected = equipes.filter(e => selectedIds.includes(e.id))

  function toggle(id: number) {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id])
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button onClick={() => setOpen(v => !v)} title="Équipes sur cet objectif"
        className={cn('flex items-center rounded-full transition-colors',
          selected.length ? '-space-x-1' : 'p-0.5 text-subtle/40 hover:text-subtle')}>
        {selected.length > 0
          ? selected.slice(0, 3).map(e => (
              <span key={e.id} className="w-2.5 h-2.5 rounded-full border border-card" style={{ background: e.couleur ?? '#4A4CC8' }} />
            ))
          : <Users size={11} />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-border bg-card shadow-lg p-1.5">
          {equipes.map(e => {
            const sel = selectedIds.includes(e.id)
            return (
              <button key={e.id} onClick={() => toggle(e.id)}
                className={cn('w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-[11px] font-medium text-left transition-colors',
                  sel ? 'bg-bg text-navy' : 'text-subtle hover:bg-bg hover:text-navy')}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.couleur ?? '#4A4CC8' }} />
                <span className="flex-1 truncate">{e.nom}</span>
                {sel && <Check size={10} className="shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Vue "Gérer les gammes" (setup propre à la roadmap) ──────────
function GammesSetupView() {
  const { isAdmin } = useAuth()
  const { data: gammes = [] } = useGammesProduits()
  const { data: items = [] } = useRoadmapItems()
  const createGamme = useCreateGammeProduit()
  const updateGamme = useUpdateGammeProduit()
  const deleteGamme = useDeleteGammeProduit()
  const [nom, setNom] = useState('')
  // Brouillons de noms de sous-gammes, un par gamme parente.
  const [sousNoms, setSousNoms] = useState<Record<number, string>>({})

  const topGammes = gammes.filter(g => g.parent_id == null)
  const sousDe = (parentId: number) => gammes.filter(g => g.parent_id === parentId)
  const nbItems = (gammeId: number) => items.filter(it => it.gamme_id === gammeId).length

  async function addGamme() {
    if (!nom.trim()) return
    const ordre = gammes.length ? Math.max(...gammes.map(g => g.ordre)) + 1 : 0
    await createGamme.mutateAsync({ nom: nom.trim(), couleur: BRAND_COLORS[topGammes.length % BRAND_COLORS.length], ordre, parent_id: null })
    setNom('')
  }

  async function addSousGamme(parent: GammeProduit) {
    const sNom = (sousNoms[parent.id] ?? '').trim()
    if (!sNom) return
    const ordre = gammes.length ? Math.max(...gammes.map(g => g.ordre)) + 1 : 0
    // Une sous-gamme hérite de la couleur de sa gamme par défaut (modifiable).
    await createGamme.mutateAsync({ nom: sNom, couleur: parent.couleur, ordre, parent_id: parent.id })
    setSousNoms(prev => ({ ...prev, [parent.id]: '' }))
  }

  async function removeGamme(g: GammeProduit) {
    const sous = g.parent_id == null ? sousDe(g.id) : []
    const ok = await confirm({
      title: g.parent_id == null ? 'Supprimer cette gamme ?' : 'Supprimer cette sous-gamme ?',
      message: sous.length
        ? `"${g.nom}", ses ${sous.length} sous-gamme(s) et tous leurs produits de roadmap seront supprimés définitivement.`
        : `"${g.nom}" et tous ses produits de roadmap seront supprimés définitivement.`,
      confirmLabel: 'Supprimer', variant: 'danger',
    })
    if (ok) deleteGamme.mutate(g.id)
  }

  // Fonction de rendu (pas un composant imbriqué : un composant défini ici
  // serait remonté à chaque rendu et ferait perdre le focus des inputs).
  function renderGammeRow(g: GammeProduit, sous?: boolean) {
    return (
      <div key={g.id} className={cn('flex items-center gap-2 p-2 rounded-lg bg-bg', sous && 'ml-7')}>
        <input type="color" value={g.couleur ?? '#4A4CC8'} disabled={!isAdmin}
          onChange={e => updateGamme.mutate({ id: g.id, updates: { couleur: e.target.value } })}
          className={cn('rounded shrink-0 cursor-pointer disabled:cursor-default', sous ? 'w-5 h-5' : 'w-6 h-6')} />
        <input value={g.nom} disabled={!isAdmin}
          onChange={e => updateGamme.mutate({ id: g.id, updates: { nom: e.target.value } })}
          className={cn('flex-1 bg-transparent outline-none text-navy disabled:text-subtle', sous ? 'text-xs font-medium' : 'text-sm font-semibold')} />
        <span className="text-[11px] text-subtle shrink-0">{nbItems(g.id)} produit(s)</span>
        {isAdmin && (
          <button onClick={() => removeGamme(g)} className="p-1 rounded hover:bg-red/10 text-subtle hover:text-red shrink-0">
            <Trash2 size={13} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="ds-card">
        <div className="ds-card-title mb-2">Gammes de la roadmap</div>
        {!isAdmin && (
          <p className="text-xs text-subtle italic mb-2">Lecture seule — la création/suppression des gammes est réservée aux administrateurs.</p>
        )}
        {isAdmin && (
          <div className="flex items-end gap-2 mb-3">
            <div className="flex-1">
              <div className="ds-label mb-1">Nouvelle gamme</div>
              <input value={nom} onChange={e => setNom(e.target.value)} className="ds-input"
                placeholder="Ex : Profileuses" onKeyDown={e => e.key === 'Enter' && addGamme()} />
            </div>
            <button onClick={addGamme} disabled={!nom.trim() || createGamme.isPending}
              className="ds-btn-primary flex items-center gap-1"><Plus size={13} /> Ajouter</button>
          </div>
        )}
        {topGammes.length === 0 ? (
          <p className="text-xs text-subtle italic">Aucune gamme définie.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {topGammes.map(g => (
              <div key={g.id} className="flex flex-col gap-1.5">
                {renderGammeRow(g)}
                {sousDe(g.id).map(sg => renderGammeRow(sg, true))}
                {isAdmin && (
                  <div className="flex items-center gap-1.5 ml-7">
                    <input
                      value={sousNoms[g.id] ?? ''}
                      onChange={e => setSousNoms(prev => ({ ...prev, [g.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addSousGamme(g)}
                      placeholder="Nouvelle sous-gamme…" className="ds-input text-xs py-1 flex-1"
                    />
                    <button onClick={() => addSousGamme(g)} disabled={!(sousNoms[g.id] ?? '').trim() || createGamme.isPending}
                      className="p-1.5 rounded-lg text-white shadow disabled:opacity-40 shrink-0" style={{ background: g.couleur ?? '#4A4CC8' }}>
                      <Plus size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
