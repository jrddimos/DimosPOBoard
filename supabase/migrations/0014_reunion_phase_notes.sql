-- ════════════════════════════════════════════════════════════════
-- 0014 — Persiste le texte saisi par phase dans la réunion PO
-- ════════════════════════════════════════════════════════════════
-- Le texte tapé dans les phases "Synchro opérationnelle", "Rituels
-- & process" et "Wrap-up" n'était conservé qu'en état local React —
-- jamais sauvegardé ni rechargé. On ajoute une colonne jsonb pour
-- les 4 phases (index 0 = Revues produits, non utilisé côté texte
-- libre mais gardé pour un index stable avec PHASES côté front).
-- ════════════════════════════════════════════════════════════════

ALTER TABLE reunions ADD COLUMN IF NOT EXISTS phase_notes jsonb NOT NULL DEFAULT '["","","",""]'::jsonb;
