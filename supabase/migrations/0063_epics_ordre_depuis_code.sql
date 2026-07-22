-- ════════════════════════════════════════════════════════════════
-- 0063 — Resynchronise epics.ordre sur le numéro du code
-- ════════════════════════════════════════════════════════════════
-- Bug corrigé côté appli : renommer le "N°" d'un Epic (ex: "EPIC 2" →
-- "EPIC 5") ne mettait à jour QUE le champ `code`, jamais `ordre` — or
-- c'est `ordre` qui pilote le tri des Epics (epics.select().order('ordre')
-- .order('code')) et donc la numérotation "1.1, 2.3…" des US
-- (computeTacheNumbers, basée sur la POSITION dans la liste, pas sur le
-- texte du code). Résultat : après un renommage, les tâches gardaient
-- l'ancien numéro affiché malgré le nouveau code — sur tous les produits
-- où un Epic a un jour été renuméroté via l'appli, pas seulement EOLE.
--
-- Cette migration réaligne une bonne fois `ordre` sur le numéro déjà
-- affiché dans `code` pour tous les Epics existants ; les futurs
-- renommages restent cohérents grâce au correctif côté code
-- (SetupPage.tsx changeNum / useEpics.ts useCreateEpic).
-- ════════════════════════════════════════════════════════════════

UPDATE epics
SET ordre = COALESCE((regexp_match(code, '\d+'))[1]::int, 0);
