-- Ajoute 'restore' aux valeurs autorisées pour activite.action — nécessaire
-- pour tracer la restauration d'une tâche (ou l'annulation d'un champ)
-- depuis la page Activité, distincte d'une simple création manuelle.
ALTER TABLE activite DROP CONSTRAINT IF EXISTS activite_action_check;
ALTER TABLE activite ADD CONSTRAINT activite_action_check
  CHECK (action IN ('create', 'update', 'delete', 'status', 'restore'));
