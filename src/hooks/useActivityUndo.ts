import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProduit } from '@/contexts/ProduitContext'
import { logActivity, type ActivityLog } from '@/hooks/useActivityLog'

// ── Undo/restore génériques (Setup > Activité produit + Setup > Global) ──
// `log.entity` distingue la table réellement visée par une entrée du
// journal (null = tâche historique, target = id_tache) — sans ça,
// "Annuler"/"Restaurer" mettrait à tort à jour la table `taches`.
// `scoped` = la table porte une colonne produit_id (tâches, DoD, sprints,
// epics, jalons) ; les entités transverses (produit lui-même, équipes,
// utilisateurs, finance, fermetures, gammes, ROCKS, roadmap, suggestions)
// n'en ont pas — un `.eq('produit_id', null)` y matcherait toujours zéro
// ligne (NULL ≠ NULL en SQL), d'où ce garde-fou explicite.
interface EntityConfig { table: string; matchCol: string; scoped: boolean }

function entityConfig(entity: ActivityLog['entity']): EntityConfig {
  switch (entity) {
    case 'dod':            return { table: 'dod',                    matchCol: 'code',   scoped: true }
    case 'sprint':         return { table: 'sprints',                matchCol: 'numero', scoped: true }
    case 'epic':           return { table: 'epics',                  matchCol: 'id',     scoped: true }
    case 'jalon':          return { table: 'jalons',                 matchCol: 'id',     scoped: true }
    case 'produit':        return { table: 'produits',               matchCol: 'id',     scoped: false }
    case 'equipe':         return { table: 'equipes',                matchCol: 'id',     scoped: false }
    case 'utilisateur':    return { table: 'user_profiles',          matchCol: 'user_id', scoped: false }
    case 'finance_config': return { table: 'finance_config',         matchCol: 'id',     scoped: false }
    case 'fermeture':      return { table: 'periodes_fermeture',     matchCol: 'id',     scoped: false }
    case 'gamme':          return { table: 'gammes_produits',        matchCol: 'id',     scoped: false }
    case 'rocks':          return { table: 'scorecard_initiatives',  matchCol: 'id',     scoped: false }
    case 'roadmap_item':   return { table: 'roadmap_items',          matchCol: 'id',     scoped: false }
    case 'suggestion':     return { table: 'suggestions',            matchCol: 'id',     scoped: false }
    default:               return { table: 'taches',                 matchCol: 'id_tache', scoped: true }
  }
}

function invalidateEntity(qc: QueryClient, entity: ActivityLog['entity'], pid: number | null) {
  switch (entity) {
    case 'dod': qc.invalidateQueries({ queryKey: ['dod', pid] }); break
    case 'sprint':
      qc.invalidateQueries({ queryKey: ['sprints', pid] })
      qc.invalidateQueries({ queryKey: ['sprint-actif', pid] })
      qc.invalidateQueries({ queryKey: ['sprints-closed', pid] })
      break
    case 'epic':           qc.invalidateQueries({ queryKey: ['epics', pid] }); break
    case 'jalon':           qc.invalidateQueries({ queryKey: ['jalons', pid] }); break
    case 'produit':         qc.invalidateQueries({ queryKey: ['produits'] }); break
    case 'equipe':          qc.invalidateQueries({ queryKey: ['equipes'] }); break
    case 'utilisateur':
      qc.invalidateQueries({ queryKey: ['user_profiles'] })
      qc.invalidateQueries({ queryKey: ['utilisateurs'] })
      break
    case 'finance_config':  qc.invalidateQueries({ queryKey: ['finance_config'] }); break
    case 'fermeture':       qc.invalidateQueries({ queryKey: ['periodes_fermeture'] }); break
    case 'gamme':
      qc.invalidateQueries({ queryKey: ['gammes-produits'] })
      qc.invalidateQueries({ queryKey: ['roadmap-items'] })
      break
    case 'rocks':           qc.invalidateQueries({ queryKey: ['scorecard_initiatives'] }); break
    case 'roadmap_item':    qc.invalidateQueries({ queryKey: ['roadmap-items'] }); break
    case 'suggestion':      qc.invalidateQueries({ queryKey: ['suggestions'] }); break
    default:                qc.invalidateQueries({ queryKey: ['taches', pid] })
  }
  // Les entrées transverses (Setup > Global) partagent le même journal —
  // toujours invalider les deux vues plutôt que de deviner laquelle est
  // ouverte à l'écran.
  qc.invalidateQueries({ queryKey: ['activite', pid] })
  qc.invalidateQueries({ queryKey: ['activite', 'global'] })
}

// ── Restaurer un élément supprimé (page Activité) ────────────────
// `entry` = l'entrée du journal d'activité (action='delete') contenant
// l'instantané complet de la ligne dans old_value. L'id numérique (PK) n'est
// jamais réutilisé — Postgres en régénère un ; pour une tâche, id_tache lui
// est préservé, donc les commentaires/temps passé/dépendances déjà rattachés
// à cet id_tache se retrouvent automatiquement reliés après restauration.
export function useRestoreTache() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async (entry: ActivityLog) => {
      if (!entry.old_value) throw new Error('Rien à restaurer pour cette entrée')
      const { table } = entityConfig(entry.entity)
      const { id: _id, ...row } = JSON.parse(entry.old_value) as Record<string, unknown>
      const { error } = await supabase.from(table).insert(row)
      if (error) {
        if (error.code === '23505') throw new Error(`Impossible de restaurer "${entry.title || entry.target}" : un élément identique existe déjà.`)
        throw error
      }
      await logActivity({ produit_id: entry.produit_id, action: 'restore', target: entry.target, title: entry.title, entity: entry.entity ?? undefined })
    },
    onSuccess: (_data, entry) => invalidateEntity(qc, entry.entity, produitActif?.id ?? null),
  })
}

// ── Annuler un changement de champ (page Activité) ───────────────
// `log` = une entrée 'update'/'status' portant field + old_value en JSON.
// Repose sur un update direct (pas les hooks métier) : pas besoin de leurs
// cascades (critère lié, réordonnancement…) pour un simple retour en
// arrière, et ça évite de re-déclencher une logique annexe (popup de
// clôture d'effort…) — annuler ne doit jamais rouvrir ce genre de dialogue.
export function useUndoFieldChange() {
  const qc = useQueryClient()
  const { produitActif } = useProduit()

  return useMutation({
    mutationFn: async (log: ActivityLog) => {
      if (!log.field || log.old_value == null) throw new Error('Rien à annuler pour cette entrée')
      const oldVal = JSON.parse(log.old_value)
      const { table, matchCol, scoped } = entityConfig(log.entity)
      let query = supabase.from(table).update({ [log.field]: oldVal }).eq(matchCol, log.target)
      if (scoped) query = query.eq('produit_id', log.produit_id)
      const { error } = await query
      if (error) throw error
      await logActivity({
        produit_id: log.produit_id, action: 'restore', target: log.target, title: log.title, field: log.field,
        old_value: log.new_value ?? null, new_value: log.old_value, entity: log.entity ?? undefined,
      })
    },
    onSuccess: (_data, log) => invalidateEntity(qc, log.entity, produitActif?.id ?? null),
  })
}
