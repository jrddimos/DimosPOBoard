-- ════════════════════════════════════════════════════════════════
-- RPC add_action_lop — envoyer une quick note vers la LOP d'un produit
-- ════════════════════════════════════════════════════════════════
--
-- CONTEXTE
-- Le bouton "Envoyer vers LOP produit" (panneau Points à traiter)
-- écrivait directement sur `produits.actions_lop` via un simple
-- UPDATE. Or la policy `produits_update` (0001_enable_rls.sql)
-- restreint l'écriture sur `produits` aux admins uniquement — donc
-- un PO ou un dev voyait le bouton mais l'envoi échouait
-- silencieusement (403 RLS, aucune erreur affichée).
--
-- Plutôt que d'ouvrir toute la table `produits` (vision, budget,
-- objectifs…) en écriture aux PO/dev, cette RPC SECURITY DEFINER
-- n'autorise que l'ajout ciblé d'une action à `actions_lop`, avec
-- son propre contrôle d'accès : can_write() = admin + PO + dev.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION add_action_lop(p_produit_id bigint, p_action jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT can_write(p_produit_id) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  UPDATE produits
  SET actions_lop = COALESCE(actions_lop, '[]'::jsonb) || jsonb_build_array(p_action)
  WHERE id = p_produit_id;
END;
$$;
