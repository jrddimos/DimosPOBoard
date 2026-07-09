-- Temps réellement passé sur une itération — nécessaire pour la clôture de
-- sprint : une US non terminée qui bascule vers un autre sprint/le backlog
-- fige son itération courante avec le temps réalisé sur CE sprint, avant de
-- créer l'itération suivante avec le reste à faire (voir
-- useTransferToNextIteration, src/hooks/useTacheIterations.ts).
ALTER TABLE tache_iterations ADD COLUMN IF NOT EXISTS effort_realise_j numeric;
