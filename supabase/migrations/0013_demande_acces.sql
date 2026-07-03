-- ════════════════════════════════════════════════════════════════
-- 0013 — Demande d'accès à un produit (écran d'accueil sans accès)
-- ════════════════════════════════════════════════════════════════
-- RPC SECURITY DEFINER : un utilisateur sans rôle sur un produit
-- notifie les PO de ce produit + les admins globaux. Contourne le
-- fait que la table notifications n'a pas de policy INSERT côté
-- client (par design, voir 0007) — même pattern que notify_mentions.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('assignation', 'sprint_cloture', 'tache_bloquee', 'mention', 'acces_demande'));

CREATE OR REPLACE FUNCTION request_produit_access(p_produit_id bigint, p_message text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_requester_name text;
  v_produit_nom    text;
  v_target uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  SELECT COALESCE(display_name, 'Un utilisateur') INTO v_requester_name
  FROM user_profiles WHERE user_id = auth.uid();

  SELECT nom INTO v_produit_nom FROM produits WHERE id = p_produit_id;
  IF v_produit_nom IS NULL THEN
    RAISE EXCEPTION 'Produit introuvable';
  END IF;

  FOR v_target IN
    SELECT user_id FROM user_produit_roles WHERE produit_id = p_produit_id AND role = 'po'
    UNION
    SELECT user_id FROM user_profiles WHERE role_global = 'admin'
  LOOP
    IF v_target <> auth.uid() THEN
      INSERT INTO notifications (user_id, produit_id, type, title, body, target)
      VALUES (v_target, p_produit_id, 'acces_demande',
        'Demande d''accès — ' || v_produit_nom,
        v_requester_name || ' demande un accès à ce produit.' || COALESCE(' ' || NULLIF(trim(p_message), ''), ''),
        NULL);
    END IF;
  END LOOP;
END;
$$;
