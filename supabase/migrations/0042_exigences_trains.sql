-- Exigences Cost Killing pour le sous-ensemble Trains (Epic Cost Killing
-- Profileuse, Conteneur "Trains", US créées par les migrations 0034/0038) :
-- jusqu'ici les 4 exigences de coût seedées par la migration 0030 couvraient
-- Châssis/Motorisation/Automatisme/objectif global, mais aucune n'était
-- spécifique aux Trains, et aucune US Trains n'était liée à une exigence
-- (`lien_dod` vide).
--
-- Deux exigences ajoutées, même style que les 4 existantes (catégorie "Cost
-- Killing", valeur_cible à compléter dans l'appli une fois les chiffres
-- arrêtés) :
--   - Coût Train de galets (type coût) : l'objectif chiffré du chantier.
--   - Non-régression fonctionnelle Train de galets (type fonctionnelle) :
--     garde-fou déjà présent dans les critères des US ("Impact sur les
--     autres sous-ensembles vérifié", "Résultats d'essai jugés conformes").
--
-- Codes non fixés à la main : posés par le trigger recompute_dod_codes
-- (migration 0031) juste après l'INSERT, relus ensuite pour construire
-- lien_dod. Idempotent (IF NOT EXISTS sur le titre de l'exigence / le lien).
DO $$
DECLARE
  v_produit_nom   text := 'D3X V3';
  v_produit_id    bigint;
  v_conteneur_id  text;
  v_code_cout     text;
  v_code_fonct    text;
BEGIN
  SELECT id INTO v_produit_id FROM produits WHERE nom = v_produit_nom LIMIT 1;
  IF v_produit_id IS NULL THEN
    RAISE EXCEPTION 'Produit "%" introuvable', v_produit_nom;
  END IF;

  SELECT id_tache INTO v_conteneur_id FROM taches
  WHERE produit_id = v_produit_id AND type_tache = 'Conteneur' AND titre = 'Trains'
  LIMIT 1;
  IF v_conteneur_id IS NULL THEN
    RAISE EXCEPTION 'Conteneur "Trains" introuvable pour %', v_produit_nom;
  END IF;

  -- ── Exigence coût ────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM dod WHERE produit_id = v_produit_id AND titre = 'Coût Train de galets'
  ) THEN
    INSERT INTO dod (produit_id, code, titre, description, categorie, type, criticite, valeur_cible)
    VALUES (v_produit_id, 'TMP-' || gen_random_uuid(), 'Coût Train de galets',
      'Coût de fabrication du Train de galets après modification issue du chantier Cost Killing, comparé au coût actuel.',
      'Cost Killing', 'cout', 'haute', NULL);
  END IF;
  SELECT code INTO v_code_cout FROM dod WHERE produit_id = v_produit_id AND titre = 'Coût Train de galets';

  -- ── Exigence fonctionnelle (non-régression) ──────────────────
  IF NOT EXISTS (
    SELECT 1 FROM dod WHERE produit_id = v_produit_id AND titre = 'Non-régression fonctionnelle Train de galets'
  ) THEN
    INSERT INTO dod (produit_id, code, titre, description, categorie, type, criticite, valeur_cible)
    VALUES (v_produit_id, 'TMP-' || gen_random_uuid(), 'Non-régression fonctionnelle Train de galets',
      'La modification Cost Killing du Train de galets ne doit dégrader ni sa fonction de guidage/entraînement, ni celle des sous-ensembles adjacents (Ski, Avaloir).',
      'Cost Killing', 'fonctionnelle', 'haute', NULL);
  END IF;
  SELECT code INTO v_code_fonct FROM dod WHERE produit_id = v_produit_id AND titre = 'Non-régression fonctionnelle Train de galets';

  -- ── Liens US ↔ exigences (lien_dod), sans écraser un lien existant ──
  -- Analyser l'étude : fixe l'objectif de coût, encadré par la non-régression.
  UPDATE taches SET lien_dod = trim(both ', ' from concat_ws(', ', NULLIF(lien_dod, ''), v_code_cout, v_code_fonct))
  WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
    AND titre = 'Analyser l''étude Cost Killing sur Trains'
    AND (lien_dod IS NULL OR (lien_dod NOT LIKE '%' || v_code_cout || '%' AND lien_dod NOT LIKE '%' || v_code_fonct || '%'));

  -- Concevoir les plans : c'est ici que l'impact sur les sous-ensembles adjacents est vérifié.
  UPDATE taches SET lien_dod = trim(both ', ' from concat_ws(', ', NULLIF(lien_dod, ''), v_code_fonct))
  WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
    AND titre = 'Concevoir les plans de modification'
    AND (lien_dod IS NULL OR lien_dod NOT LIKE '%' || v_code_fonct || '%');

  -- Valider la modification : confirme le gain chiffré ET la non-régression.
  UPDATE taches SET lien_dod = trim(both ', ' from concat_ws(', ', NULLIF(lien_dod, ''), v_code_cout, v_code_fonct))
  WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
    AND titre = 'Valider la modification'
    AND (lien_dod IS NULL OR (lien_dod NOT LIKE '%' || v_code_cout || '%' AND lien_dod NOT LIKE '%' || v_code_fonct || '%'));
END $$;
