-- ════════════════════════════════════════════════════════════════
-- 0050 — Origine d'une itération : reprise de sprint vs nouvelle boucle
-- ════════════════════════════════════════════════════════════════
-- Deux mécanismes créent des lignes tache_iterations, jusqu'ici
-- indiscernables une fois en base :
--  - 'sprint'  : useTransferToNextIteration, à la clôture d'un sprint sur
--                une tâche non terminée — reste à faire, mêmes critères.
--  - 'rework'  : useCreateIteration, création manuelle depuis le backlog —
--                nouvelle boucle agile avec son propre objectif.
--  - 'initial' : première ligne, figée rétroactivement (état de la tâche
--                avant sa toute première itération), peu importe le
--                mécanisme qui l'a déclenchée.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE tache_iterations ADD COLUMN IF NOT EXISTS origine text NOT NULL DEFAULT 'rework'
  CHECK (origine IN ('initial', 'sprint', 'rework'));
