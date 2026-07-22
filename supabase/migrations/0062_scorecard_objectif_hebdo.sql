-- ════════════════════════════════════════════════════════════════
-- 0062 — Scorecard : objectif hebdomadaire qualitatif + statut OK/KO
-- ════════════════════════════════════════════════════════════════
-- Complète le suivi chiffré (cf. 0061) par, pour chaque semaine d'une
-- initiative : ce qui devait être fait ("objectif_texte", ex. "Carto
-- cible, matrices/gammes/base pour kpi") et si ça a été fait ("statut"
-- OK/KO). Une semaine peut porter l'un, l'autre, les deux ou aucun —
-- d'où valeur désormais nullable (une note hebdo peut exister sans
-- cumul chiffré renseigné cette semaine-là).
-- ════════════════════════════════════════════════════════════════

ALTER TABLE scorecard_increments ALTER COLUMN valeur DROP NOT NULL;
ALTER TABLE scorecard_increments ADD COLUMN IF NOT EXISTS objectif_texte text;
ALTER TABLE scorecard_increments ADD COLUMN IF NOT EXISTS statut text CHECK (statut IN ('OK', 'KO'));
