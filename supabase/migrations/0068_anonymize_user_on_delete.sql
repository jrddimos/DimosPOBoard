-- ════════════════════════════════════════════════════════════════
-- 0068 — Anonymisation du trigramme à la suppression de compte (RGPD)
-- ════════════════════════════════════════════════════════════════
-- La suppression d'un utilisateur (edge function invite-user, action
-- delete_user → auth.admin.deleteUser) cascade déjà correctement sur les
-- tables ayant une FK vers auth.users (user_profiles, tache_commentaires,
-- reunions.created_by, etc. — CASCADE ou SET NULL). Mais plusieurs champs
-- stockent le TRIGRAMME en texte libre, sans FK, et ne sont donc jamais
-- nettoyés : taches.assigne_a (liste CSV multi-assignés depuis 0060),
-- plan_charges.assigne_a, tache_iterations.assigne_a, reunions.animateur,
-- reunions.participants (jsonb array), absences.trigramme. Une fois
-- user_profiles supprimé, le mapping trigramme↔identité disparaît mais le
-- trigramme reste affiché tel quel sur ces enregistrements — fuite
-- d'anonymisation vis-à-vis du droit à l'oubli.
--
-- Cette fonction doit être appelée par l'edge function AVANT
-- auth.admin.deleteUser (donc avant que le cascade ne supprime
-- user_profiles et ne perde le trigramme de la personne supprimée).
-- SECURITY DEFINER par cohérence avec les autres fonctions internes
-- (cf. reunion_visible, 0021) même si l'appelant (service_role) bypass
-- déjà RLS — pas de GRANT à `authenticated`, usage réservé au backend.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION anonymize_user_traces(p_trigramme text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_trigramme IS NULL OR trim(p_trigramme) = '' THEN RETURN; END IF;

  -- taches.assigne_a : liste CSV multi-assignés — retire uniquement CE
  -- trigramme, garde les autres assignés sur la tâche.
  UPDATE taches
  SET assigne_a = NULLIF(
    array_to_string(
      ARRAY(
        SELECT trim(x) FROM unnest(regexp_split_to_array(assigne_a, '[,;]+')) AS x
        WHERE trim(x) <> '' AND trim(x) <> p_trigramme
      ),
      ', '
    ),
    ''
  )
  WHERE assigne_a IS NOT NULL
    AND EXISTS (SELECT 1 FROM unnest(regexp_split_to_array(assigne_a, '[,;]+')) AS x WHERE trim(x) = p_trigramme);

  -- plan_charges.assigne_a / tache_iterations.assigne_a : valeur simple
  -- (pas de liste multi-assignés ici).
  UPDATE plan_charges     SET assigne_a = NULL WHERE assigne_a = p_trigramme;
  UPDATE tache_iterations SET assigne_a = NULL WHERE assigne_a = p_trigramme;

  -- reunions.animateur (texte simple) et participants (jsonb array de trigrammes).
  UPDATE reunions SET animateur = NULL WHERE animateur = p_trigramme;
  UPDATE reunions
  SET participants = COALESCE(
    (SELECT jsonb_agg(elem) FROM jsonb_array_elements_text(participants) elem WHERE elem <> p_trigramme),
    '[]'::jsonb
  )
  WHERE participants ? p_trigramme;

  -- absences : le trigramme EST le sujet de la ligne (qui est absent) —
  -- pas de sens à anonymiser un champ, on supprime la ligne entière.
  DELETE FROM absences WHERE trigramme = p_trigramme;
END $$;
