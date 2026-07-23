import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProduit } from '@/contexts/ProduitContext'
import { logActivity } from '@/hooks/useActivityLog'

export interface Epic {
  id:         number
  produit_id: number
  code:       string
  nom:        string
  couleur:    string | null
  bg_couleur: string | null
  ordre:      number | null
}

// Valeur combinée telle que stockée sur taches.epic (ex: "EPIC 1 — Architecture & CDC")
export function epicFullName(e: Pick<Epic, 'code' | 'nom'>): string {
  return `${e.code} — ${e.nom}`
}

// `ordre` pilote le tri (et donc la numérotation "1.1, 2.3…" des US, cf.
// computeTacheNumbers) — dérivé du numéro affiché dans le code ("EPIC 14"
// → 14) pour qu'il reste toujours cohérent avec ce que l'utilisateur voit
// et choisit, plutôt qu'un simple ordre de création déconnecté du numéro.
export function epicOrdreFromCode(code: string): number {
  const digits = code.match(/\d+/)
  return digits ? Number(digits[0]) : 0
}

export function useEpics() {
  const { produitActif } = useProduit()
  const produitId = produitActif?.id ?? null

  return useQuery({
    queryKey: ['epics', produitId],
    queryFn: async () => {
      if (!produitId) return []
      const { data, error } = await supabase.from('epics').select('*').eq('produit_id', produitId).order('ordre').order('code')
      if (error) throw error
      return (data ?? []) as Epic[]
    },
    staleTime: 30_000,
    enabled: !!produitId,
  })
}

export function useEpicsByProduit(produitId: number | null) {
  return useQuery({
    queryKey: ['epics', produitId],
    queryFn: async () => {
      if (!produitId) return []
      const { data, error } = await supabase.from('epics').select('*').eq('produit_id', produitId).order('ordre').order('code')
      if (error) throw error
      return (data ?? []) as Epic[]
    },
    staleTime: 30_000,
    enabled: !!produitId,
  })
}

// Le numéro ("EPIC N") n'est plus saisi à la main : toujours le rang
// suivant, à la suite des Epics existants — cf. useReorderEpics pour le
// seul autre moyen de le faire changer (glisser-déposer).
export function useCreateEpic() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()
  return useMutation({
    mutationFn: async ({ nom, couleur, bg_couleur }: { nom: string; couleur: string; bg_couleur: string }) => {
      if (!produitActif) throw new Error('Aucun produit sélectionné')
      const { data: existing, error: fetchError } = await supabase.from('epics').select('id').eq('produit_id', produitActif.id)
      if (fetchError) throw fetchError
      const rang = (existing ?? []).length + 1
      const code = `EPIC ${rang}`
      // .select().single() : les appelants (duplication d'Epic, conversion
      // d'un groupe de post-it…) ont besoin du code réellement attribué
      // pour construire le libellé complet de leurs propres tâches.
      const { data, error } = await supabase.from('epics').insert({ produit_id: produitActif.id, code, nom, couleur, bg_couleur, ordre: rang * 10 }).select().single()
      if (error) throw error
      const created = data as Epic
      await logActivity({ produit_id: produitActif.id, action: 'create', target: String(created.id), title: epicFullName(created), entity: 'epic' })
      return created
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['epics', produitActif?.id] }),
  })
}

// Nom/couleur seulement : `code`/`ordre` ne sont plus modifiables ici
// (auto-générés à la création, recalculés en bloc par useReorderEpics) —
// évite qu'un futur appel désynchronise le numéro affiché de la position.
export function useUpdateEpic() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Pick<Epic, 'nom' | 'couleur' | 'bg_couleur'>> }) => {
      const pid = produitActif?.id ?? null
      const current = qc.getQueryData<Epic[]>(['epics', pid])?.find(e => e.id === id)
      const { error } = await supabase.from('epics').update(updates).eq('id', id)
      if (error) throw error
      if (!pid) return
      const title = current ? epicFullName(current) : String(id)
      for (const key of Object.keys(updates) as (keyof typeof updates)[]) {
        const oldVal = current ? current[key] ?? null : null
        const newVal = updates[key] ?? null
        if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue
        await logActivity({
          produit_id: pid, action: 'update', target: String(id), title, field: String(key),
          old_value: JSON.stringify(oldVal), new_value: JSON.stringify(newVal), entity: 'epic',
        })
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['epics', produitActif?.id] }),
  })
}

// Glisser-déposer dans Setup > Epics : recalcule `ordre` ET `code`
// ("EPIC 1", "EPIC 2"…) pour CHAQUE Epic selon sa nouvelle position — pas
// seulement celui déplacé, puisqu'en décaler un décale tous les suivants.
// Cascade le renommage sur `taches.epic` pour chaque Epic dont le libellé
// change réellement, scopé au produit (jamais les tâches d'un autre
// produit, même libellé par coïncidence).
export function useReorderEpics() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()
  return useMutation({
    mutationFn: async (orderedIds: number[]) => {
      if (!produitActif) throw new Error('Aucun produit sélectionné')
      const { data: current, error: fetchError } = await supabase.from('epics').select('*').eq('produit_id', produitActif.id)
      if (fetchError) throw fetchError
      const byId = new Map((current ?? []).map(e => [e.id, e as Epic]))

      for (let i = 0; i < orderedIds.length; i++) {
        const epic = byId.get(orderedIds[i])
        if (!epic) continue
        const newCode  = `EPIC ${i + 1}`
        const newOrdre = (i + 1) * 10
        if (epic.code === newCode && epic.ordre === newOrdre) continue

        const oldLabel = epicFullName(epic)
        const newLabel = epicFullName({ code: newCode, nom: epic.nom })
        const { error } = await supabase.from('epics').update({ code: newCode, ordre: newOrdre }).eq('id', epic.id)
        if (error) throw error
        if (oldLabel !== newLabel) {
          await supabase.from('taches').update({ epic: newLabel }).eq('epic', oldLabel).eq('produit_id', produitActif.id)
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['epics', produitActif?.id] })
      qc.invalidateQueries({ queryKey: ['taches'] })
    },
  })
}

export function useDeleteEpic() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()
  return useMutation({
    mutationFn: async (id: number) => {
      const pid = produitActif?.id ?? null
      const current = qc.getQueryData<Epic[]>(['epics', pid])?.find(e => e.id === id)
      const { error } = await supabase.from('epics').delete().eq('id', id)
      if (error) throw error
      if (pid) await logActivity({
        produit_id: pid, action: 'delete', target: String(id), title: current ? epicFullName(current) : String(id),
        old_value: current ? JSON.stringify(current) : null, entity: 'epic',
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['epics', produitActif?.id] }),
  })
}
