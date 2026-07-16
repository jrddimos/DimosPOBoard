-- ════════════════════════════════════════════════════════════════
-- 0056 — Exigences : description optionnelle
-- ════════════════════════════════════════════════════════════════
-- `dod.description` était NOT NULL en base alors que tout le reste la
-- traite comme optionnelle : le type TS (`string | null`), le formulaire
-- (placeholder "Optionnel…") et son payload (`description: desc || null`).
-- Résultat : créer ou enregistrer une exigence en laissant la description
-- vide échouait (violation 23502). Les migrations de seed contournaient
-- déjà le problème en insérant '' (cf. note dans 0030) — preuve que la
-- contrainte ne correspondait pas à l'usage réel.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE dod ALTER COLUMN description DROP NOT NULL;
