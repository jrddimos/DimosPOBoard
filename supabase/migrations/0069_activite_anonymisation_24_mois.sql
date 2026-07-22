-- ════════════════════════════════════════════════════════════════
-- 0069 — Minimisation RGPD : anonymisation du log d'activité (24 mois)
-- ════════════════════════════════════════════════════════════════
-- `activite` (audit : qui a changé quoi, quand) grossit sans limite. Ce qui
-- est réellement une donnée personnelle ici, c'est `user_id` (qui a fait
-- l'action) — pas le contenu métier (action/target/field/old_value/
-- new_value). `useVerificationLoops` (src/hooks/useActivityLog.ts:75)
-- compte les reboucles de vérification sur TOUT l'historique d'un produit,
-- sans limite de date — supprimer les lignes casserait cette métrique sur
-- les vieux produits.
--
-- Solution : après 24 mois, on anonymise `user_id → NULL` mais on GARDE la
-- ligne (l'historique métier reste exploitable, l'identité de l'auteur
-- disparaît). Tourne automatiquement via pg_cron, pas d'action humaine
-- requise (contrairement à un bouton "purger" manuel, oubliable).
--
-- pg_cron doit être activé sur le projet (normalement disponible tel quel
-- sur Supabase ; si CREATE EXTENSION échoue par manque de droit, l'activer
-- depuis le dashboard : Database > Extensions > pg_cron).
-- ════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION anonymize_old_activite()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE activite
  SET user_id = NULL
  WHERE user_id IS NOT NULL
    AND created_at < now() - interval '24 months';
$$;

-- Idempotent : dé-planifie l'ancien job du même nom avant de le recréer,
-- pour que cette migration reste rejouable sans dupliquer la tâche
-- planifiée (cron.schedule ne garantit pas l'unicité par nom selon la
-- version de pg_cron).
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'anonymize-old-activite-monthly';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Le 1er de chaque mois à 3h du matin (heure serveur, UTC) — fréquence
-- largement suffisante pour une fenêtre de rétention de 24 mois.
SELECT cron.schedule(
  'anonymize-old-activite-monthly',
  '0 3 1 * *',
  $$ SELECT anonymize_old_activite(); $$
);
