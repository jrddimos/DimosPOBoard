-- Le "code" d'une exigence (`dod.code`) n'est plus saisi à la main : il
-- devient le numéro de position réel ("EX 1.1"), recalculé automatiquement
-- par trigger à chaque changement pertinent (catégorie, ordre, suppression),
-- avec cascade sur `taches.lien_dod` pour que les liens tâche↔exigence
-- restent corrects. Fait côté base (pas depuis le client React) pour rester
-- correct quel que soit le chemin qui modifie les données.
--
-- Recalcule tous les codes du produit selon la position réelle :
--   catégories triées par (ordre, nom) — une exigence dont `categorie` ne
--   correspond à aucune ligne dod_categories rejoint le même compartiment
--   que "sans catégorie" (dernier index), plutôt que d'être ignorée ;
--   puis, dans chaque catégorie, les exigences triées par (ordre, id).
-- Deux passes pour éviter toute collision transitoire sur la contrainte
-- UNIQUE(produit_id, code) quand une insertion/suppression décale des codes :
-- (1) les lignes dont le code change basculent d'abord sur un code temporaire
-- unique par id, (2) cascade sur lien_dod (remplacement du token exact,
-- jamais une sous-chaîne) puis pose du code définitif.
CREATE OR REPLACE FUNCTION recompute_dod_codes(p_produit_id bigint)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
BEGIN
  -- La table temp est réutilisée à chaque appel de la fonction : le backfill
  -- ci-dessous l'invoque une fois par produit dans la même transaction, or
  -- `ON COMMIT DROP` ne la libère qu'en fin de transaction, pas en fin
  -- d'appel — on la droppe donc explicitement avant de la recréer.
  DROP TABLE IF EXISTS _new_codes;
  CREATE TEMP TABLE _new_codes ON COMMIT DROP AS
  WITH cats AS (
    SELECT nom, row_number() OVER (ORDER BY ordre, nom) AS cat_idx
    FROM dod_categories WHERE produit_id = p_produit_id
  ),
  fallback AS (
    SELECT COALESCE((SELECT MAX(cat_idx) FROM cats), 0) + 1 AS idx
  )
  SELECT d.id, d.code AS old_code,
         'EX ' || COALESCE(c.cat_idx, fallback.idx) || '.' ||
           row_number() OVER (PARTITION BY COALESCE(c.cat_idx, fallback.idx) ORDER BY d.ordre, d.id) AS new_code
  FROM dod d
  CROSS JOIN fallback
  LEFT JOIN cats c ON d.categorie = c.nom
  WHERE d.produit_id = p_produit_id;

  -- Phase 1 : place chaque code changé sur une valeur temporaire unique par
  -- id, pour ne jamais entrer en collision avec un code cible pas encore libéré.
  UPDATE dod SET code = 'TMP-' || id
  WHERE id IN (SELECT id FROM _new_codes WHERE new_code IS DISTINCT FROM old_code);

  -- Phase 2 : cascade sur les tâches liées puis pose du code définitif.
  FOR r IN SELECT * FROM _new_codes WHERE new_code IS DISTINCT FROM old_code LOOP
    UPDATE taches t SET lien_dod = (
      SELECT string_agg(CASE WHEN trim(tok) = r.old_code THEN r.new_code ELSE trim(tok) END, ', ')
      FROM unnest(regexp_split_to_array(t.lien_dod, '\s*[,;]\s*')) AS tok
    )
    WHERE t.produit_id = p_produit_id AND t.lien_dod IS NOT NULL
      AND r.old_code = ANY (regexp_split_to_array(t.lien_dod, '\s*[,;]\s*'));

    UPDATE dod SET code = r.new_code WHERE id = r.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION trg_recompute_dod_codes()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM recompute_dod_codes(COALESCE(NEW.produit_id, OLD.produit_id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS dod_recompute_codes_iud ON dod;
CREATE TRIGGER dod_recompute_codes_iud
AFTER INSERT OR DELETE ON dod
FOR EACH ROW EXECUTE FUNCTION trg_recompute_dod_codes();

DROP TRIGGER IF EXISTS dod_recompute_codes_upd ON dod;
CREATE TRIGGER dod_recompute_codes_upd
AFTER UPDATE OF categorie, ordre ON dod
FOR EACH ROW EXECUTE FUNCTION trg_recompute_dod_codes();

DROP TRIGGER IF EXISTS dod_categories_recompute_codes_iud ON dod_categories;
CREATE TRIGGER dod_categories_recompute_codes_iud
AFTER INSERT OR DELETE ON dod_categories
FOR EACH ROW EXECUTE FUNCTION trg_recompute_dod_codes();

DROP TRIGGER IF EXISTS dod_categories_recompute_codes_upd ON dod_categories;
CREATE TRIGGER dod_categories_recompute_codes_upd
AFTER UPDATE OF ordre ON dod_categories
FOR EACH ROW EXECUTE FUNCTION trg_recompute_dod_codes();

-- Backfill : migre immédiatement toutes les exigences existantes (y compris
-- celles du seed 0030) vers le nouveau format, sans attendre une prochaine
-- modification manuelle.
DO $$
DECLARE
  p_id bigint;
BEGIN
  FOR p_id IN SELECT DISTINCT produit_id FROM dod LOOP
    PERFORM recompute_dod_codes(p_id);
  END LOOP;
END;
$$;
