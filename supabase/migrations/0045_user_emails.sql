-- Expose l'email de chaque utilisateur aux admins dans Setup → Équipes &
-- Utilisateurs, pour pouvoir déclencher l'envoi d'un lien de réinitialisation
-- de mot de passe à sa place (utilisateur bloqué/mot de passe oublié).
-- L'email vit dans auth.users (schéma non exposé au client) : servi via une
-- fonction SECURITY DEFINER, garde-fou is_admin() obligatoire (même pattern
-- que get_last_sign_in_dates, migration 0029).
CREATE OR REPLACE FUNCTION get_user_emails()
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- auth.users.email est `character varying`, pas `text` : RETURN QUERY
  -- exige une correspondance de type exacte avec RETURNS TABLE, d'où le cast.
  RETURN QUERY SELECT au.id, au.email::text FROM auth.users au;
END;
$$;
