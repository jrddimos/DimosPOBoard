-- Template d'import de nouvelles US pour D3X V3. Les ID sont générés
-- dynamiquement en continuant la numérotation US-XXX existante (même
-- logique que useCreateTache / migrations 0033-0034) — pas besoin de fixer
-- le numéro de départ à la main, même s'il s'agit aujourd'hui de US-007.
--
-- Mode d'emploi :
-- 1. Dans le bloc VALUES ci-dessous, une ligne par tâche à créer :
--      (epic, parent_titre, titre, moscow, priorite, effort_j, criteres)
--    - epic : le libellé COMPLET tel qu'affiché dans l'appli, ex.
--      'EPIC 1 — Cost Killing Profileuse'
--    - parent_titre : le TITRE du Conteneur parent (ex. 'Trains'), ou NULL
--      si c'est une US racine (pas rattachée à un Conteneur)
--    - moscow : 'Must Have' / 'Should Have' / 'Could Have' / 'Won''t Have'
--    - priorite : 'P1' / 'P2' / 'P3' / 'P4'
--    - criteres : JSON '[{"id":"c1","text":"...","checked":false}, ...]',
--      ou NULL si pas de critères à cette étape
-- 2. Dupliquer/adapter autant de lignes que nécessaire (2 lignes d'exemple
--    ci-dessous, à remplacer).
-- 3. Lancer le script dans le SQL Editor Supabase.
--
-- ⚠️ Ce script n'est PAS idempotent (contrairement aux migrations
-- précédentes) : le rejouer dupliquerait les tâches avec de nouveaux ID.
-- Si besoin de le relancer, retirer d'abord les lignes déjà importées.
DO $$
DECLARE
  v_produit_nom text := 'D3X V3';
  v_produit_id  bigint;
  v_next        integer;
  v_parent_id   text;
  v_new_id      text;
  r             RECORD;
BEGIN
  SELECT id INTO v_produit_id FROM produits WHERE nom = v_produit_nom LIMIT 1;
  IF v_produit_id IS NULL THEN
    RAISE EXCEPTION 'Produit "%" introuvable', v_produit_nom;
  END IF;

  SELECT COALESCE(MAX(substring(id_tache from 4)::int), 0) INTO v_next
  FROM taches WHERE produit_id = v_produit_id AND id_tache LIKE 'US-%';

  FOR r IN
    SELECT * FROM (VALUES
      -- ⬇⬇⬇ À COMPLÉTER : une ligne par tâche ⬇⬇⬇
      ('EPIC 1 — Cost Killing Profileuse'::text, 'Trains'::text, 'Exemple : titre de la tâche'::text,
       'Should Have'::text, 'P2'::text, 0::numeric,
       '[{"id":"c1","text":"Critère 1","checked":false},{"id":"c2","text":"Critère 2","checked":false}]'::text),
      ('EPIC 2 — Refendage intégrable', NULL, 'Exemple : US racine (pas de Conteneur)',
       'Must Have', 'P1', 2,
       NULL)
      -- ⬆⬆⬆ Ajouter/adapter autant de lignes que nécessaire ⬆⬆⬆
    ) AS v(epic, parent_titre, titre, moscow, priorite, effort_j, criteres)
  LOOP
    v_parent_id := NULL;
    IF r.parent_titre IS NOT NULL THEN
      SELECT id_tache INTO v_parent_id FROM taches
      WHERE produit_id = v_produit_id AND type_tache = 'Conteneur' AND titre = r.parent_titre
      LIMIT 1;
      IF v_parent_id IS NULL THEN
        RAISE EXCEPTION 'Conteneur "%" introuvable pour la tâche "%"', r.parent_titre, r.titre;
      END IF;
    END IF;

    v_next := v_next + 1;
    v_new_id := 'US-' || lpad(v_next::text, 3, '0');

    INSERT INTO taches (id_tache, produit_id, epic, parent_id, titre, type_tache, statut, effort_j, moscow, priorite, iteration, criteres)
    VALUES (v_new_id, v_produit_id, r.epic, v_parent_id, r.titre, 'Tâche', 'À faire', r.effort_j, r.moscow, r.priorite, 1, r.criteres);
  END LOOP;
END $$;
