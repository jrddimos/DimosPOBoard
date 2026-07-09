-- Corrige les Epics de D3X V3 : la migration 0027 avait fait un backfill
-- générique de 13 Epics (EPIC 1 "Architecture & CDC", EPIC 2 "Avaloir", ...)
-- sur tous les produits, y compris D3X V3 — donc quand 0030 a ensuite tenté
-- d'insérer EPIC 1/2/3 = Cost Killing / Refendage / Pli réglable, le code
-- existait déjà et ON CONFLICT DO NOTHING a ignoré l'insertion. Les tâches du
-- seed 0030 référencent bien le texte "EPIC 1 — Cost Killing Profileuse" etc.,
-- mais aucune ligne `epics` ne porte ce nom → elles restaient invisibles dans
-- le menu déroulant et l'arbre "Par Epic".
--
-- Cette migration : (1) renomme EPIC 1/2/3 avec les vrais noms/couleurs
-- attendus par le seed, (2) supprime les 10 autres Epics génériques
-- (EPIC 4 à EPIC 13) qui ne servent à rien sur ce produit — en vérifiant
-- d'abord qu'aucune tâche ne les référence, pour ne rien orpheliner.
-- Idempotent : rejouable sans risque.
DO $$
DECLARE
  v_produit_nom text := 'D3X V3';
  v_produit_id  bigint;
  v_orphelines  text;
BEGIN
  SELECT id INTO v_produit_id FROM produits WHERE nom = v_produit_nom LIMIT 1;
  IF v_produit_id IS NULL THEN
    RAISE EXCEPTION 'Produit "%" introuvable', v_produit_nom;
  END IF;

  -- ── Renommage EPIC 1/2/3 ─────────────────────────────────────
  UPDATE epics SET nom = 'Cost Killing Profileuse', couleur = '#DC2626', bg_couleur = '#FEE2E2'
  WHERE produit_id = v_produit_id AND code = 'EPIC 1';

  UPDATE epics SET nom = 'Refendage intégrable', couleur = '#059669', bg_couleur = '#D1FAE5'
  WHERE produit_id = v_produit_id AND code = 'EPIC 2';

  UPDATE epics SET nom = 'Pli réglable', couleur = '#2563EB', bg_couleur = '#DBEAFE'
  WHERE produit_id = v_produit_id AND code = 'EPIC 3';

  -- ── Suppression des Epics génériques inutilisés (4 à 13) ─────
  -- Garde-fou : si une tâche référence encore l'un d'eux (texte "EPIC N — ..."),
  -- on ne supprime rien et on prévient plutôt que d'orpheliner des tâches.
  SELECT string_agg(DISTINCT t.epic, ', ') INTO v_orphelines
  FROM taches t
  JOIN epics e ON e.produit_id = t.produit_id AND t.epic = (e.code || ' — ' || e.nom)
  WHERE e.produit_id = v_produit_id AND e.code IN
    ('EPIC 4','EPIC 5','EPIC 6','EPIC 7','EPIC 8','EPIC 9','EPIC 10','EPIC 11','EPIC 12','EPIC 13');

  IF v_orphelines IS NOT NULL THEN
    RAISE NOTICE 'Epics génériques NON supprimés car référencés par des tâches : %', v_orphelines;
  ELSE
    DELETE FROM epics WHERE produit_id = v_produit_id AND code IN
      ('EPIC 4','EPIC 5','EPIC 6','EPIC 7','EPIC 8','EPIC 9','EPIC 10','EPIC 11','EPIC 12','EPIC 13');
  END IF;
END $$;
