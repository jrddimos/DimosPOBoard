-- La contrainte UNIQUE(id_tache, numero) posée par la migration 0039 est
-- globale : comme id_tache n'est unique que PAR PRODUIT (UNIQUE(produit_id,
-- id_tache), migration 0037), deux produits ayant chacun une tâche "US-007"
-- ne pourraient jamais avoir chacun leur propre "itération 1" — le second à
-- créer buterait sur la ligne du premier. On la remplace par une contrainte
-- scopée par produit.
ALTER TABLE tache_iterations DROP CONSTRAINT IF EXISTS tache_iterations_id_tache_numero_key;
ALTER TABLE tache_iterations ADD CONSTRAINT tache_iterations_produit_id_tache_numero_key UNIQUE (produit_id, id_tache, numero);
