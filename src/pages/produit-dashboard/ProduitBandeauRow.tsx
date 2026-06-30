import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useFinanceConfig } from '@/hooks/useFinanceConfig'
import { useTachesByProduit } from '@/hooks/useTaches'
import type { Produit } from '@/hooks/useProduits'
import type { Sprint } from '@/types'
import {
  computeProduitMetrics,
  scopedMetrics,
  getQuarterEnd,
} from '@/utils/produitMetrics'
import type { Rag, MultiScope } from '@/utils/produitMetrics'

export type BandeauScope = 'global' | 'trim' | 'sprint'

// ── Helpers ──────────────────────────────────────────────────────
function getISOWeek(date: Date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const w1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7)
}
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('fr-FR') }
function barColor(pct: number) { return pct >= 75 ? 'bg-emerald-400' : pct >= 40 ? 'bg-amber-400' : 'bg-rose-400' }

const RAG_CFG: Record<string, { bg: string; text: string; border: string }> = {
  green: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  amber: { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'   },
  red:   { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200'    },
}
const TRAJ_CFG: Record<string, { bg: string; text: string; border: string; label: string }> = {
  green: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'En cours'  },
  amber: { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   label: 'À risque'  },
  red:   { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    label: 'En retard' },
}

function RagIcon({ rag, size = 14 }: { rag: Rag; size?: number }) {
  if (rag === 'green') return <CheckCircle  size={size} />
  if (rag === 'amber') return <AlertTriangle size={size} />
  if (rag === 'red')   return <XCircle      size={size} />
  return null
}

function RagCell({ label, rag, sub, tooltip }: { label: string; rag: Rag; sub?: string; tooltip?: string }) {
  const cfg = rag ? RAG_CFG[rag] : null
  return (
    <Tooltip content={tooltip}>
      <div className={cn(
        'flex flex-col rounded-xl border overflow-hidden min-w-[80px] flex-1 cursor-help',
        cfg ? cn(cfg.bg, cfg.border) : 'bg-slate-50 border-slate-200'
      )}>
        <div className={cn('text-[9px] font-bold uppercase tracking-wider px-2 py-1.5 text-center border-b',
          cfg ? cn(cfg.text, cfg.border) : 'text-slate-400 border-slate-200')}>
          {label}
        </div>
        <div className="flex items-center justify-center py-2.5">
          {cfg
            ? <span className={cfg.text}><RagIcon rag={rag} size={18} /></span>
            : <span className="text-slate-300 text-sm">—</span>}
        </div>
        {sub && (
          <div className={cn('text-[8px] text-center px-1 py-0.5 border-t leading-tight font-medium',
            cfg ? cn(cfg.text, cfg.border, 'opacity-70') : 'text-slate-400 border-slate-200')}>
            {sub}
          </div>
        )}
      </div>
    </Tooltip>
  )
}

// ── Composant ────────────────────────────────────────────────────
export function ProduitBandeauRow({
  produit,
  scope,
  forceSprintNum,
  extraLeft,
  extraRight,
}: {
  produit: Produit
  scope: BandeauScope
  forceSprintNum?: string | null
  extraLeft?: ReactNode
  extraRight?: ReactNode
}) {
  const { data: taches = [] } = useTachesByProduit(produit.id)
  const { data: finConfig }   = useFinanceConfig()
  const today   = useMemo(() => new Date(), [])
  const racines = useMemo(() => taches.filter(t => !t.parent_id), [taches])

  // Sprints (requête directe pour ne pas dépendre de ProduitContext)
  const { data: allSprints = [] } = useQuery({
    queryKey: ['sprints', produit.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sprints').select('*').eq('produit_id', produit.id).order('numero')
      if (error) throw error
      return (data ?? []) as Sprint[]
    },
    staleTime: 30_000,
  })

  const multiScope: MultiScope = scope === 'sprint' ? 'trim' : scope
  const sm = useMemo(() => computeProduitMetrics(produit, racines, finConfig, today), [produit, racines, finConfig, today])
  const sd = useMemo(() => scopedMetrics(sm, multiScope), [sm, multiScope])

  // ── Sprint metrics ────────────────────────────────────────────
  const sortedSprints    = useMemo(() => [...allSprints].sort((a, b) => Number(a.numero) - Number(b.numero)), [allSprints])
  const sprintActif        = sortedSprints.find(s => s.statut === 'en_cours') ?? null
  const lastClosed         = [...sortedSprints].reverse().find(s => s.statut === 'cloture') ?? null
  const effectiveSprintObj = forceSprintNum != null
    ? (sortedSprints.find(s => s.numero === forceSprintNum) ?? sprintActif ?? lastClosed)
    : (sprintActif ?? lastClosed)
  const effectiveSprint  = effectiveSprintObj?.numero ?? null   // string | null

  const racinesSprint = useMemo(() =>
    effectiveSprint !== null ? racines.filter(t => t.sprint === effectiveSprint) : [],
    [racines, effectiveSprint]
  )

  const totalUSSprint    = racinesSprint.length
  const faitUSSprint     = racinesSprint.filter(t => t.statut === 'Fait').length
  const bloqueSprint     = racinesSprint.filter(t => t.statut === 'Bloqué').length
  const backlogPctSprint = totalUSSprint > 0 ? Math.round(faitUSSprint / totalUSSprint * 100) : 0
  const effortTotalSprint = racinesSprint.reduce((s, t) => s + (t.effort_j ?? 0), 0)
  const effortFaitSprint  = racinesSprint.filter(t => t.statut === 'Fait').reduce((s, t) => s + (t.effort_j ?? 0), 0)
  const effortPctSprint   = effortTotalSprint > 0 ? Math.round(effortFaitSprint / effortTotalSprint * 100) : 0
  const sprintIsCloture   = effectiveSprintObj?.statut === 'cloture'

  const ragASprint: Rag = totalUSSprint > 0
    ? (backlogPctSprint >= 75 ? 'green' : backlogPctSprint >= 40 ? 'amber' : 'red')
    : null
  const ragBSprint: Rag = effortTotalSprint > 0
    ? (() => { const d = effortPctSprint - backlogPctSprint; return d <= 10 ? 'green' : d <= 20 ? 'amber' : 'red' })()
    : null
  const ragDSprint: Rag = totalUSSprint > 0
    ? (sprintIsCloture
        ? (backlogPctSprint >= 100 ? 'green' : backlogPctSprint >= 80 ? 'amber' : 'red')
        : (backlogPctSprint >= 75 ? 'green' : backlogPctSprint >= 40 ? 'amber' : 'red'))
    : null
  const bloqueBlSprint = bloqueSprint + sm.openRisques
  const ragBlSprint: Rag = bloqueBlSprint === 0 ? 'green' : bloqueBlSprint <= 2 ? 'amber' : 'red'

  // ── Finance helpers ───────────────────────────────────────────
  const joursTotaux = finConfig?.jours_par_trim ?? 65
  const tjmMoyen = (finConfig?.equipe_tjms?.length ?? 0) > 0
    ? Math.round(finConfig!.equipe_tjms.reduce((s, e) => s + e.tjm, 0) / finConfig!.equipe_tjms.length)
    : 500

  const currentTrim = useMemo(() =>
    [...(produit.objectifs_trimestriels ?? [])].reverse().find(t => !!t.lance && !t.pause && !t.cloture) ?? null,
    [produit.objectifs_trimestriels]
  )
  const trimEnd = currentTrim ? getQuarterEnd(currentTrim.trimestre) : null

  const racinesTrim = useMemo(() => {
    const ids = new Set<string>(currentTrim?.sprints_ids ?? [])
    return racines.filter(t => t.sprint && ids.has(t.sprint))
  }, [racines, currentTrim])

  const effortFaitTrim    = racinesTrim.filter(t => t.statut === 'Fait').reduce((s, t) => s + (t.effort_j ?? 0), 0)
  const trimBudgetEtp     = (currentTrim?.budget_etp ?? 0) * tjmMoyen * joursTotaux
  const trimRealiseEtpEur = effortFaitTrim * tjmMoyen

  const effortFaitGlobal = racines.filter(t => t.statut === 'Fait').reduce((s, t) => s + (t.effort_j ?? 0), 0)
  const realiseEtpEur    = effortFaitGlobal * tjmMoyen
  const totalEtp         = (produit.objectifs_trimestriels ?? []).reduce((s, t) => s + (t.budget_etp ?? 0), 0)
  const totalInvest      = (produit.objectifs_trimestriels ?? []).reduce((s, t) => s + (t.budget_invest ?? 0), 0)
  const totalAchats      = (produit.objectifs_trimestriels ?? []).reduce((s, t) => s + (t.budget_achats ?? 0), 0)
  const globalBudgetNet  = totalEtp * tjmMoyen * joursTotaux - totalInvest - totalAchats

  const bloqueGlobal = sm.bloqueUS
  const bloqueTrimSc = sm.bloqueTrim

  // ── Scope-aware display values ────────────────────────────────
  const isSprint = scope === 'sprint'
  const isGlobal = scope === 'global'

  const ragA  = isSprint ? ragASprint  : sd.ragA
  const ragB  = isSprint ? ragBSprint  : sd.ragB
  const ragD  = isSprint ? ragDSprint  : sd.ragD
  const ragBl = isSprint ? ragBlSprint : sd.ragBl
  const trajectoire: Rag = ragD ?? ragA

  const backlogPctDisp = isSprint ? backlogPctSprint : (isGlobal ? sm.backlogPct : sm.backlogPctTrim)
  const totalUSDisp    = isSprint ? totalUSSprint    : (isGlobal ? sm.totalUS    : sm.totalUSTrim)
  const faitUSDisp     = isSprint ? faitUSSprint     : (isGlobal ? sm.faitUS     : sm.faitUSTrim)
  const bloqueScope    = isSprint ? bloqueSprint     : (isGlobal ? bloqueGlobal  : bloqueTrimSc)

  // Sub-labels
  const subAvancement = isSprint
    ? (totalUSSprint > 0 ? `${backlogPctSprint}% terminées` : undefined)
    : isGlobal
      ? (sm.totalUS > 0     ? `${sm.backlogPct}% fait · curseur ${sm.globalCursorPct ?? '?'}%` : undefined)
      : (sm.totalUSTrim > 0 ? `${sm.backlogPctTrim}% fait · curseur ${sm.cursorPct ?? '?'}%`   : undefined)

  const subBudget = isSprint
    ? (effortTotalSprint > 0 ? `${effortFaitSprint}j / ${effortTotalSprint}j estimés` : undefined)
    : isGlobal
      ? (globalBudgetNet > 0
          ? `${Math.round(realiseEtpEur / 1000)}k€ / ${Math.round(globalBudgetNet / 1000)}k€`
          : undefined)
      : (trimBudgetEtp > 0
          ? `${Math.round(trimRealiseEtpEur / 1000)}k€ / ${Math.round(trimBudgetEtp / 1000)}k€ · j${sm.joursEcoules}/${joursTotaux}`
          : undefined)

  const subDelai = isSprint
    ? (totalUSSprint > 0
        ? (sprintIsCloture ? `Clôturé · ${backlogPctSprint}%` : `${backlogPctSprint}% terminées`)
        : undefined)
    : (() => {
        if (isGlobal) {
          if (sm.projectedPct !== null && produit.date_lancement_cible)
            return `proj. ${sm.projectedPct}% · cible ${fmtDate(produit.date_lancement_cible)}`
          if (produit.date_lancement_cible) return fmtDate(produit.date_lancement_cible)
        } else {
          if (sm.projectedPctTrim !== null && trimEnd)
            return `proj. ${sm.projectedPctTrim}% · fin ${fmtDate(trimEnd.toISOString())}`
          if (trimEnd) return `Fin trim : ${fmtDate(trimEnd.toISOString())}`
        }
        return undefined
      })()

  const subBlocages = `${bloqueScope} bloquée${bloqueScope !== 1 ? 's' : ''} · ${sm.openRisques} risque${sm.openRisques !== 1 ? 's' : ''}`

  const cibleDate = isSprint ? null
    : isGlobal ? produit.date_lancement_cible
    : trimEnd?.toISOString() ?? null

  // Tooltips
  const tipA = isSprint
    ? (totalUSSprint > 0 ? `${faitUSSprint}/${totalUSSprint} US · ${backlogPctSprint}% terminées\n${bloqueSprint} bloquée${bloqueSprint !== 1 ? 's' : ''}` : undefined)
    : sd.tipA
  const tipB = isSprint
    ? (effortTotalSprint > 0 ? `Estimé : ${effortTotalSprint} j\nRéalisé : ${effortFaitSprint} j (${effortPctSprint}% effort)\nDelta vs avancement : ${effortPctSprint - backlogPctSprint >= 0 ? '+' : ''}${effortPctSprint - backlogPctSprint} pts` : undefined)
    : sd.tipB
  const tipD = isSprint
    ? (totalUSSprint > 0 ? `${faitUSSprint}/${totalUSSprint} US · ${backlogPctSprint}% terminées${sprintIsCloture ? '\nSprint clôturé' : ''}` : undefined)
    : sd.tipD
  const tipBl = `${bloqueScope} tâche${bloqueScope !== 1 ? 's' : ''} bloquée${bloqueScope !== 1 ? 's' : ''}\n${sm.openRisques} risque${sm.openRisques !== 1 ? 's' : ''} ouvert${sm.openRisques !== 1 ? 's' : ''}`
  const tipTraj = isSprint ? tipD : sd.tipTraj

  const livraison = isSprint ? '—'
    : sm.estimatedDeliveryDate ? fmtDate(sm.estimatedDeliveryDate.toISOString())
    : cibleDate ? fmtDate(cibleDate) : '—'

  const dateMAJ = today.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const semaine  = getISOWeek(today)

  return (
    <div className="grid grid-cols-[1fr_auto_auto]">

      {/* Gauche : infos produit */}
      <div className="flex items-center gap-6 px-5 py-3 border-r border-border flex-wrap">
        {extraLeft}
        <div>
          <div className="text-[9px] text-subtle uppercase font-bold tracking-wider mb-0.5">Date MAJ</div>
          <div className="text-sm font-bold text-navy">{dateMAJ}</div>
        </div>
        <div>
          <div className="text-[9px] text-subtle uppercase font-bold tracking-wider mb-0.5">Semaine</div>
          <div className="text-sm font-bold text-navy">{semaine}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ background: produit.couleur ?? '#4A4CC8' }} />
          <div>
            <div className="text-[9px] text-subtle uppercase font-bold tracking-wider mb-0.5">Produit</div>
            <div className="text-sm font-bold text-navy">{produit.nom}</div>
          </div>
        </div>
        {produit.priorite_strategique && (
          <div>
            <div className="text-[9px] text-subtle uppercase font-bold tracking-wider mb-0.5">Priorité</div>
            <div className="text-sm font-bold text-navy">{'★'.repeat(produit.priorite_strategique)} P{produit.priorite_strategique}</div>
          </div>
        )}
        {isSprint && effectiveSprint !== null && (
          <div>
            <div className="text-[9px] text-subtle uppercase font-bold tracking-wider mb-0.5">Sprint</div>
            <div className="text-sm font-bold text-navy">
              S{effectiveSprint}
              {sprintIsCloture && <span className="ml-1 text-[9px] font-normal text-subtle">(clôturé)</span>}
            </div>
          </div>
        )}
        {totalUSDisp > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <div className="text-[9px] text-subtle uppercase font-bold tracking-wider">Backlog</div>
            <div className="w-24 h-1.5 rounded-full bg-border overflow-hidden">
              <div className={cn('h-full rounded-full', barColor(backlogPctDisp))} style={{ width: `${backlogPctDisp}%` }} />
            </div>
            <div className="text-xs font-bold text-navy tabular-nums">{backlogPctDisp} %</div>
            <div className="text-[10px] text-subtle">{faitUSDisp}/{totalUSDisp} US</div>
          </div>
        )}
      </div>

      {/* RAG cells */}
      <div className="flex items-center gap-2 px-5 py-3 border-r border-border">
        <RagCell label="Avancement" rag={ragA}  sub={subAvancement} tooltip={tipA}  />
        <RagCell label="Budget"     rag={ragB}  sub={subBudget}     tooltip={tipB}  />
        <RagCell label="Délai"      rag={ragD}  sub={subDelai}      tooltip={tipD}  />
        <RagCell label="Blocages"   rag={ragBl} sub={subBlocages}   tooltip={tipBl} />
      </div>

      {/* Trajectoire + Livraison */}
      <div className="flex items-center divide-x divide-border">
        <Tooltip content={tipTraj}>
          <div className="flex flex-col items-center gap-1.5 px-5 py-3 min-w-[120px] cursor-help">
            <div className="text-[9px] text-subtle uppercase font-bold tracking-wider">Trajectoire</div>
            {trajectoire && TRAJ_CFG[trajectoire] ? (
              <div className={cn('text-xs font-bold px-3 py-1 rounded-xl border whitespace-nowrap',
                TRAJ_CFG[trajectoire].bg, TRAJ_CFG[trajectoire].text, TRAJ_CFG[trajectoire].border)}>
                {TRAJ_CFG[trajectoire].label}
              </div>
            ) : (
              <div className="text-xs font-bold px-3 py-1 rounded-xl bg-slate-50 text-slate-400 border border-slate-100">—</div>
            )}
          </div>
        </Tooltip>
        <Tooltip content={tipD}>
          <div className="flex flex-col items-center gap-1.5 px-5 py-3 min-w-[80px] cursor-help">
            <div className="text-[9px] text-subtle uppercase font-bold tracking-wider">Livraison est.</div>
            <div className={cn('text-sm font-black tabular-nums',
              ragD === 'green' ? 'text-emerald-600'
              : ragD === 'amber' ? 'text-amber-600'
              : ragD === 'red'   ? 'text-rose-600'
              : 'text-slate-400')}>
              {livraison}
            </div>
          </div>
        </Tooltip>
        {extraRight}
      </div>

    </div>
  )
}
