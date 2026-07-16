-- Intégration de l'étude Cost Killing réelle (fichier "250304 - liste pièce
-- achat Dipro 3x", feuilles data / Cost Killing VS Alignement) dans le
-- backlog D3X V3 :
--
--   1. 18 sous-tâches concrètes (actions "à faire" de l'étude, consolidées :
--      doublons "idem au-dessus" fusionnés, ~30 galets regroupés en une
--      action, lignes "Rien à faire"/"NA"/hors périmètre exclues) créées
--      sous les US process des conteneurs concernés. Les 3 actions carter
--      sont rattachées au conteneur "Carter" (l'étude les classait dans
--      "Train" mais leur objet est le carter). Ski central : aucune action
--      (l'étude dit "Rien à faire" — PR 38,56 €, cohérent).
--      Convention sous-tâche : id_tache = '<id_US>.N', parent_id = id_US
--      (cf. useCreateSousTache) ; US parente retrouvée par (conteneur,
--      titre), jamais par ID (cf. 0033).
--
--   2. valeur_cible des exigences de coût renseignées avec les chiffres de
--      l'étude (PR baseline par sous-ensemble, objectif global : gain
--      4 000 € / PR cible 4 877 € vs PR initial 8 877 €) — uniquement si
--      encore NULL, pour ne jamais écraser une saisie faite dans l'appli.
--
-- Idempotent : IF NOT EXISTS sur (US parente, titre de sous-tâche).
DO $$
DECLARE
  v_produit_nom text := 'D3X V3';
  v_produit_id  bigint;
  v_item        record;
  v_cont_id     text;
  v_us          record;
  v_us_titre    text;
  v_next        integer;
BEGIN
  SELECT id INTO v_produit_id FROM produits WHERE nom = v_produit_nom LIMIT 1;
  IF v_produit_id IS NULL THEN
    RAISE EXCEPTION 'Produit "%" introuvable', v_produit_nom;
  END IF;

  -- ── 1. Sous-tâches issues de l'étude ──────────────────────────
  FOR v_item IN
    SELECT * FROM (VALUES
      -- conteneur,                us_cle ('analyser'|'concevoir'|'commander'), titre sous-tâche, description (détail pièces/fournisseurs de l'étude)
      ('Trains', 'analyser',
       'Étudier matière / quantité / traitement / poids des galets',
       'Environ 30 références de galets (fixes et mobiles, sup/inf, A à G) marquées "à étudier matière quantité traitement solution poids dimensionnel" dans l''étude. Étudier globalement : matière, quantités commandées, traitement de surface, poids/dimensionnel.'),
      ('Trains', 'analyser',
       'Comparer galet alu vs acier + traitement (ASM2)',
       'Réf. 086484 Galet_Ent_Alu_Inf : comparer avec un galet acier + traitement, à voir avec ASM2 (fournisseur actuel, MOQ 260, PU 38,50 €).'),
      ('Trains', 'analyser',
       'Benchmark train commun type Jouanel',
       'Remarque de l''étude : Jouanel utilise un train commun sur au moins 3 machines (80-100 machines/an) — évaluer la transposition Dimos.'),
      ('Trains', 'concevoir',
       'Passer les pignons en standard MISUMI/Jouanel et chiffrer',
       'Réf. 086416 (pignon 20 dents galet), 086417 (20 dents transmission), 086666 (40 dents) : passer sur du standard MISUMI / Jouanel, vérifier la dureté, puis chiffrer.'),
      ('Trains', 'concevoir',
       'Rails fixe/mobile en tôle pliée inox + chiffrage ROBIN',
       'Réf. 086527 / 086526 (ensembles rail fixe et mobile) : concevoir un système en tôle pliée (inox ou tôle peinte) — Simetal s''est révélé plus cher que ROBIN. Chiffrer le rail latéral inox chez ROBIN.'),
      ('Trains', 'commander',
       'Consultation pays low-cost des blocs alu (enchère inversée)',
       'Réf. 086505 / 086506 (blocs alu train fixe et mobile assemblés) : consultation pays low-cost (enchère inversée ou autre) — MECADYNAMIC, nuances 2017/6060 à explorer. Passer de 40 à 60 pièces n''a pas eu d''effet sur le prix.'),

      ('Carter', 'concevoir',
       'Boîte sans PEHD : 2D + 3D + consultation',
       'Réf. 086653 / 086654 (carters sup fixe et mobile équipés) : obtenir le prix d''une boîte sans PEHD — faire les plans 2D + 3D puis consulter. Simetal plus cher que ROBIN.'),
      ('Carter', 'concevoir',
       'Carter arrière train : dessiner + chiffrage ROBIN',
       'Réf. 086655 (carter arrière pour train fixe et mobile) : dessiner et faire chiffrer par ROBIN.'),
      ('Carter', 'concevoir',
       'Supprimer l''ajourage du carter inférieur femelle fixe',
       'Réf. 086652 (carter inférieur femelle fixe) : supprimer l''ajourage pour simplifier la fabrication.'),

      ('Ensemble Moteur', 'concevoir',
       'Boîtier électrique standard (interne vs externalisation, contacter RR)',
       'Réf. 086677 (kit électrique équipé 110/230V 0,75 kW mono, PU 825 €) : remplacer le boîtier électrique par un boîtier standard — gain "très élevé" selon l''étude. Évaluer compétence DIMOS interne vs externalisation (Jean-Félix, Monnier, RR France ?). Contacter RR pour un boîtier directement monté sur moto-réducteur.'),

      ('Avaloir', 'concevoir',
       'Reconception avaloirs fixe + mobile type Jouanel/Schlebach',
       'Réf. 086500 / 086499 (avaloirs fixe et mobile DIPRO 3x, PU 409,32 €) : reconception type Jouanel / Schlebach. Baseline connue : Simetal 188,27 € + transport 50 €.'),
      ('Avaloir', 'commander',
       'Re-consultation fournisseurs avaloirs (ROBIN / SOFRAPI)',
       'Dessiner et faire chiffrer les avaloirs par ROBIN / SOFRAPI, re-consulter le fournisseur actuel.'),

      ('Transmission & Châssis', 'concevoir',
       'Poursuivre le design to cost châssis (Simetal)',
       'Réf. 086501 (châssis vissé) : design to cost déjà entamé (suppression du surfaçage, gain acquis 18,59 €) — poursuivre avec Simetal, moins-value tôle usinée.'),
      ('Transmission & Châssis', 'analyser',
       'Ré-étudier la fonction supports axe / palier',
       'Réf. 086502 (supports axe équipés G+D) / 086504 (support palier mobile équipé) : ré-étudier la fonction chez DIMOS, vérifier les solutions techniques avec le fournisseur usineur. Décomposition prix déjà obtenue.'),
      ('Transmission & Châssis', 'analyser',
       'Chiffrer axe + palier Jouanel vs équivalence DIMOS (ASM2)',
       'Réf. 086503 (transmission châssis) : chiffrer axe + palier "type Jouanel" versus l''équivalence DIMOS, à voir avec ASM2. Châssis désormais chez SIMETAL, pignonnerie chez NUMEC.'),
      ('Transmission & Châssis', 'concevoir',
       'Moteur non démontable : supprimer le support moteur (-12 €)',
       'Comme Jouanel : moteur non démontable, ce qui supprime le support moteur (pièce SIMETAL, gain estimé 12 €).'),
      ('Transmission & Châssis', 'concevoir',
       'Standardiser les roulements (pas de SKF)',
       'Réf. 100112 / 100113 (roulements à billes Øint 15 et 20) : passer sur des roulements identiques standard (pas SKF).'),
      ('Transmission & Châssis', 'concevoir',
       'Translation : rail type Jouanel + dégrader la fonction paliers',
       'Réf. 086448 (axe épaulé Ø30), 100114/100116 (paliers à semelle avec serrage G+D), 100117 (bride d''arbre Ø30) : chiffrer un rail "type Jouanel", dégrader la fonction des paliers (supprimer l''effet "waouh"), regarder l''état de surface MISUMI.')
    ) AS t(conteneur, us_cle, titre, description)
  LOOP
    SELECT id_tache INTO v_cont_id FROM taches
    WHERE produit_id = v_produit_id AND type_tache = 'Conteneur' AND titre = v_item.conteneur
    LIMIT 1;
    IF v_cont_id IS NULL THEN
      RAISE NOTICE 'Conteneur "%" introuvable — sous-tâche "%" ignorée', v_item.conteneur, v_item.titre;
      CONTINUE;
    END IF;

    v_us_titre := CASE v_item.us_cle
      WHEN 'analyser'  THEN 'Analyser l''étude Cost Killing sur ' || v_item.conteneur
      WHEN 'concevoir' THEN 'Concevoir les plans de modification'
      WHEN 'commander' THEN 'Commander les pièces / modifications nécessaires aux essais'
    END;

    SELECT id_tache, epic INTO v_us FROM taches
    WHERE produit_id = v_produit_id AND parent_id = v_cont_id AND titre = v_us_titre
    LIMIT 1;
    IF v_us.id_tache IS NULL THEN
      RAISE NOTICE 'US "%" introuvable sous "%" — sous-tâche "%" ignorée (jouer 0053 d''abord ?)', v_us_titre, v_item.conteneur, v_item.titre;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM taches
      WHERE produit_id = v_produit_id AND parent_id = v_us.id_tache AND titre = v_item.titre
    ) THEN
      CONTINUE;  -- déjà créée (rejeu)
    END IF;

    SELECT COALESCE(MAX(split_part(id_tache, '.', 2)::int), 0) + 1 INTO v_next
    FROM taches
    WHERE produit_id = v_produit_id AND id_tache LIKE v_us.id_tache || '.%';

    INSERT INTO taches (id_tache, produit_id, epic, parent_id, titre, description, type_tache, statut, effort_j, moscow, priorite, iteration)
    VALUES (v_us.id_tache || '.' || v_next, v_produit_id, v_us.epic, v_us.id_tache,
            v_item.titre, v_item.description, 'Tâche', 'À faire', 0, 'Should Have', 'P2', 1);
  END LOOP;

  -- ── 2. valeur_cible des exigences (chiffres de l'étude, si NULL) ──
  UPDATE dod SET valeur_cible = 'PR cible 4 877 € (objectif gain 4 000 € vs PR initial 8 877 €)'
  WHERE produit_id = v_produit_id AND titre = 'Coût total profileuse (objectif global)' AND valeur_cible IS NULL;

  UPDATE dod SET valeur_cible = 'Baseline étude : Train mobile 2 360 € + Train fixe 2 648 € = 5 008 €'
  WHERE produit_id = v_produit_id AND titre = 'Coût Train de galets' AND valeur_cible IS NULL;

  UPDATE dod SET valeur_cible = 'Baseline étude : 1 519 € (086645) / 1 479 € (086651)'
  WHERE produit_id = v_produit_id AND titre = 'Coût Ensemble Moteur' AND valeur_cible IS NULL;

  UPDATE dod SET valeur_cible = 'Baseline étude : ensemble châssis 1 344 €'
  WHERE produit_id = v_produit_id AND titre = 'Coût Transmission & Châssis' AND valeur_cible IS NULL;

  UPDATE dod SET valeur_cible = 'Baseline étude : 38,56 € (étude : "rien à faire" sur ce sous-ensemble)'
  WHERE produit_id = v_produit_id AND titre = 'Coût Ski central' AND valeur_cible IS NULL;

  UPDATE dod SET valeur_cible = 'Baseline étude : 409,32 € l''avaloir fixe (mobile similaire) — Simetal consulté : 188,27 € + 50 € transport'
  WHERE produit_id = v_produit_id AND titre = 'Coût Avaloir' AND valeur_cible IS NULL;

  RAISE NOTICE 'Sous-tâches de l''étude Cost Killing intégrées, valeurs cibles renseignées';
END $$;
