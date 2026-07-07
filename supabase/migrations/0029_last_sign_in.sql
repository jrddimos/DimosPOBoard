-- Affiche la date de dernière connexion à côté de chaque utilisateur dans
-- Setup → Équipes & Utilisateurs. La donnée vit dans auth.users (schéma non
-- exposé au client) : on la sert via une fonction SECURITY DEFINER, garde-fou
-- is_admin() obligatoire (même pattern que update_pending_profile_data, 0012).
CREATE OR REPLACE FUNCTION get_last_sign_in_dates()
RETURNS TABLE(user_id uuid, last_sign_in_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN QUERY SELECT au.id, au.last_sign_in_at FROM auth.users au;
END;
$$;
