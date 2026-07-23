-- `entity` distingue la table réellement visée par une entrée d'activité —
-- jusqu'ici toutes les entrées de logActivity concernaient des tâches
-- (target = id_tache), mais useDod.ts journalise aussi le coche/décoche
-- d'un critère (target = code DoD, pas un id_tache). Sans cette colonne,
-- "Annuler" depuis la page Activité tentait à tort de mettre à jour la table
-- `taches` pour une entrée DoD. NULL = comportement historique (tâche),
-- pas de backfill nécessaire.
ALTER TABLE activite ADD COLUMN IF NOT EXISTS entity text;
