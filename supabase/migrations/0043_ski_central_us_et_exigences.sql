-- Même traitement que Trains (migrations 0034/0038/0042), appliqué au
-- Conteneur "Ski central" (Epic 1 — Cost Killing Profileuse) :
--   1. Supprime l'US placeholder du seed initial (0030 : "Simplifier la
--      conception du ski central", générique, sans description ni vrais
--      critères).
--   2. Ajoute les 7 US "process" directement dans leur forme finale/scindée
--      (celle qu'on a obtenue pour Trains après la migration 0038, pas
--      l'étape intermédiaire à 5 US de la 0034).
--   3. Ajoute 2 exigences Cost Killing dédiées (coût + non-régression
--      fonctionnelle) et les lie aux US concernées — même règle que Trains :
--      Analyser → les deux ; Concevoir les plans → non-régression seule ;
--      Valider → les deux.
--
-- Conteneur/exigences retrouvés par titre (pas par ID, cf. 0033/0034).
-- Idempotent : IF NOT EXISTS sur le titre de la 1ère US du lot / de chaque
-- exigence.
DO $$
DECLARE
  v_produit_nom   text := 'D3X V3';
  v_produit_id    bigint;
  v_conteneur_id  text;
  v_epic          text := 'EPIC 1 — Cost Killing Profileuse';
  v_next          integer;
  v_code_cout     text;
  v_code_fonct    text;
BEGIN
  SELECT id INTO v_produit_id FROM produits WHERE nom = v_produit_nom LIMIT 1;
  IF v_produit_id IS NULL THEN
    RAISE EXCEPTION 'Produit "%" introuvable', v_produit_nom;
  END IF;

  SELECT id_tache INTO v_conteneur_id FROM taches
  WHERE produit_id = v_produit_id AND type_tache = 'Conteneur' AND titre = 'Ski central'
  LIMIT 1;
  IF v_conteneur_id IS NULL THEN
    RAISE EXCEPTION 'Conteneur "Ski central" introuvable pour %', v_produit_nom;
  END IF;

  IF EXISTS (
    SELECT 1 FROM taches
    WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
      AND titre = 'Analyser l''étude Cost Killing sur Ski central'
  ) THEN
    RAISE NOTICE 'US déjà présentes sous Ski central — rien à faire';
    RETURN;
  END IF;

  -- ── 1. Nettoyage du placeholder du seed initial ──────────────
  DELETE FROM taches
  WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
    AND titre = 'Simplifier la conception du ski central';

  -- ── 2. Les 7 US process ───────────────────────────────────────
  SELECT COALESCE(MAX(substring(id_tache from 4)::int), 0) INTO v_next
  FROM taches WHERE produit_id = v_produit_id AND id_tache LIKE 'US-%';

  INSERT INTO taches (id_tache, produit_id, epic, parent_id, titre, description, type_tache, statut, effort_j, moscow, priorite, iteration, criteres) VALUES
    ('US-' || lpad((v_next+1)::text, 3, '0'), v_produit_id, v_epic, v_conteneur_id,
     'Analyser l''étude Cost Killing sur Ski central',
     'En tant que chef de projet Cost Killing, je veux disposer d''une analyse structurée des pistes d''économie sur le sous-ensemble Ski central, afin de prioriser les actions à mener et de chiffrer le gain potentiel avant de lancer les études techniques.',
     'Tâche', 'À faire', 0, 'Should Have', 'P2', 1,
     '[{"id":"c1","text":"Étude existante relue, pistes retenues listées pour ce sous-ensemble","checked":false},'
     '{"id":"c2","text":"Gains potentiels (€, %) recensés par piste","checked":false},'
     '{"id":"c3","text":"Pistes classées par priorité (impact/faisabilité)","checked":false},'
     '{"id":"c4","text":"Pistes non retenues documentées avec la raison du rejet","checked":false}]'),

    ('US-' || lpad((v_next+2)::text, 3, '0'), v_produit_id, v_epic, v_conteneur_id,
     'Concevoir les plans de modification',
     'En tant qu''ingénieur BE, je veux mettre à jour les plans de définition des pièces concernées par les pistes de cost killing retenues, afin de préparer les pièces nécessaires aux essais.',
     'Tâche', 'À faire', 0, 'Should Have', 'P2', 1,
     '[{"id":"c1","text":"Plans de définition mis à jour pour chaque piste retenue","checked":false},'
     '{"id":"c2","text":"Plans validés par le BE","checked":false},'
     '{"id":"c3","text":"Impact sur les autres sous-ensembles (Trains, Avaloir...) vérifié","checked":false}]'),

    ('US-' || lpad((v_next+3)::text, 3, '0'), v_produit_id, v_epic, v_conteneur_id,
     'Définir le protocole d''essai',
     'En tant qu''ingénieur essais, je veux rédiger le protocole de test des modifications proposées sur Ski central, afin que l''équipe essais sache précisément quoi mesurer et quels critères de réussite appliquer.',
     'Tâche', 'À faire', 0, 'Should Have', 'P2', 1,
     '[{"id":"c1","text":"Protocole d''essai rédigé (quoi tester, critères de réussite, moyens nécessaires)","checked":false},'
     '{"id":"c2","text":"Moyens d''essai (banc, instrumentation) identifiés et disponibles","checked":false},'
     '{"id":"c3","text":"Protocole validé par le responsable essais","checked":false}]'),

    ('US-' || lpad((v_next+4)::text, 3, '0'), v_produit_id, v_epic, v_conteneur_id,
     'Commander les pièces / modifications nécessaires aux essais',
     'En tant que responsable achats/BE, je veux commander les pièces et modifications nécessaires aux essais Ski central, afin de disposer du matériel à temps pour respecter le planning d''essai.',
     'Tâche', 'À faire', 0, 'Should Have', 'P2', 1,
     '[{"id":"c1","text":"Liste des pièces à commander/fabriquer établie","checked":false},'
     '{"id":"c2","text":"Commandes passées (fournisseur, délai confirmé)","checked":false},'
     '{"id":"c3","text":"Budget essai validé","checked":false},'
     '{"id":"c4","text":"Pièces réceptionnées et conformes au plan","checked":false}]'),

    ('US-' || lpad((v_next+5)::text, 3, '0'), v_produit_id, v_epic, v_conteneur_id,
     'Tester les modifications sur banc / prototype',
     'En tant qu''ingénieur essais, je veux exécuter le protocole d''essai défini sur les pièces modifiées, afin de vérifier que la modification atteint l''objectif de cost killing sans dégrader la fonction.',
     'Tâche', 'À faire', 0, 'Should Have', 'P2', 1,
     '[{"id":"c1","text":"Essai réalisé selon le protocole défini","checked":false},'
     '{"id":"c2","text":"Résultats mesurés et comparés aux critères de réussite","checked":false},'
     '{"id":"c3","text":"Écarts documentés le cas échéant","checked":false},'
     '{"id":"c4","text":"Rapport d''essai rédigé","checked":false}]'),

    ('US-' || lpad((v_next+6)::text, 3, '0'), v_produit_id, v_epic, v_conteneur_id,
     'Valider la modification',
     'En tant que chef de projet, je veux statuer sur la conformité des résultats d''essai de la modification Ski central, afin de décider si elle peut être industrialisée ou si elle doit être retravaillée.',
     'Tâche', 'À faire', 0, 'Should Have', 'P2', 1,
     '[{"id":"c1","text":"Résultats d''essai jugés conformes (Go/No-Go tracé)","checked":false},'
     '{"id":"c2","text":"Gain réel chiffré (€, poids, temps...) comparé à l''objectif de l''étude","checked":false}]'),

    ('US-' || lpad((v_next+7)::text, 3, '0'), v_produit_id, v_epic, v_conteneur_id,
     'Industrialiser la modification',
     'En tant qu''ingénieur industrialisation, je veux intégrer la modification validée dans le dossier de fabrication série, afin qu''elle soit appliquée sur toutes les prochaines machines produites.',
     'Tâche', 'À faire', 0, 'Should Have', 'P2', 1,
     '[{"id":"c1","text":"Plans définitifs mis à jour","checked":false},'
     '{"id":"c2","text":"Nomenclature série mise à jour","checked":false},'
     '{"id":"c3","text":"Gamme de fabrication/montage mise à jour si impactée","checked":false},'
     '{"id":"c4","text":"Modification intégrée au dossier d''industrialisation","checked":false}]');

  -- ── 3. Exigences Cost Killing dédiées ─────────────────────────
  IF NOT EXISTS (SELECT 1 FROM dod WHERE produit_id = v_produit_id AND titre = 'Coût Ski central') THEN
    INSERT INTO dod (produit_id, code, titre, description, categorie, type, criticite, valeur_cible)
    VALUES (v_produit_id, 'TMP-' || gen_random_uuid(), 'Coût Ski central',
      'Coût de fabrication du Ski central après modification issue du chantier Cost Killing, comparé au coût actuel.',
      'Cost Killing', 'cout', 'haute', NULL);
  END IF;
  SELECT code INTO v_code_cout FROM dod WHERE produit_id = v_produit_id AND titre = 'Coût Ski central';

  IF NOT EXISTS (SELECT 1 FROM dod WHERE produit_id = v_produit_id AND titre = 'Non-régression fonctionnelle Ski central') THEN
    INSERT INTO dod (produit_id, code, titre, description, categorie, type, criticite, valeur_cible)
    VALUES (v_produit_id, 'TMP-' || gen_random_uuid(), 'Non-régression fonctionnelle Ski central',
      'La modification Cost Killing du Ski central ne doit dégrader ni sa fonction de guidage de la chute, ni celle des sous-ensembles adjacents (Trains, Avaloir).',
      'Cost Killing', 'fonctionnelle', 'haute', NULL);
  END IF;
  SELECT code INTO v_code_fonct FROM dod WHERE produit_id = v_produit_id AND titre = 'Non-régression fonctionnelle Ski central';

  UPDATE taches SET lien_dod = trim(both ', ' from concat_ws(', ', NULLIF(lien_dod, ''), v_code_cout, v_code_fonct))
  WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
    AND titre = 'Analyser l''étude Cost Killing sur Ski central';

  UPDATE taches SET lien_dod = trim(both ', ' from concat_ws(', ', NULLIF(lien_dod, ''), v_code_fonct))
  WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
    AND titre = 'Concevoir les plans de modification';

  UPDATE taches SET lien_dod = trim(both ', ' from concat_ws(', ', NULLIF(lien_dod, ''), v_code_cout, v_code_fonct))
  WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
    AND titre = 'Valider la modification';
END $$;
