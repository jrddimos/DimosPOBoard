-- ════════════════════════════════════════════════════════════════
-- 0065 — Section "Objectifs de la réunion" (type Avancement projet)
-- ════════════════════════════════════════════════════════════════
-- Remplace le premier bloc de la réunion "Avancement projet" (note libre
-- "jalons") par une checklist d'objectifs de la réunion (comme des
-- critères d'acceptation) — nouvel ordre des sections : objectifs, notes,
-- actions, risques. `sections_data.objectifs` est un nouveau tableau
-- {id, texte, checked}[], stocké comme les autres sections dans le même
-- jsonb générique (pas de colonne dédiée nécessaire).

UPDATE reunion_types
SET sections = '["objectifs","notes","actions","risques"]'::jsonb
WHERE nom = 'Avancement projet';
