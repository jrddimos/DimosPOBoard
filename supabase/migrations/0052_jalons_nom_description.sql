-- ════════════════════════════════════════════════════════════════
-- 0052 — Jalons - Incréments majeurs : nom et description obligatoires
-- ════════════════════════════════════════════════════════════════
-- Jusqu'ici un Jalon n'avait qu'un code ("I1"), pas de nom ni de
-- description — contrairement aux Epics qui ont déjà code + nom
-- (migration 0027). Un Jalon a désormais, comme un Epic :
--   - un numéro unique (code, déjà garanti par jalons_produit_id_code_key)
--   - un nom (texte court)
--   - une description (texte libre)
-- Backfill : nom hérite du code existant (rien de mieux à proposer
-- automatiquement), description reste vide — à compléter par le PO,
-- l'app affiche un indice visuel tant que ce n'est pas fait.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE jalons ADD COLUMN IF NOT EXISTS nom text;
ALTER TABLE jalons ADD COLUMN IF NOT EXISTS description text;

UPDATE jalons SET nom = code WHERE nom IS NULL;
UPDATE jalons SET description = '' WHERE description IS NULL;

ALTER TABLE jalons ALTER COLUMN nom SET NOT NULL;
ALTER TABLE jalons ALTER COLUMN nom SET DEFAULT '';
ALTER TABLE jalons ALTER COLUMN description SET NOT NULL;
ALTER TABLE jalons ALTER COLUMN description SET DEFAULT '';
