// ── Types Dimos D3X+ ──────────────────────────────────────────

export type Statut = 'À faire' | 'En cours' | 'Fait' | 'Bloqué'
export type Moscow = 'Must Have' | 'Should Have' | 'Could Have' | "Won't Have"
export type TypeFonction = 'Fonction principale' | 'Fonction secondaire' | 'Fonction support' | 'Fonction exclue'
export type SprintStatut = 'planifie' | 'en_cours' | 'pause' | 'cloture'

export interface Tache {
  id: number
  id_tache: string
  produit_id: number | null
  epic: string
  titre: string
  type_fonction: TypeFonction | null
  description: string | null
  criteres: string | null
  lien_dod: string | null
  commentaire: string | null
  jalon: string | null
  sprint_debut: string | null
  sprint_fin: string | null
  sprint: string | null
  iteration: number
  moscow: Moscow | null
  priorite: string | null
  statut: Statut
  effort_j: number
  equipe: string | null
  metier: string | null
  assigne_a: string | null
  type_tache: string | null
  parent_id: string | null
  famille_id: string | null
  created_at: string
  updated_at: string | null
}

export interface Sprint {
  id?: number
  numero: string
  statut: SprintStatut
  objectifs: string | null
  review: string | null
  started_at: string | null
  closed_at: string | null
  est_actif: boolean
  stats: SprintStats | null
}

export interface SprintStats {
  total: number
  fait: number
  encours: number
  bloque: number
  effort: number
  pct: number
}

export interface MembreEquipe {
  id: number
  trigramme: string
  prenom: string
  nom: string
  role: string | null
  couleur: string | null
  actif: boolean
  equipe_id: number | null
  user_id: string | null
}

export interface Equipe {
  id: number
  nom: string
  description: string | null
  couleur: string | null
  actif: boolean
  created_at: string
}

export interface Feature {
  id: number
  nom: string
  description: string | null
  couleur: string | null
  actif: boolean
}

export interface DodItem {
  id: number
  code: string
  titre: string
  description: string | null
  epic: string | null
  jalon: string | null
  statut: 'non_commence' | 'en_cours' | 'valide' | 'na'
  pct: number
  commentaire: string | null
}
