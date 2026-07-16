-- Même traitement que Trains (0034/0038/0042) et Ski central (0043),
-- appliqué aux 4 derniers Conteneurs Cost Killing Profileuse (Epic 1) encore
-- au stade "placeholder" du seed initial (0030) : Avaloir, Transmission &
-- Châssis, Ensemble Moteur, Carter.
--
-- Pour chaque sous-ensemble :
--   1. Supprime l'US placeholder générique du seed initial.
--   2. Ajoute les 7 US "process" dans leur forme finale (Analyser → Concevoir
--      les plans → Définir le protocole d'essai → Commander → Tester →
--      Valider → Industrialiser), avec description (US) et critères
--      d'acceptation — même texte que Trains/Ski, adapté au sous-ensemble.
--   3. Ajoute 2 exigences Cost Killing dédiées (coût + non-régression
--      fonctionnelle) et les lie aux US concernées (Analyser → les deux ;
--      Concevoir les plans → non-régression seule ; Valider → les deux).
--
-- ⚠️ Les phrases de "fonction" du sous-ensemble (exigence non-régression) et
-- les sous-ensembles adjacents cités sont une hypothèse raisonnable déduite
-- des titres du seed initial (guidage tôle pour Avaloir, structure/matière
-- pour Châssis, motorisation pour Moteur, protection pour Carter) — à
-- corriger dans l'appli si la réalité mécanique diffère, aucune conséquence
-- si le texte est modifié après coup (pas de logique applicative dessus).
--
-- Conteneurs/exigences retrouvés par titre (pas par ID, cf. 0033/0034).
-- Idempotent : IF NOT EXISTS sur le titre de la 1ère US du lot, par
-- sous-ensemble (une boucle qui saute déjà-fait continue sur les suivants).
DO $$
DECLARE
  v_produit_nom  text := 'D3X V3';
  v_produit_id   bigint;
  v_epic         text := 'EPIC 1 — Cost Killing Profileuse';
  v_item         record;
  v_conteneur_id text;
  v_next         integer;
  v_code_cout    text;
  v_code_fonct   text;
BEGIN
  SELECT id INTO v_produit_id FROM produits WHERE nom = v_produit_nom LIMIT 1;
  IF v_produit_id IS NULL THEN
    RAISE EXCEPTION 'Produit "%" introuvable', v_produit_nom;
  END IF;

  FOR v_item IN
    SELECT * FROM (VALUES
      -- conteneur_titre,             placeholder_titre,                                    fonction_desc,                                                         voisins
      ('Avaloir',                     'Simplifier le système de guidage tôle',
       'sa fonction de guidage de la tôle en entrée de machine',                             'Trains, Ski central'),
      ('Transmission & Châssis',      'Optimiser la structure châssis (moins de matière)',
       'la rigidité structurelle de la machine et la transmission de puissance',              'Ensemble Moteur, Trains'),
      ('Ensemble Moteur',             'Downsizer / standardiser les moteurs',
       'la puissance et le couple disponibles pour l''entraînement',                          'Transmission & Châssis, Trains'),
      ('Carter',                      'Simplifier la conception du carter',
       'sa fonction de protection des organes internes (sécurité, étanchéité)',               'Ensemble Moteur, Transmission & Châssis')
    ) AS t(conteneur_titre, placeholder_titre, fonction_desc, voisins)
  LOOP
    SELECT id_tache INTO v_conteneur_id FROM taches
    WHERE produit_id = v_produit_id AND type_tache = 'Conteneur' AND titre = v_item.conteneur_titre
    LIMIT 1;
    IF v_conteneur_id IS NULL THEN
      RAISE NOTICE 'Conteneur "%" introuvable pour % — ignoré', v_item.conteneur_titre, v_produit_nom;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM taches
      WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
        AND titre = 'Analyser l''étude Cost Killing sur ' || v_item.conteneur_titre
    ) THEN
      RAISE NOTICE 'US déjà présentes sous "%" — rien à faire', v_item.conteneur_titre;
      CONTINUE;
    END IF;

    -- ── 1. Nettoyage du placeholder du seed initial ────────────
    DELETE FROM taches
    WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
      AND titre = v_item.placeholder_titre;

    -- ── 2. Les 7 US process ─────────────────────────────────────
    SELECT COALESCE(MAX(substring(id_tache from 4)::int), 0) INTO v_next
    FROM taches WHERE produit_id = v_produit_id AND id_tache LIKE 'US-%';

    INSERT INTO taches (id_tache, produit_id, epic, parent_id, titre, description, type_tache, statut, effort_j, moscow, priorite, iteration, criteres) VALUES
      ('US-' || lpad((v_next+1)::text, 3, '0'), v_produit_id, v_epic, v_conteneur_id,
       'Analyser l''étude Cost Killing sur ' || v_item.conteneur_titre,
       'En tant que chef de projet Cost Killing, je veux disposer d''une analyse structurée des pistes d''économie sur le sous-ensemble ' || v_item.conteneur_titre || ', afin de prioriser les actions à mener et de chiffrer le gain potentiel avant de lancer les études techniques.',
       'Tâche', 'À faire', 0, 'Should Have', 'P2', 1,
       '[{"id":"c1","text":"Étude existante relue, pistes retenues listées pour ce sous-ensemble","checked":false},'
       '{"id":"c2","text":"Gains potentiels (€, %) recensés par piste","checked":false},'
       '{"id":"c3","text":"Pistes classées par priorité (impact/faisabilité)","checked":false},'
       '{"id":"c4","text":"Pistes non retenues documentées avec la raison du rejet","checked":false}]'),

      ('US-' || lpad((v_next+2)::text, 3, '0'), v_produit_id, v_epic, v_conteneur_id,
       'Concevoir les plans de modification',
       'En tant qu''ingénieur BE, je veux mettre à jour les plans de définition des pièces concernées par les pistes de cost killing retenues sur ' || v_item.conteneur_titre || ', afin de préparer les pièces nécessaires aux essais.',
       'Tâche', 'À faire', 0, 'Should Have', 'P2', 1,
       '[{"id":"c1","text":"Plans de définition mis à jour pour chaque piste retenue","checked":false},'
       '{"id":"c2","text":"Plans validés par le BE","checked":false},'
       '{"id":"c3","text":"Impact sur les autres sous-ensembles (' || v_item.voisins || ') vérifié","checked":false}]'),

      ('US-' || lpad((v_next+3)::text, 3, '0'), v_produit_id, v_epic, v_conteneur_id,
       'Définir le protocole d''essai',
       'En tant qu''ingénieur essais, je veux rédiger le protocole de test des modifications proposées sur ' || v_item.conteneur_titre || ', afin que l''équipe essais sache précisément quoi mesurer et quels critères de réussite appliquer.',
       'Tâche', 'À faire', 0, 'Should Have', 'P2', 1,
       '[{"id":"c1","text":"Protocole d''essai rédigé (quoi tester, critères de réussite, moyens nécessaires)","checked":false},'
       '{"id":"c2","text":"Moyens d''essai (banc, instrumentation) identifiés et disponibles","checked":false},'
       '{"id":"c3","text":"Protocole validé par le responsable essais","checked":false}]'),

      ('US-' || lpad((v_next+4)::text, 3, '0'), v_produit_id, v_epic, v_conteneur_id,
       'Commander les pièces / modifications nécessaires aux essais',
       'En tant que responsable achats/BE, je veux commander les pièces et modifications nécessaires aux essais ' || v_item.conteneur_titre || ', afin de disposer du matériel à temps pour respecter le planning d''essai.',
       'Tâche', 'À faire', 0, 'Should Have', 'P2', 1,
       '[{"id":"c1","text":"Liste des pièces à commander/fabriquer établie","checked":false},'
       '{"id":"c2","text":"Commandes passées (fournisseur, délai confirmé)","checked":false},'
       '{"id":"c3","text":"Budget essai validé","checked":false},'
       '{"id":"c4","text":"Pièces réceptionnées et conformes au plan","checked":false}]'),

      ('US-' || lpad((v_next+5)::text, 3, '0'), v_produit_id, v_epic, v_conteneur_id,
       'Tester les modifications sur banc / prototype',
       'En tant qu''ingénieur essais, je veux exécuter le protocole d''essai défini sur les pièces modifiées de ' || v_item.conteneur_titre || ', afin de vérifier que la modification atteint l''objectif de cost killing sans dégrader la fonction.',
       'Tâche', 'À faire', 0, 'Should Have', 'P2', 1,
       '[{"id":"c1","text":"Essai réalisé selon le protocole défini","checked":false},'
       '{"id":"c2","text":"Résultats mesurés et comparés aux critères de réussite","checked":false},'
       '{"id":"c3","text":"Écarts documentés le cas échéant","checked":false},'
       '{"id":"c4","text":"Rapport d''essai rédigé","checked":false}]'),

      ('US-' || lpad((v_next+6)::text, 3, '0'), v_produit_id, v_epic, v_conteneur_id,
       'Valider la modification',
       'En tant que chef de projet, je veux statuer sur la conformité des résultats d''essai de la modification ' || v_item.conteneur_titre || ', afin de décider si elle peut être industrialisée ou si elle doit être retravaillée.',
       'Tâche', 'À faire', 0, 'Should Have', 'P2', 1,
       '[{"id":"c1","text":"Résultats d''essai jugés conformes (Go/No-Go tracé)","checked":false},'
       '{"id":"c2","text":"Gain réel chiffré (€, poids, temps...) comparé à l''objectif de l''étude","checked":false}]'),

      ('US-' || lpad((v_next+7)::text, 3, '0'), v_produit_id, v_epic, v_conteneur_id,
       'Industrialiser la modification',
       'En tant qu''ingénieur industrialisation, je veux intégrer la modification validée de ' || v_item.conteneur_titre || ' dans le dossier de fabrication série, afin qu''elle soit appliquée sur toutes les prochaines machines produites.',
       'Tâche', 'À faire', 0, 'Should Have', 'P2', 1,
       '[{"id":"c1","text":"Plans définitifs mis à jour","checked":false},'
       '{"id":"c2","text":"Nomenclature série mise à jour","checked":false},'
       '{"id":"c3","text":"Gamme de fabrication/montage mise à jour si impactée","checked":false},'
       '{"id":"c4","text":"Modification intégrée au dossier d''industrialisation","checked":false}]');

    -- ── 3. Exigences Cost Killing dédiées ───────────────────────
    IF NOT EXISTS (SELECT 1 FROM dod WHERE produit_id = v_produit_id AND titre = 'Coût ' || v_item.conteneur_titre) THEN
      INSERT INTO dod (produit_id, code, titre, description, categorie, type, criticite, valeur_cible)
      VALUES (v_produit_id, 'TMP-' || gen_random_uuid(), 'Coût ' || v_item.conteneur_titre,
        'Coût de fabrication du sous-ensemble ' || v_item.conteneur_titre || ' après modification issue du chantier Cost Killing, comparé au coût actuel.',
        'Cost Killing', 'cout', 'haute', NULL);
    END IF;
    SELECT code INTO v_code_cout FROM dod WHERE produit_id = v_produit_id AND titre = 'Coût ' || v_item.conteneur_titre;

    IF NOT EXISTS (SELECT 1 FROM dod WHERE produit_id = v_produit_id AND titre = 'Non-régression fonctionnelle ' || v_item.conteneur_titre) THEN
      INSERT INTO dod (produit_id, code, titre, description, categorie, type, criticite, valeur_cible)
      VALUES (v_produit_id, 'TMP-' || gen_random_uuid(), 'Non-régression fonctionnelle ' || v_item.conteneur_titre,
        'La modification Cost Killing de ' || v_item.conteneur_titre || ' ne doit dégrader ni ' || v_item.fonction_desc || ', ni celle des sous-ensembles adjacents (' || v_item.voisins || ').',
        'Cost Killing', 'fonctionnelle', 'haute', NULL);
    END IF;
    SELECT code INTO v_code_fonct FROM dod WHERE produit_id = v_produit_id AND titre = 'Non-régression fonctionnelle ' || v_item.conteneur_titre;

    UPDATE taches SET lien_dod = trim(both ', ' from concat_ws(', ', NULLIF(lien_dod, ''), v_code_cout, v_code_fonct))
    WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
      AND titre = 'Analyser l''étude Cost Killing sur ' || v_item.conteneur_titre;

    UPDATE taches SET lien_dod = trim(both ', ' from concat_ws(', ', NULLIF(lien_dod, ''), v_code_fonct))
    WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
      AND titre = 'Concevoir les plans de modification'
      AND id_tache = 'US-' || lpad((v_next+2)::text, 3, '0');

    UPDATE taches SET lien_dod = trim(both ', ' from concat_ws(', ', NULLIF(lien_dod, ''), v_code_cout, v_code_fonct))
    WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
      AND titre = 'Valider la modification'
      AND id_tache = 'US-' || lpad((v_next+6)::text, 3, '0');

    RAISE NOTICE '% : 7 US + 2 exigences créées', v_item.conteneur_titre;
  END LOOP;
END $$;
