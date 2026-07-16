-- ════════════════════════════════════════════════════════════════
-- 0051 — Sous-tâche liée à un critère d'acceptation de la tâche parente
-- ════════════════════════════════════════════════════════════════
-- critere_lie_id référence l'id (chaîne libre générée côté client, cf.
-- parseCriteres) d'un item de la checklist "criteres" du PARENT — pas de
-- clé étrangère possible, les critères vivent dans un blob JSON, pas une
-- table. Quand toutes les sous-tâches liées à un même critère passent à
-- "Fait", ce critère est automatiquement coché sur le parent (cascade dans
-- useUpdateTache) — jamais l'inverse, une sous-tâche Fait n'est pas rouverte
-- (une nouvelle itération de la tâche prend le relais à la place).
-- ════════════════════════════════════════════════════════════════

ALTER TABLE taches ADD COLUMN IF NOT EXISTS critere_lie_id text;
