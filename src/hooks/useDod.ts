import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProduit } from '@/contexts/ProduitContext'
import { naturalCompare } from '@/lib/utils'
import { logActivity } from '@/hooks/useActivityLog'

export type ExigenceType      = 'fonctionnelle' | 'performance' | 'securite' | 'cout'
export type ExigenceCriticite = 'haute' | 'moyenne' | 'basse'

// "DodItem"/table "dod" : noms historiques — il s'agit en réalité du
// référentiel d'EXIGENCES produit (voir migration 0028).
export interface DodItem {
  id:               number
  produit_id:       number
  code:             string
  titre:            string
  description:      string | null
  categorie:        string | null
  actif:            boolean
  ordre:            number
  type:             ExigenceType
  criticite:        ExigenceCriticite
  // Couverte = une US y travaille (lien_dod) ; vérifiée = validée par un
  // essai. C'est ce statut qui pilote la sortie des boucles proto/essais.
  verifiee:         boolean
  valeur_cible:     string | null
  valeur_constatee: string | null
  created_at:       string
}

export function useDod() {
  const { produitActif } = useProduit()
  const produitId = produitActif?.id ?? null

  return useQuery({
    queryKey: ['dod', produitId],
    queryFn: async () => {
      if (!produitId) return []
      const { data, error } = await supabase
        .from('dod')
        .select('*')
        .eq('produit_id', produitId)
      if (error) throw error
      // Tri naturel par code (F1.1, F1.2, F2.1, F9.12, F10.1…) : le champ
      // "ordre" ne sert plus que de départage en cas de codes identiques.
      return ((data ?? []) as DodItem[]).sort((a, b) => naturalCompare(a.code, b.code) || a.ordre - b.ordre)
    },
    staleTime: 30_000,
    enabled: !!produitId,
  })
}

// Le code ("EX 1.1") n'est plus saisi par l'appelant : il est posé
// automatiquement par le trigger `recompute_dod_codes` (migration 0031)
// selon la position (catégorie + ordre). On insère avec un code temporaire
// garanti unique, aussitôt remplacé dans la même transaction.
export function useCreateDodItem() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async (payload: Omit<DodItem, 'id' | 'created_at' | 'produit_id' | 'code'>) => {
      if (!produitActif) throw new Error('Aucun produit sélectionné')
      const { data, error } = await supabase
        .from('dod')
        .insert({ ...payload, produit_id: produitActif.id, code: `TMP-${crypto.randomUUID()}` })
        .select()
        .single()
      if (error) throw error
      return data as DodItem
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dod', produitActif?.id] }),
  })
}

export function useUpdateDodItem() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    // "item" (l'exigence complète avant modif) est optionnel mais nécessaire
    // pour journaliser les allers-retours de vérification (compteur de
    // boucles proto/essais) — à passer dès qu'on connaît déjà l'item.
    mutationFn: async ({ id, updates, item }: { id: number; updates: Partial<DodItem>; item?: DodItem }) => {
      const { error } = await supabase.from('dod').update(updates).eq('id', id)
      if (error) throw error
      if (produitActif && item && updates.verifiee !== undefined && updates.verifiee !== item.verifiee) {
        await logActivity({
          produit_id: produitActif.id, action: 'status', target: item.code, title: item.titre,
          field: 'verifiee', old_value: String(item.verifiee), new_value: String(updates.verifiee),
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dod', produitActif?.id] })
      qc.invalidateQueries({ queryKey: ['verification-loops', produitActif?.id] })
    },
  })
}

export function useDeleteDodItem() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('dod').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dod', produitActif?.id] }),
  })
}
