-- Backlog initial pour le produit D3X V3 : Epics Cost Killing Profileuse /
-- Refendage intégrable / Pli réglable, Conteneurs de sous-systèmes sous Cost
-- Killing, US d'exemple, et exigences de coût (valeur_cible à compléter dans
-- l'appli une fois les chiffres arrêtés). Idempotent (ON CONFLICT DO NOTHING)
-- : rejouable sans créer de doublon.
DO $$
DECLARE
  v_produit_nom text := 'D3X V3';  -- ⚠️ ajuster si le nom exact diffère
  v_produit_id  bigint;
BEGIN
  SELECT id INTO v_produit_id FROM produits WHERE nom = v_produit_nom LIMIT 1;
  IF v_produit_id IS NULL THEN
    RAISE EXCEPTION 'Produit "%" introuvable — corrige v_produit_nom en haut du script', v_produit_nom;
  END IF;

  -- ── Epics ──────────────────────────────────────────────────
  INSERT INTO epics (produit_id, code, nom, couleur, bg_couleur, ordre) VALUES
    (v_produit_id, 'EPIC 1', 'Cost Killing Profileuse', '#DC2626', '#FEE2E2', 1),
    (v_produit_id, 'EPIC 2', 'Refendage intégrable',    '#059669', '#D1FAE5', 2),
    (v_produit_id, 'EPIC 3', 'Pli réglable',            '#2563EB', '#DBEAFE', 3)
  ON CONFLICT (produit_id, code) DO NOTHING;

  -- ── Conteneurs Cost Killing (Epic 1) ─────────────────────────
  -- NB : `taches.id_tache` n'a pas de contrainte UNIQUE en base (contrairement
  -- à `epics`/`dod`) — l'idempotence se fait donc via WHERE NOT EXISTS plutôt
  -- que ON CONFLICT (qui exige un index unique correspondant).
  INSERT INTO taches (id_tache, produit_id, epic, titre, type_tache, statut, effort_j, iteration)
  SELECT v.id_tache, v.produit_id, v.epic, v.titre, v.type_tache, v.statut, v.effort_j, v.iteration
  FROM (VALUES
    ('CK-TRAINS',  v_produit_id, 'EPIC 1 — Cost Killing Profileuse', 'Trains',                 'Conteneur', 'À faire', 0, 1),
    ('CK-SKI',     v_produit_id, 'EPIC 1 — Cost Killing Profileuse', 'Ski central',            'Conteneur', 'À faire', 0, 1),
    ('CK-AVALOIR', v_produit_id, 'EPIC 1 — Cost Killing Profileuse', 'Avaloir',                'Conteneur', 'À faire', 0, 1),
    ('CK-TRANSCH', v_produit_id, 'EPIC 1 — Cost Killing Profileuse', 'Transmission & Châssis',  'Conteneur', 'À faire', 0, 1),
    ('CK-MOTEUR',  v_produit_id, 'EPIC 1 — Cost Killing Profileuse', 'Ensemble Moteur',         'Conteneur', 'À faire', 0, 1),
    ('CK-CARTER',  v_produit_id, 'EPIC 1 — Cost Killing Profileuse', 'Carter',                  'Conteneur', 'À faire', 0, 1)
  ) AS v(id_tache, produit_id, epic, titre, type_tache, statut, effort_j, iteration)
  WHERE NOT EXISTS (SELECT 1 FROM taches t WHERE t.id_tache = v.id_tache);

  -- ── US d'exemple sous chaque Conteneur (effort_j=0 à estimer,
  --    titres à adapter/compléter dans l'appli) ─────────────────
  INSERT INTO taches (id_tache, produit_id, epic, parent_id, titre, type_tache, statut, effort_j, moscow, priorite, iteration)
  SELECT v.id_tache, v.produit_id, v.epic, v.parent_id, v.titre, v.type_tache, v.statut, v.effort_j, v.moscow, v.priorite, v.iteration
  FROM (VALUES
    ('CK-TRAINS-01',  v_produit_id, 'EPIC 1 — Cost Killing Profileuse', 'CK-TRAINS',   'Réduire le nombre de galets / standardiser les axes',   'Tâche', 'À faire', 0, 'Should Have', 'P2', 1),
    ('CK-SKI-01',     v_produit_id, 'EPIC 1 — Cost Killing Profileuse', 'CK-SKI',      'Simplifier la conception du ski central',                 'Tâche', 'À faire', 0, 'Should Have', 'P2', 1),
    ('CK-AVALOIR-01', v_produit_id, 'EPIC 1 — Cost Killing Profileuse', 'CK-AVALOIR',  'Simplifier le système de guidage tôle',                   'Tâche', 'À faire', 0, 'Should Have', 'P2', 1),
    ('CK-TRANSCH-01', v_produit_id, 'EPIC 1 — Cost Killing Profileuse', 'CK-TRANSCH',  'Optimiser la structure châssis (moins de matière)',       'Tâche', 'À faire', 0, 'Should Have', 'P2', 1),
    ('CK-MOTEUR-01',  v_produit_id, 'EPIC 1 — Cost Killing Profileuse', 'CK-MOTEUR',   'Downsizer / standardiser les moteurs',                     'Tâche', 'À faire', 0, 'Should Have', 'P2', 1),
    ('CK-CARTER-01',  v_produit_id, 'EPIC 1 — Cost Killing Profileuse', 'CK-CARTER',   'Simplifier la conception du carter',                       'Tâche', 'À faire', 0, 'Should Have', 'P2', 1)
  ) AS v(id_tache, produit_id, epic, parent_id, titre, type_tache, statut, effort_j, moscow, priorite, iteration)
  WHERE NOT EXISTS (SELECT 1 FROM taches t WHERE t.id_tache = v.id_tache);

  -- ── Epic 2 : Refendage intégrable — US plates (pas de conteneur) ─
  INSERT INTO taches (id_tache, produit_id, epic, titre, type_tache, statut, effort_j, moscow, priorite, iteration)
  SELECT v.id_tache, v.produit_id, v.epic, v.titre, v.type_tache, v.statut, v.effort_j, v.moscow, v.priorite, v.iteration
  FROM (VALUES
    ('REF-01', v_produit_id, 'EPIC 2 — Refendage intégrable', 'Étude de faisabilité mécanique (intégration sur châssis existant)', 'Tâche', 'À faire', 0, 'Must Have',   'P1', 1),
    ('REF-02', v_produit_id, 'EPIC 2 — Refendage intégrable', 'Définir l''interface de commande (mode refendage on/off)',          'Tâche', 'À faire', 0, 'Must Have',   'P2', 1),
    ('REF-03', v_produit_id, 'EPIC 2 — Refendage intégrable', 'Prototype / essai',                                                 'Tâche', 'À faire', 0, 'Should Have', 'P2', 1)
  ) AS v(id_tache, produit_id, epic, titre, type_tache, statut, effort_j, moscow, priorite, iteration)
  WHERE NOT EXISTS (SELECT 1 FROM taches t WHERE t.id_tache = v.id_tache);

  -- ── Epic 3 : Pli réglable — US plates (pas de conteneur) ────
  INSERT INTO taches (id_tache, produit_id, epic, titre, type_tache, statut, effort_j, moscow, priorite, iteration)
  SELECT v.id_tache, v.produit_id, v.epic, v.titre, v.type_tache, v.statut, v.effort_j, v.moscow, v.priorite, v.iteration
  FROM (VALUES
    ('PLI-01', v_produit_id, 'EPIC 3 — Pli réglable', 'Étude cinématique du pli réglable',            'Tâche', 'À faire', 0, 'Must Have',   'P1', 1),
    ('PLI-02', v_produit_id, 'EPIC 3 — Pli réglable', 'Définir la plage de réglage (angle mini/maxi)', 'Tâche', 'À faire', 0, 'Must Have',   'P2', 1),
    ('PLI-03', v_produit_id, 'EPIC 3 — Pli réglable', 'Prototype / essai',                             'Tâche', 'À faire', 0, 'Should Have', 'P2', 1)
  ) AS v(id_tache, produit_id, epic, titre, type_tache, statut, effort_j, moscow, priorite, iteration)
  WHERE NOT EXISTS (SELECT 1 FROM taches t WHERE t.id_tache = v.id_tache);

  -- ── Exigences Cost Killing (type = coût, valeur_cible à
  --    compléter dans l'appli une fois les chiffres arrêtés) ───
  -- NB : `dod.description` est NOT NULL en base (contrairement au type
  -- TS qui l'autorise à null) — on pose une chaîne vide par défaut.
  INSERT INTO dod (produit_id, code, titre, description, categorie, type, criticite, valeur_cible) VALUES
    (v_produit_id, 'F-CK-00', 'Coût total profileuse (objectif global)', '', 'Cost Killing', 'cout', 'haute',   NULL),
    (v_produit_id, 'F-CK-01', 'Coût matière châssis',                     '', 'Cost Killing', 'cout', 'haute',   NULL),
    (v_produit_id, 'F-CK-02', 'Coût motorisation',                        '', 'Cost Killing', 'cout', 'haute',   NULL),
    (v_produit_id, 'F-CK-03', 'Coût automatisme / électrique',            '', 'Cost Killing', 'cout', 'moyenne', NULL)
  ON CONFLICT (produit_id, code) DO NOTHING;

END $$;
