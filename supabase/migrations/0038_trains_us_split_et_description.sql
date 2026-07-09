-- Amélioration qualité des US "Trains" (Epic Cost Killing Profileuse,
-- créées par la migration 0034) :
--   1. Ajoute la description User Story ("En tant que... je veux... afin
--      de...") sur les 5 US existantes, absente jusqu'ici.
--   2. Découpe les 2 US trop larges (mélangeant deux activités de nature/
--      charge différentes) en 2 US distinctes chacune :
--      - "Concevoir les plans... / définir le protocole d'essai"
--        → "Concevoir les plans de modification" (renommée, recentrée)
--        + "Définir le protocole d'essai" (nouvelle US)
--      - "Valider et industrialiser la modification"
--        → "Valider la modification" (renommée, recentrée)
--        + "Industrialiser la modification" (nouvelle US)
--
-- Toutes les US sont retrouvées par TITRE (pas par ID, cf. migration 0033 —
-- les ID US-XXX ne sont pas prévisibles statiquement) ; les nouvelles US
-- continuent la numérotation US-XXX existante. Idempotent : les UPDATE ne
-- font rien si le titre a déjà été changé par un run précédent, et les
-- INSERT sont gardés par un IF NOT EXISTS sur le titre cible.
DO $$
DECLARE
  v_produit_nom  text := 'D3X V3';
  v_produit_id   bigint;
  v_conteneur_id text;
  v_epic         text;
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

  SELECT epic INTO v_epic FROM taches
  WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
  LIMIT 1;
  IF v_epic IS NULL THEN
    RAISE EXCEPTION 'Aucune US existante sous "Trains" pour déduire l''Epic';
  END IF;

  -- ── 1. Analyser l'étude Cost Killing sur Trains ──────────────
  UPDATE taches SET description =
    'En tant que chef de projet Cost Killing, je veux disposer d''une analyse structurée des pistes d''économie sur le sous-ensemble Trains, afin de prioriser les actions à mener et de chiffrer le gain potentiel avant de lancer les études techniques.'
  WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
    AND titre = 'Analyser l''étude Cost Killing sur Trains';

  -- ── 2. Split : conception vs protocole d'essai ───────────────
  UPDATE taches SET
    titre = 'Concevoir les plans de modification',
    description = 'En tant qu''ingénieur BE, je veux mettre à jour les plans de définition des pièces concernées par les pistes de cost killing retenues, afin de préparer les pièces nécessaires aux essais.',
    criteres =
      '[{"id":"c1","text":"Plans de définition mis à jour pour chaque piste retenue","checked":false},'
      '{"id":"c2","text":"Plans validés par le BE","checked":false},'
      '{"id":"c3","text":"Impact sur les autres sous-ensembles (Ski, Avaloir...) vérifié","checked":false}]'
  WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
    AND titre = 'Concevoir les plans de modification / définir le protocole d''essai';

  IF NOT EXISTS (
    SELECT 1 FROM taches WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
      AND titre = 'Définir le protocole d''essai'
  ) THEN
    SELECT COALESCE(MAX(substring(id_tache from 4)::int), 0) + 1 INTO v_next
    FROM taches WHERE produit_id = v_produit_id AND id_tache LIKE 'US-%';

    INSERT INTO taches (id_tache, produit_id, epic, parent_id, titre, description, type_tache, statut, effort_j, moscow, priorite, iteration, criteres) VALUES
      ('US-' || lpad(v_next::text, 3, '0'), v_produit_id, v_epic, v_conteneur_id,
       'Définir le protocole d''essai',
       'En tant qu''ingénieur essais, je veux rédiger le protocole de test des modifications proposées sur Trains, afin que l''équipe essais sache précisément quoi mesurer et quels critères de réussite appliquer.',
       'Tâche', 'À faire', 0, 'Should Have', 'P2', 1,
       '[{"id":"c1","text":"Protocole d''essai rédigé (quoi tester, critères de réussite, moyens nécessaires)","checked":false},'
       '{"id":"c2","text":"Moyens d''essai (banc, instrumentation) identifiés et disponibles","checked":false},'
       '{"id":"c3","text":"Protocole validé par le responsable essais","checked":false}]');
  END IF;

  -- ── 3. Commander les pièces / modifications nécessaires aux essais ──
  UPDATE taches SET description =
    'En tant que responsable achats/BE, je veux commander les pièces et modifications nécessaires aux essais Trains, afin de disposer du matériel à temps pour respecter le planning d''essai.'
  WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
    AND titre = 'Commander les pièces / modifications nécessaires aux essais';

  -- ── 4. Tester les modifications sur banc / prototype ─────────
  UPDATE taches SET description =
    'En tant qu''ingénieur essais, je veux exécuter le protocole d''essai défini sur les pièces modifiées, afin de vérifier que la modification atteint l''objectif de cost killing sans dégrader la fonction.'
  WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
    AND titre = 'Tester les modifications sur banc / prototype';

  -- ── 5. Split : validation vs industrialisation ───────────────
  UPDATE taches SET
    titre = 'Valider la modification',
    description = 'En tant que chef de projet, je veux statuer sur la conformité des résultats d''essai de la modification Trains, afin de décider si elle peut être industrialisée ou si elle doit être retravaillée.',
    criteres =
      '[{"id":"c1","text":"Résultats d''essai jugés conformes (Go/No-Go tracé)","checked":false},'
      '{"id":"c2","text":"Gain réel chiffré (€, poids, temps...) comparé à l''objectif de l''étude","checked":false}]'
  WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
    AND titre = 'Valider et industrialiser la modification';

  IF NOT EXISTS (
    SELECT 1 FROM taches WHERE produit_id = v_produit_id AND parent_id = v_conteneur_id
      AND titre = 'Industrialiser la modification'
  ) THEN
    SELECT COALESCE(MAX(substring(id_tache from 4)::int), 0) + 1 INTO v_next
    FROM taches WHERE produit_id = v_produit_id AND id_tache LIKE 'US-%';

    INSERT INTO taches (id_tache, produit_id, epic, parent_id, titre, description, type_tache, statut, effort_j, moscow, priorite, iteration, criteres) VALUES
      ('US-' || lpad(v_next::text, 3, '0'), v_produit_id, v_epic, v_conteneur_id,
       'Industrialiser la modification',
       'En tant qu''ingénieur industrialisation, je veux intégrer la modification validée dans le dossier de fabrication série, afin qu''elle soit appliquée sur toutes les prochaines machines produites.',
       'Tâche', 'À faire', 0, 'Should Have', 'P2', 1,
       '[{"id":"c1","text":"Plans définitifs mis à jour","checked":false},'
       '{"id":"c2","text":"Nomenclature série mise à jour","checked":false},'
       '{"id":"c3","text":"Gamme de fabrication/montage mise à jour si impactée","checked":false},'
       '{"id":"c4","text":"Modification intégrée au dossier d''industrialisation","checked":false}]');
  END IF;
END $$;
