-- ════════════════════════════════════════════════════════════════
-- 0057 — Effort d'une US = effort propre + somme des sous-tâches
-- ════════════════════════════════════════════════════════════════
-- Jusqu'ici, `taches.effort_j` d'une US avec sous-tâches contenait la SOMME
-- des sous-tâches, matérialisée silencieusement à chaque sauvegarde du
-- panneau de détail (le formulaire s'initialisait avec effortEffectif) —
-- l'arbre ignorait cette valeur (il resommait), les dashboards la lisaient.
--
-- Nouveau modèle (côté app, même commit) : effort_j = effort PROPRE de l'US,
-- saisissable librement ; le total (propre + sous-tâches) est calculé
-- dynamiquement partout (effortEffectif). Sans ce reset, les anciennes
-- sommes matérialisées seraient comptées double (somme stockée + somme
-- recalculée). On remet donc à zéro l'effort des tâches NON-Conteneur qui
-- ont au moins un enfant : les totaux affichés restent identiques (la somme
-- vient désormais des sous-tâches) ; l'effort propre réel est à ressaisir
-- dans l'appli là où il existe vraiment.
-- Les Conteneurs ne sont pas concernés (effort_j déjà à 0, jamais saisi).
-- ════════════════════════════════════════════════════════════════

UPDATE taches t
SET effort_j = 0
WHERE (t.type_tache IS NULL OR t.type_tache <> 'Conteneur')
  AND COALESCE(t.effort_j, 0) <> 0
  AND EXISTS (
    SELECT 1 FROM taches c
    WHERE c.parent_id = t.id_tache AND c.produit_id = t.produit_id
  );
