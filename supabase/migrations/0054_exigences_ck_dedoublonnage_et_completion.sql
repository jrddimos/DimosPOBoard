-- Revue de complétude des exigences Cost Killing après la 0053 :
--
--   1. Dédoublonnage : le seed 0030 posait "Coût matière châssis" et "Coût
--      motorisation", devenues redondantes avec les exigences par
--      sous-ensemble ("Coût Transmission & Châssis", "Coût Ensemble Moteur",
--      0053) — deux exigences pour le même sujet fausseraient la couverture.
--      Supprimées UNIQUEMENT si intactes (aucune US liée, pas de
--      valeur_cible, non vérifiées) ; sinon on les laisse et on le signale
--      (l'utilisateur a commencé à s'en servir, fusion manuelle à décider).
--      "Coût total profileuse (objectif global)" et "Coût automatisme /
--      électrique" sont conservées : la première est l'objectif chapeau, la
--      seconde n'a pas de conteneur dédié.
--
--   2. Couverture de l'objectif global : "Coût total profileuse" n'était
--      liée à aucune US (donc "non couverte" à jamais). Liée aux US
--      "Valider la modification" de chaque sous-ensemble : chaque validation
--      contribue au gain total.
--
--   3. Sécurité Carter : la fonction du Carter est la protection des organes
--      (sécurité machine / conformité CE) — une modification cost killing
--      peut l'impacter. Exigence type 'securite' ajoutée, liée aux US
--      "Concevoir les plans" et "Valider la modification" du Carter.
--
-- Vérifications d'appartenance token-exactes (code = ANY(...)), pas de LIKE :
-- "EX 5.1" est une sous-chaîne de "EX 5.10", un LIKE fausserait le test dès
-- qu'une catégorie dépasse 9 exigences. Idempotent.
DO $$
DECLARE
  v_produit_nom  text := 'D3X V3';
  v_produit_id   bigint;
  v_titre        text;
  v_code         text;
  v_conteneur    text;
  v_conteneur_id text;
BEGIN
  SELECT id INTO v_produit_id FROM produits WHERE nom = v_produit_nom LIMIT 1;
  IF v_produit_id IS NULL THEN
    RAISE EXCEPTION 'Produit "%" introuvable', v_produit_nom;
  END IF;

  -- ── 1. Dédoublonnage des exigences seed redondantes ───────────
  FOREACH v_titre IN ARRAY ARRAY['Coût matière châssis', 'Coût motorisation'] LOOP
    SELECT code INTO v_code FROM dod WHERE produit_id = v_produit_id AND titre = v_titre;
    IF v_code IS NULL THEN
      CONTINUE;  -- déjà supprimée / jamais créée
    END IF;
    IF EXISTS (
      SELECT 1 FROM taches
      WHERE produit_id = v_produit_id AND lien_dod IS NOT NULL
        AND v_code = ANY (regexp_split_to_array(lien_dod, '\s*[,;]\s*'))
    ) OR EXISTS (
      SELECT 1 FROM dod WHERE produit_id = v_produit_id AND titre = v_titre
        AND (valeur_cible IS NOT NULL OR verifiee)
    ) THEN
      RAISE NOTICE '"%" est utilisée (US liée, valeur cible ou vérifiée) — non supprimée, fusion manuelle à décider avec son équivalente par sous-ensemble', v_titre;
    ELSE
      DELETE FROM dod WHERE produit_id = v_produit_id AND titre = v_titre;
      RAISE NOTICE '"%" supprimée (doublon du référentiel par sous-ensemble, jamais utilisée)', v_titre;
    END IF;
  END LOOP;

  -- ── 2. Lier l'objectif global aux validations de chaque sous-ensemble ──
  SELECT code INTO v_code FROM dod
  WHERE produit_id = v_produit_id AND titre = 'Coût total profileuse (objectif global)';
  IF v_code IS NOT NULL THEN
    FOREACH v_conteneur IN ARRAY ARRAY['Trains', 'Ski central', 'Avaloir', 'Transmission & Châssis', 'Ensemble Moteur', 'Carter'] LOOP
      SELECT id_tache INTO v_conteneur_id FROM taches
      WHERE produit_id = v_produit_id AND type_tache = 'Conteneur' AND titre = v_conteneur
      LIMIT 1;
      IF v_conteneur_id IS NULL THEN CONTINUE; END IF;

      UPDATE taches SET lien_dod = trim(both ', ' from concat_ws(', ', NULLIF(lien_dod, ''), v_code))
      WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
        AND titre = 'Valider la modification'
        AND (lien_dod IS NULL OR NOT (v_code = ANY (regexp_split_to_array(lien_dod, '\s*[,;]\s*'))));
    END LOOP;
    RAISE NOTICE 'Objectif global "%" lié aux US "Valider la modification"', v_code;
  END IF;

  -- ── 3. Exigence sécurité pour le Carter ───────────────────────
  SELECT id_tache INTO v_conteneur_id FROM taches
  WHERE produit_id = v_produit_id AND type_tache = 'Conteneur' AND titre = 'Carter'
  LIMIT 1;
  IF v_conteneur_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM dod WHERE produit_id = v_produit_id AND titre = 'Conformité sécurité & CE du Carter') THEN
      INSERT INTO dod (produit_id, code, titre, description, categorie, type, criticite, valeur_cible)
      VALUES (v_produit_id, 'TMP-' || gen_random_uuid(), 'Conformité sécurité & CE du Carter',
        'Le Carter assure la protection des organes internes : toute modification cost killing doit maintenir le niveau de sécurité machine (protection des personnes, accès aux organes en mouvement) et la conformité CE de la profileuse.',
        'Cost Killing', 'securite', 'haute', NULL);
    END IF;
    SELECT code INTO v_code FROM dod WHERE produit_id = v_produit_id AND titre = 'Conformité sécurité & CE du Carter';

    UPDATE taches SET lien_dod = trim(both ', ' from concat_ws(', ', NULLIF(lien_dod, ''), v_code))
    WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
      AND titre IN ('Concevoir les plans de modification', 'Valider la modification')
      AND (lien_dod IS NULL OR NOT (v_code = ANY (regexp_split_to_array(lien_dod, '\s*[,;]\s*'))));
    RAISE NOTICE 'Exigence sécurité Carter "%" créée et liée', v_code;
  END IF;
END $$;
