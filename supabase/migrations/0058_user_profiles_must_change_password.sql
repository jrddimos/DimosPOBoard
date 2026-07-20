-- ════════════════════════════════════════════════════════════════
-- 0058 — user_profiles : changement de mot de passe forcé
-- ════════════════════════════════════════════════════════════════
-- Alternative à l'invitation par email (bloquée par la rate-limit du
-- service email par défaut de Supabase, ~2-4 emails/heure sans SMTP
-- personnalisé) : un admin peut créer un utilisateur directement avec un
-- mot de passe temporaire (edge function invite-user, action
-- create_with_password), à communiquer hors bande (Slack, oral…).
-- must_change_password force l'écran de définition du mot de passe
-- (SetPasswordPage) à la première connexion, avant tout accès à l'app.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
