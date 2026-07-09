-- Uniformise la convention d'ID de tâche sur D3X V3 : l'appli génère déjà
-- automatiquement "US-001", "US-002"... à chaque création de tâche (Conteneur
-- ou US, sur TOUS les produits — voir useCreateTache). Le seed 0030 avait au
-- contraire utilisé des ID "parlants" custom (CK-TRAINS, CK-TRAINS-01,
-- REF-01, PLI-01...), ce qui crée deux conventions différentes sur le même
-- produit. On renomme donc ces ID custom vers le format US-XXX, en
-- continuant la numérotation là où l'appli s'arrêterait elle-même (même
-- logique que useCreateTache : max des "US-%" existants + 1).
--
-- Cascade sur toutes les tables qui référencent id_tache en texte libre
-- (parent_id, commentaires, pièces jointes, temps passé, dépendances,
-- activité, notifications) pour ne rien casser. Idempotent : une fois les ID
-- renommés, il n'y a plus d'ID "NOT LIKE 'US-%'" à traiter, donc rejouable
-- sans effet sur un second passage.
DO $$
DECLARE
  v_produit_nom text := 'D3X V3';
  v_produit_id  bigint;
  v_next        integer;
  r             RECORD;
BEGIN
  SELECT id INTO v_produit_id FROM produits WHERE nom = v_produit_nom LIMIT 1;
  IF v_produit_id IS NULL THEN
    RAISE EXCEPTION 'Produit "%" introuvable', v_produit_nom;
  END IF;

  SELECT COALESCE(MAX(substring(id_tache from 4)::int), 0) + 1 INTO v_next
  FROM taches WHERE produit_id = v_produit_id AND id_tache LIKE 'US-%';

  CREATE TEMP TABLE _id_map ON COMMIT DROP AS
  SELECT id_tache AS old_id,
         'US-' || lpad((v_next + row_number() OVER (ORDER BY id) - 1)::text, 3, '0') AS new_id
  FROM taches
  WHERE produit_id = v_produit_id AND id_tache NOT LIKE 'US-%';

  FOR r IN SELECT * FROM _id_map LOOP
    UPDATE taches SET parent_id = r.new_id WHERE produit_id = v_produit_id AND parent_id = r.old_id;
    UPDATE taches SET id_tache  = r.new_id WHERE produit_id = v_produit_id AND id_tache  = r.old_id;

    UPDATE tache_commentaires SET id_tache = r.new_id WHERE produit_id = v_produit_id AND id_tache = r.old_id;
    UPDATE tache_attachments  SET id_tache = r.new_id WHERE produit_id = v_produit_id AND id_tache = r.old_id;
    UPDATE tache_temps        SET id_tache = r.new_id WHERE produit_id = v_produit_id AND id_tache = r.old_id;
    UPDATE tache_dependances  SET bloque_id  = r.new_id WHERE produit_id = v_produit_id AND bloque_id  = r.old_id;
    UPDATE tache_dependances  SET bloquee_id = r.new_id WHERE produit_id = v_produit_id AND bloquee_id = r.old_id;
    UPDATE activite       SET target = r.new_id WHERE produit_id = v_produit_id AND target = r.old_id;
    UPDATE notifications  SET target = r.new_id WHERE produit_id = v_produit_id AND target = r.old_id;
  END LOOP;

  RAISE NOTICE '% ID renommés vers le format US-XXX', (SELECT count(*) FROM _id_map);
END $$;
