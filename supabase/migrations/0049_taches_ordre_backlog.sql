-- ════════════════════════════════════════════════════════════════
-- 0049 — Ordre manuel des tâches dans le backlog
-- ════════════════════════════════════════════════════════════════
-- Permet de réorganiser les US/Conteneurs par glisser-déposer dans le
-- backlog : la numérotation d'affichage (1.1, 1.2…) découle de l'ordre
-- des tâches dans leur Epic, ce champ le matérialise (pas de 10 entre
-- valeurs). NULL = jamais réordonnée manuellement → classée après les
-- ordonnées, par id_tache (comportement historique).
-- Distinct d'ordre_kanban (0025) qui trie les colonnes du Sprint Board.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE taches ADD COLUMN IF NOT EXISTS ordre_backlog integer;
