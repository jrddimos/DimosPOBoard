-- ════════════════════════════════════════════════════════════════
-- 0012 — Durcissement sécurité (audit du 2026-07-03)
-- ════════════════════════════════════════════════════════════════
--
-- 1. update_pending_profile_data existait déjà en prod (créée à la
--    main via le dashboard, jamais versionnée) SANS AUCUN contrôle
--    d'autorisation : n'importe quel utilisateur authentifié pouvait
--    l'appeler pour se donner role_global = 'admin' sur une invitation
--    en attente → escalade de privilège. On la recrée ici avec le
--    garde-fou is_admin() et on la documente enfin dans une migration.
--
-- 2. tache_temps_update : le WITH CHECK ne validait que user_id, pas
--    produit_id/id_tache — un utilisateur pouvait rattacher sa propre
--    ligne de temps à un produit auquel il n'a pas accès en écriture.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_pending_profile_data(p_id bigint, p_data jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  UPDATE pending_profiles SET
    display_name          = COALESCE(p_data->>'display_name', display_name),
    trigramme              = CASE WHEN p_data ? 'trigramme' THEN p_data->>'trigramme' ELSE trigramme END,
    prenom                 = CASE WHEN p_data ? 'prenom' THEN p_data->>'prenom' ELSE prenom END,
    nom                    = CASE WHEN p_data ? 'nom' THEN p_data->>'nom' ELSE nom END,
    couleur                = CASE WHEN p_data ? 'couleur' THEN p_data->>'couleur' ELSE couleur END,
    role_global            = CASE WHEN p_data ? 'role_global' THEN p_data->>'role_global' ELSE role_global END,
    equipe_ids             = CASE WHEN p_data ? 'equipe_ids' THEN ARRAY(SELECT jsonb_array_elements_text(p_data->'equipe_ids'))::bigint[] ELSE equipe_ids END,
    pending_produit_ids    = CASE WHEN p_data ? 'pending_produit_ids' THEN ARRAY(SELECT jsonb_array_elements_text(p_data->'pending_produit_ids'))::bigint[] ELSE pending_produit_ids END,
    pending_produit_roles  = CASE WHEN p_data ? 'pending_produit_roles' THEN p_data->'pending_produit_roles' ELSE pending_produit_roles END
  WHERE id = p_id;
END;
$$;

DROP POLICY IF EXISTS "tache_temps_update" ON tache_temps;
CREATE POLICY "tache_temps_update" ON tache_temps FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND can_write(produit_id));
