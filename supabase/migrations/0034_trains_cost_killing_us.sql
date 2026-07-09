-- Ajoute 5 US "process" (Analyse de l'étude Cost Killing → Plans/protocole
-- d'essai → Commande → Test → Validation/industrialisation) sous le
-- Conteneur "Trains" (Epic 1 — Cost Killing Profileuse) de D3X V3, avec leurs
-- critères d'acceptation.
--
-- `criteres` est stocké en JSON (format attendu par parseCriteres/
-- serializeCriteres, src/lib/utils.ts : [{id,text,checked}]) — pas du texte
-- libre ligne à ligne.
--
-- Le Conteneur "Trains" est retrouvé par titre (et non par ID) car ses ID ont
-- été renommés en US-XXX par la migration 0033 et ne sont plus prévisibles
-- statiquement. Les nouveaux ID continuent la même numérotation US-XXX
-- (même logique que useCreateTache / 0033), pour rester dans l'unique
-- convention d'ID du produit.
DO $$
DECLARE
  v_produit_nom  text := 'D3X V3';
  v_produit_id   bigint;
  v_conteneur_id text;
  v_epic         text := 'EPIC 1 — Cost Killing Profileuse';
  v_next         integer;
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

  SELECT COALESCE(MAX(substring(id_tache from 4)::int), 0) INTO v_next
  FROM taches WHERE produit_id = v_produit_id AND id_tache LIKE 'US-%';

  -- Idempotence simple : si ces 5 titres existent déjà sous ce Conteneur, on
  -- ne réinsère rien (évite les doublons si la migration est rejouée).
  IF EXISTS (
    SELECT 1 FROM taches
    WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
      AND titre = 'Analyser l''étude Cost Killing sur Trains'
  ) THEN
    RAISE NOTICE 'US déjà présentes sous Trains — rien à faire';
    RETURN;
  END IF;

  INSERT INTO taches (id_tache, produit_id, epic, parent_id, titre, type_tache, statut, effort_j, moscow, priorite, iteration, criteres) VALUES
    ('US-' || lpad((v_next+1)::text, 3, '0'), v_produit_id, v_epic, v_conteneur_id,
     'Analyser l''étude Cost Killing sur Trains', 'Tâche', 'À faire', 0, 'Should Have', 'P2', 1,
     '[{"id":"c1","text":"Étude existante relue, pistes retenues listées pour ce sous-ensemble","checked":false},'
     '{"id":"c2","text":"Gains potentiels (€, %) recensés par piste","checked":false},'
     '{"id":"c3","text":"Pistes classées par priorité (impact/faisabilité)","checked":false},'
     '{"id":"c4","text":"Pistes non retenues documentées avec la raison du rejet","checked":false}]'),

    ('US-' || lpad((v_next+2)::text, 3, '0'), v_produit_id, v_epic, v_conteneur_id,
     'Concevoir les plans de modification / définir le protocole d''essai', 'Tâche', 'À faire', 0, 'Should Have', 'P2', 1,
     '[{"id":"c1","text":"Plans de définition mis à jour pour chaque piste retenue","checked":false},'
     '{"id":"c2","text":"Protocole d''essai rédigé (quoi tester, critères de réussite, moyens nécessaires)","checked":false},'
     '{"id":"c3","text":"Plans validés par le BE","checked":false},'
     '{"id":"c4","text":"Impact sur les autres sous-ensembles vérifié","checked":false}]'),

    ('US-' || lpad((v_next+3)::text, 3, '0'), v_produit_id, v_epic, v_conteneur_id,
     'Commander les pièces / modifications nécessaires aux essais', 'Tâche', 'À faire', 0, 'Should Have', 'P2', 1,
     '[{"id":"c1","text":"Liste des pièces à commander/fabriquer établie","checked":false},'
     '{"id":"c2","text":"Commandes passées (fournisseur, délai confirmé)","checked":false},'
     '{"id":"c3","text":"Budget essai validé","checked":false},'
     '{"id":"c4","text":"Pièces réceptionnées et conformes au plan","checked":false}]'),

    ('US-' || lpad((v_next+4)::text, 3, '0'), v_produit_id, v_epic, v_conteneur_id,
     'Tester les modifications sur banc / prototype', 'Tâche', 'À faire', 0, 'Should Have', 'P2', 1,
     '[{"id":"c1","text":"Essai réalisé selon le protocole défini","checked":false},'
     '{"id":"c2","text":"Résultats mesurés et comparés aux critères de réussite","checked":false},'
     '{"id":"c3","text":"Écarts documentés le cas échéant","checked":false},'
     '{"id":"c4","text":"Rapport d''essai rédigé","checked":false}]'),

    ('US-' || lpad((v_next+5)::text, 3, '0'), v_produit_id, v_epic, v_conteneur_id,
     'Valider et industrialiser la modification', 'Tâche', 'À faire', 0, 'Should Have', 'P2', 1,
     '[{"id":"c1","text":"Résultats d''essai jugés conformes (Go/No-Go tracé)","checked":false},'
     '{"id":"c2","text":"Plans définitifs mis à jour","checked":false},'
     '{"id":"c3","text":"Gain réel chiffré (€, poids, temps...) comparé à l''objectif de l''étude","checked":false},'
     '{"id":"c4","text":"Modification intégrée au dossier d''industrialisation / nomenclature série","checked":false}]');
END $$;
