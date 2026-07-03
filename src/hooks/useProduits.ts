import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Produit {
  id:                   number
  nom:                  string
  description:          string | null
  couleur:              string | null
  actif:                boolean
  is_template:          boolean
  created_at:           string
  // Champs stratégiques
  vision:               string | null
  objectifs_q1:         string | null
  objectifs_q2:         string | null
  objectifs_q3:         string | null
  objectifs_q4:         string | null
  budget_etp:           number | null
  budget_invest:        number | null
  budget_achats:        number | null
  date_lancement_cible: string | null
  priorite_strategique: number | null
  niveau_risque:        string | null
  kpis_cibles:          string | null
  outcome_estime:       string | null
  theme:                string | null
  objectifs_trimestriels: TrimObjectif[] | null
  risques:                RisqueItem[]   | null
  actions_lop:            ActionLop[]    | null
  rag_config:             import('@/types').RagConfig | null
  discussion_bg_url:      string | null
  discussion_bg_opacity:  number
}

export interface ActionLop {
  id:                   string
  titre:                string
  created_at:           string
  date_cloture_estimee: string | null
  report_1:             string | null
  report_2:             string | null
  assigne_id:           string | null
  assigne_nom:          string | null
  cloture:              boolean
  cloture_at:           string | null
}

export interface RisqueItem {
  id:         string
  titre:      string
  created_at: string
  cloture:    boolean
}

export type TrimStatut = 'On track' | 'At risk' | 'Off track' | 'En pause'

export interface ExpenseDetail {
  id: string
  label: string
  montant: number
}

export interface TrimCheckItem {
  id:      string
  texte:   string
  checked: boolean
}

export interface TrimObjectif {
  id:            string
  trimestre:     string
  objectifs:     TrimCheckItem[]
  // Prévisionnel
  budget_etp:    number | null
  budget_invest: number | null
  budget_achats: number | null
  previsionnel_verrouille: boolean | undefined
  // Sprints rattachés à ce trimestre (numeros)
  sprints_ids: string[] | undefined
  // Consommé (réalisé)
  realise_etp:    number | null
  realise_invest: number | null
  realise_achats: number | null
  // KPIs / Outcome
  kpis:          string
  outcome_desc:  string
  outcome_euros: number | null
  statut:        TrimStatut | null
  lance:         boolean | undefined
  pause:         boolean | undefined
  cloture:       boolean | undefined
  jours_ouvres:  number | undefined   // jours ouvrés spécifiques à ce trimestre
  budget_invest_details:  ExpenseDetail[] | undefined
  realise_invest_details: ExpenseDetail[] | undefined
  budget_achats_details:  ExpenseDetail[] | undefined
  realise_achats_details: ExpenseDetail[] | undefined
}

export function trimAvancement(t: TrimObjectif): number | null {
  if (!t.objectifs?.length) return null
  return Math.round(t.objectifs.filter(o => o.checked).length / t.objectifs.length * 100)
}

async function fetchProduits(): Promise<Produit[]> {
  const { data, error } = await supabase.from('produits').select('*').order('nom')
  if (error) throw error
  return data ?? []
}

export function useProduits() {
  return useQuery({ queryKey: ['produits'], queryFn: fetchProduits, staleTime: 60_000 })
}

type ProduitCreate = Pick<Produit, 'nom' | 'description' | 'couleur' | 'actif' | 'is_template'>

export function useCreateProduit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: ProduitCreate) => {
      const { data, error } = await supabase.from('produits').insert(p).select().single()
      if (error) throw error
      return data as Produit
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['produits'] }),
  })
}

export function useUpdateProduit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Produit> }) => {
      const { error } = await supabase.from('produits').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['produits'] }),
  })
}

export function useDeleteProduit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('produits').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['produits'] }),
  })
}

export interface DuplicateOptions {
  sourceId:    number
  nom:         string
  description: string | null
  couleur:     string | null
  copyDod:     boolean
  copyTaches:  boolean
  copySprints: boolean
}

export function useDuplicateProduit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ sourceId, nom, description, couleur, copyDod, copyTaches, copySprints }: DuplicateOptions) => {
      // 1. Créer le nouveau produit
      const { data: newProduit, error: errProd } = await supabase
        .from('produits')
        .insert({ nom, description, couleur, actif: true, is_template: false })
        .select()
        .single()
      if (errProd) throw errProd
      const newId = (newProduit as Produit).id

      // 2. DoD
      if (copyDod) {
        const { data: dodItems } = await supabase
          .from('dod')
          .select('code, titre, description, categorie, actif, ordre')
          .eq('produit_id', sourceId)
        if (dodItems && dodItems.length > 0) {
          await supabase.from('dod').insert(
            dodItems.map((d: Record<string, unknown>) => ({ ...d, produit_id: newId }))
          )
        }
      }

      // 3. Sprints
      if (copySprints) {
        const { data: sprints } = await supabase
          .from('sprints')
          .select('numero, statut, objectifs, review')
          .eq('produit_id', sourceId)
        if (sprints && sprints.length > 0) {
          await supabase.from('sprints').insert(
            sprints.map((s: Record<string, unknown>) => ({
              ...s,
              produit_id: newId,
              est_actif:  false,
              started_at: null,
              closed_at:  null,
              statut:     'planifie',
            }))
          )
        }
      }

      // 4. Tâches (parentes puis sous-tâches avec remappage id_tache)
      if (copyTaches) {
        const { data: allTaches } = await supabase
          .from('taches')
          .select('*')
          .eq('produit_id', sourceId)
          .order('id_tache')

        if (allTaches && allTaches.length > 0) {
          type Row = Record<string, unknown>
          const parents  = allTaches.filter((t: Row) => !t.parent_id) as Row[]
          const children = allTaches.filter((t: Row) =>  t.parent_id) as Row[]

          // Nouveau produit = commence à US-001 (contrainte unique par produit_id)
          let counter = 1
          const genId = () => `US-${String(counter++).padStart(3, '0')}`

          // Map ancien id_tache → nouveau id_tache
          const idMap: Record<string, string> = {}

          for (const t of parents) {
            const oldId = t.id_tache as string
            const newIdTache = genId()
            idMap[oldId] = newIdTache

            const { id: _id, created_at: _c, updated_at: _u, id_tache: _it, produit_id: _pid, ...rest } = t
            await supabase.from('taches').insert({
              ...rest,
              id_tache:    newIdTache,
              produit_id:  newId,
              statut:      'À faire',
              sprint:      null,
              sprint_debut: null,
              sprint_fin:  null,
              parent_id:   null,
              famille_id:  null,
            })
          }

          // Sous-tâches avec parent_id remappé
          for (const c of children) {
            const oldParentId = c.parent_id as string
            const newParentId = idMap[oldParentId]
            if (!newParentId) continue

            const newIdTache = genId()
            const { id: _id, created_at: _c, updated_at: _u, id_tache: _it, produit_id: _pid, ...rest } = c
            await supabase.from('taches').insert({
              ...rest,
              id_tache:   newIdTache,
              produit_id: newId,
              parent_id:  newParentId,
              famille_id: null,
              statut:     'À faire',
              sprint:     null,
              sprint_debut: null,
              sprint_fin: null,
            })
          }
        }
      }

      return newProduit as Produit
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['produits'] }),
  })
}

// ── Demande d'accès (écran d'accueil sans accès) ─────────────────
export function useRequestProduitAccess() {
  return useMutation({
    mutationFn: async ({ produitId, message }: { produitId: number; message?: string }) => {
      const { error } = await supabase.rpc('request_produit_access', {
        p_produit_id: produitId,
        p_message: message ?? null,
      })
      if (error) throw error
    },
  })
}

// ── Fond du canal de discussion (réservé admin côté UI) ──────────
export function useUploadDiscussionBg() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ produitId, file }: { produitId: number; file: File | null }) => {
      if (file === null) {
        const { error } = await supabase.from('produits').update({ discussion_bg_url: null }).eq('id', produitId)
        if (error) throw error
        return null
      }
      const ext  = file.name.split('.').pop() ?? 'jpg'
      const path = `${produitId}.${ext}`
      const { error: upErr } = await supabase.storage.from('discussion-backgrounds').upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('discussion-backgrounds').getPublicUrl(path)
      const url = `${data.publicUrl}?t=${Date.now()}`
      const { error } = await supabase.from('produits').update({ discussion_bg_url: url }).eq('id', produitId)
      if (error) throw error
      return url
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['produits'] }),
  })
}

export function useUpdateDiscussionBgOpacity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ produitId, opacity }: { produitId: number; opacity: number }) => {
      const { error } = await supabase.from('produits').update({ discussion_bg_opacity: opacity }).eq('id', produitId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['produits'] }),
  })
}
