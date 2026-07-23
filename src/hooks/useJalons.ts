import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProduit } from '@/contexts/ProduitContext'
import { logActivity } from '@/hooks/useActivityLog'

export interface Jalon {
  id:          number
  produit_id:  number
  // Numéro unique (ex: "I1") : c'est lui, tel quel, qui est stocké sur
  // taches.jalon — contrairement à Epic, pas de libellé combiné code+nom.
  code:        string
  nom:         string
  description: string
  couleur:     string
  ordre:       number
  created_at:  string
}

export function useJalons() {
  const { produitActif } = useProduit()
  const produitId = produitActif?.id ?? null

  return useQuery({
    queryKey: ['jalons', produitId],
    queryFn: async () => {
      if (!produitId) return []
      const { data, error } = await supabase.from('jalons').select('*').eq('produit_id', produitId).order('ordre').order('code')
      if (error) throw error
      return (data ?? []) as Jalon[]
    },
    staleTime: 30_000,
    enabled: !!produitId,
  })
}

export function useJalonsByProduit(produitId: number | null) {
  return useQuery({
    queryKey: ['jalons', produitId],
    queryFn: async () => {
      if (!produitId) return []
      const { data, error } = await supabase.from('jalons').select('*').eq('produit_id', produitId).order('ordre').order('code')
      if (error) throw error
      return (data ?? []) as Jalon[]
    },
    staleTime: 30_000,
    enabled: !!produitId,
  })
}

// Le numéro ("I1", "I2"…) n'est plus saisi à la main : toujours le rang
// suivant, à la suite des Jalons existants — même principe que les Epics
// (cf. useCreateEpic) — cf. useReorderJalons pour le seul autre moyen de le
// faire changer (glisser-déposer).
export function useCreateJalon() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()
  return useMutation({
    mutationFn: async ({ nom, description, couleur }: { nom: string; description: string; couleur: string }) => {
      if (!produitActif) throw new Error('Aucun produit sélectionné')
      const { data: existing, error: fetchError } = await supabase.from('jalons').select('id').eq('produit_id', produitActif.id)
      if (fetchError) throw fetchError
      const rang = (existing ?? []).length + 1
      const code = `I${rang}`
      const { data, error } = await supabase.from('jalons').insert({ produit_id: produitActif.id, code, nom, description, couleur, ordre: rang * 10 }).select().single()
      if (error) throw error
      const created = data as Jalon
      await logActivity({ produit_id: produitActif.id, action: 'create', target: String(created.id), title: `${created.code} — ${created.nom}`, entity: 'jalon' })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jalons', produitActif?.id] }),
  })
}

// Nom/description/couleur seulement : `code`/`ordre` ne sont plus
// modifiables ici (auto-générés à la création, recalculés en bloc par
// useReorderJalons) — évite qu'un futur appel désynchronise le numéro
// affiché de la position, même principe que useUpdateEpic.
export function useUpdateJalon() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Pick<Jalon, 'nom' | 'description' | 'couleur'>> }) => {
      const pid = produitActif?.id ?? null
      const current = qc.getQueryData<Jalon[]>(['jalons', pid])?.find(j => j.id === id)
      const { error } = await supabase.from('jalons').update(updates).eq('id', id)
      if (error) throw error
      if (!pid) return
      const title = current ? `${current.code} — ${current.nom}` : String(id)
      for (const key of Object.keys(updates) as (keyof typeof updates)[]) {
        const oldVal = current ? current[key] ?? null : null
        const newVal = updates[key] ?? null
        if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue
        await logActivity({
          produit_id: pid, action: 'update', target: String(id), title, field: String(key),
          old_value: JSON.stringify(oldVal), new_value: JSON.stringify(newVal), entity: 'jalon',
        })
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jalons', produitActif?.id] }),
  })
}

// Glisser-déposer dans Setup > Jalons : recalcule `ordre` ET `code`
// ("I1", "I2"…) pour CHAQUE Jalon selon sa nouvelle position — pas
// seulement celui déplacé, puisqu'en décaler un décale tous les suivants.
// Cascade le changement sur `taches.jalon` (stocké tel quel, contrairement
// à Epic) pour chaque Jalon dont le code change réellement, scopé au
// produit — même principe que useReorderEpics.
export function useReorderJalons() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()
  return useMutation({
    mutationFn: async (orderedIds: number[]) => {
      if (!produitActif) throw new Error('Aucun produit sélectionné')
      const { data: current, error: fetchError } = await supabase.from('jalons').select('*').eq('produit_id', produitActif.id)
      if (fetchError) throw fetchError
      const byId = new Map((current ?? []).map(j => [j.id, j as Jalon]))

      for (let i = 0; i < orderedIds.length; i++) {
        const jalon = byId.get(orderedIds[i])
        if (!jalon) continue
        const newCode  = `I${i + 1}`
        const newOrdre = (i + 1) * 10
        if (jalon.code === newCode && jalon.ordre === newOrdre) continue

        const oldCode = jalon.code
        const { error } = await supabase.from('jalons').update({ code: newCode, ordre: newOrdre }).eq('id', jalon.id)
        if (error) throw error
        if (oldCode !== newCode) {
          await supabase.from('taches').update({ jalon: newCode }).eq('jalon', oldCode).eq('produit_id', produitActif.id)
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jalons', produitActif?.id] })
      qc.invalidateQueries({ queryKey: ['taches'] })
    },
  })
}

export function useDeleteJalon() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()
  return useMutation({
    mutationFn: async (id: number) => {
      const pid = produitActif?.id ?? null
      const current = qc.getQueryData<Jalon[]>(['jalons', pid])?.find(j => j.id === id)
      const { error } = await supabase.from('jalons').delete().eq('id', id)
      if (error) throw error
      if (pid) await logActivity({
        produit_id: pid, action: 'delete', target: String(id), title: current ? `${current.code} — ${current.nom}` : String(id),
        old_value: current ? JSON.stringify(current) : null, entity: 'jalon',
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jalons', produitActif?.id] }),
  })
}
