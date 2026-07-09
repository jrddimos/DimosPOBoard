import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

function dateToISOWeekYear(dateStr: string): { semaine: number; annee: number } | null {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  const tmp = new Date(d)
  tmp.setDate(d.getDate() + 4 - (d.getDay() || 7))
  const yearStart = new Date(tmp.getFullYear(), 0, 1)
  const week = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return { semaine: week, annee: tmp.getFullYear() }
}

export interface PlanChargeLine {
  id: string
  produit_id: number
  epic: string
  assigne_a: string
  semaine: number
  annee: number
  jours: number
  jours_realises: number
}

export type LineKey = { produit_id: number; epic: string; assigne_a: string }

export function usePlanCharges(annee: number) {
  return useQuery({
    queryKey: ['plan-charges', annee],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_charges')
        .select('*')
        .eq('annee', annee)
      if (error) throw error
      return (data ?? []) as PlanChargeLine[]
    },
    staleTime: 30_000,
  })
}

export function useUpsertPlanCharge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (row: { produit_id: number; epic: string; assigne_a: string; semaine: number; annee: number; jours?: number; jours_realises?: number }) => {
      const { error } = await supabase
        .from('plan_charges')
        .upsert(row, { onConflict: 'produit_id,epic,assigne_a,semaine,annee' })
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['plan-charges', v.annee] }),
  })
}

// Réalisé automatique depuis les tâches Fait avec effort_realise_j, PLUS le
// temps figé sur les itérations transférées (statut 'Transféré' posé par
// useTransferToNextIteration, src/hooks/useTacheIterations.ts) : ces
// dernières portent leur PROPRE `sprint` (celui qu'on a quitté), contrairement
// à la tâche qui a depuis bougé vers le sprint suivant — sans cette 2ᵉ source,
// le temps passé sur un sprint clôturé avant la fin d'une US disparaîtrait du
// Plan de charges (attribué à tort à la semaine du sprint de destination, ou
// pas du tout si l'US n'est toujours pas finie).
// Clé : `${produit_id}|${semaine}|${assigne_a}`
export function useRealiseFromTasks(annee: number) {
  return useQuery({
    queryKey: ['realise-from-tasks', annee],
    queryFn: async () => {
      const [{ data: taches, error: errT }, { data: iterations, error: errI }, { data: sprints, error: errS }] = await Promise.all([
        supabase
          .from('taches')
          .select('produit_id, sprint_debut, assigne_a, effort_realise_j, type_tache')
          .eq('statut', 'Fait')
          .not('effort_realise_j', 'is', null)
          .gt('effort_realise_j', 0),
        supabase
          .from('tache_iterations')
          .select('produit_id, sprint, assigne_a, effort_realise_j')
          .eq('statut', 'Transféré')
          .not('effort_realise_j', 'is', null)
          .gt('effort_realise_j', 0),
        supabase
          .from('sprints')
          .select('produit_id, numero, closed_at, started_at'),
      ])
      if (errT) throw errT
      if (errI) throw errI
      if (errS) throw errS

      // Sprint map : `${produit_id}|${numero}` → { semaine, annee }
      const sprintMap = new Map<string, { semaine: number; annee: number }>()
      for (const s of (sprints ?? [])) {
        const dateStr = s.closed_at ?? s.started_at
        if (!dateStr) continue
        const wk = dateToISOWeekYear(dateStr)
        if (wk && wk.annee === annee) {
          sprintMap.set(`${s.produit_id}|${s.numero}`, wk)
        }
      }

      // Agréger par (produit_id, semaine, assigne_a)
      // `t.sprint` (l'ancien champ, avant sprint_debut/sprint_fin) porte une
      // valeur par défaut ('S01' constaté en base) sur la quasi-totalité des
      // tâches, y compris jamais planifiées — seul sprint_debut est fiable.
      const m = new Map<string, number>()
      for (const t of (taches ?? [])) {
        if (!t.produit_id || t.type_tache === 'Conteneur' || !t.sprint_debut) continue
        const wk = sprintMap.get(`${t.produit_id}|${t.sprint_debut}`)
        if (!wk) continue
        const k = `${t.produit_id}|${wk.semaine}|${t.assigne_a ?? ''}`
        m.set(k, (m.get(k) ?? 0) + (t.effort_realise_j ?? 0))
      }
      for (const it of (iterations ?? [])) {
        if (!it.produit_id || !it.sprint) continue
        const wk = sprintMap.get(`${it.produit_id}|${it.sprint}`)
        if (!wk) continue
        const k = `${it.produit_id}|${wk.semaine}|${it.assigne_a ?? ''}`
        m.set(k, (m.get(k) ?? 0) + (it.effort_realise_j ?? 0))
      }
      return m
    },
    staleTime: 60_000,
  })
}

export function useDeletePlanChargeLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ produit_id, epic, assigne_a, annee }: LineKey & { annee: number }) => {
      const { error } = await supabase
        .from('plan_charges')
        .delete()
        .eq('produit_id', produit_id)
        .eq('epic', epic)
        .eq('assigne_a', assigne_a)
        .eq('annee', annee)
      if (error) throw error
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['plan-charges', v.annee] }),
  })
}
