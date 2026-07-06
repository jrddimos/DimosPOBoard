-- ════════════════════════════════════════════════════════════════
-- 0025 — Ordre manuel des tâches dans une colonne du Sprint Board
-- ════════════════════════════════════════════════════════════════
-- Permet de prioriser visuellement l'ordre des tâches à l'intérieur
-- d'une même colonne (statut) par glisser-déposer, en plus du
-- changement de colonne déjà existant.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE taches ADD COLUMN IF NOT EXISTS ordre_kanban integer;
