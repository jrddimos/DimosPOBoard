-- Chaque itération a son propre commentaire PO (en plus d'effort/critères/
-- sprint/assigné déjà portés par tache_iterations depuis la migration 0039) :
-- le commentaire de la tâche principale ne doit pas être écrasé/mélangé à
-- chaque reprise du travail.
ALTER TABLE tache_iterations ADD COLUMN IF NOT EXISTS commentaire text;
