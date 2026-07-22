-- ════════════════════════════════════════════════════════════════
-- 0066 — Verrouillage des réunions terminées
-- ════════════════════════════════════════════════════════════════
-- "Terminer la réunion" (page /reunions/:id) marque désormais la réunion
-- comme terminée plutôt que de simplement sauvegarder — une fois terminée,
-- son contenu (objectifs, notes, actions, risques…) devient lecture seule
-- pour tout le monde, sauf pour un admin qui peut déverrouiller
-- temporairement via un cadenas côté front (sans jamais toucher à
-- date_reunion, qui reste celle d'origine).

ALTER TABLE reunions ADD COLUMN IF NOT EXISTS terminee boolean NOT NULL DEFAULT false;
