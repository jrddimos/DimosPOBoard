-- ════════════════════════════════════════════════════════════════
-- Nettoyage des policies legacy — dimos-d3x-react
-- ════════════════════════════════════════════════════════════════
--
-- CONTEXTE
-- Après application de 0001_enable_rls.sql, un test empirique avec
-- la clé anon a montré que plusieurs tables restaient lisibles par
-- un visiteur non connecté. Investigation via pg_policies : de
-- nombreuses policies héritées d'un setup RLS antérieur (jamais
-- nettoyées) accordent un accès `{public}` (= tout le monde, y
-- compris anon) avec `USING (true)` ou équivalent trop permissif.
-- Les policies RLS permissives se cumulent en OU : une seule policy
-- "true" pour `public` annule toutes les policies fines, peu importe
-- combien on en écrit par ailleurs.
--
-- Ce script :
-- 1. Supprime toutes les policies legacy dangereuses identifiées
--    (accès public/true, ou accès "authenticated" trop large qui
--    contourne le contrôle par rôle/produit).
-- 2. Verrouille 7 tables découvertes en cours de route et jamais
--    utilisées par le frontend (`epics`, `jalons`, `metiers`,
--    `po_blocages`, `po_produits`, `po_reunions`, `po_sprints`) —
--    accès admin uniquement par précaution, aucun risque de casser
--    l'app puisque rien ne les appelle côté client.
-- 3. Ajoute des policies propres pour `app_settings` (config RAG
--    globale, utilisée par tous en lecture, écriture déjà limitée
--    aux admins côté UI dans ProduitsPage.tsx — on aligne la base).
--
-- À exécuter APRÈS 0001_enable_rls.sql (qui doit déjà avoir tourné
-- sans erreur). Idempotent comme 0001 : rejouable sans risque.
-- ════════════════════════════════════════════════════════════════


-- ──────────────────────────────────────────────────────────────
-- dod — retire l'accès public grand ouvert et le doublon "write_dod"
-- (déjà couvert par dod_insert/update/delete)
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_all_dod" ON dod;
DROP POLICY IF EXISTS "read_dod"       ON dod;
DROP POLICY IF EXISTS "write_dod"      ON dod;

-- ──────────────────────────────────────────────────────────────
-- equipes
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow_all_equipes" ON equipes;

-- ──────────────────────────────────────────────────────────────
-- finance_config — "admins_only" était mal nommée : USING (true),
-- donc en réalité ouverte à tout le monde malgré son nom.
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admins_only"    ON finance_config;
DROP POLICY IF EXISTS "ecriture_admin" ON finance_config;

-- ──────────────────────────────────────────────────────────────
-- membres
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow_all_membres" ON membres;
DROP POLICY IF EXISTS "public_all"        ON membres;

-- ──────────────────────────────────────────────────────────────
-- plan_charges — "auth_all" permettait à N'IMPORTE QUEL utilisateur
-- connecté (peu importe son rôle) de lire/écrire le plan de charges
-- de N'IMPORTE QUEL produit, en contournant complètement can_write().
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all" ON plan_charges;

-- ──────────────────────────────────────────────────────────────
-- pending_profiles — "admin_update_pending" permettait à N'IMPORTE
-- QUEL utilisateur connecté de modifier les invitations en attente
-- (données de rôles avant création de compte).
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_update_pending" ON pending_profiles;

-- ──────────────────────────────────────────────────────────────
-- produits — retire l'accès public/true et le "read_produits" qui
-- laissait n'importe quel utilisateur connecté voir TOUS les
-- produits, même sans rôle dessus (contourne produits_select).
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow_all_produits" ON produits;
DROP POLICY IF EXISTS "read_produits"      ON produits;
DROP POLICY IF EXISTS "admin_all_produits" ON produits;

-- ──────────────────────────────────────────────────────────────
-- user_produit_roles — retire l'accès public/true et les doublons
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow_all_upr"        ON user_produit_roles;
DROP POLICY IF EXISTS "admin_all_roles"      ON user_produit_roles;
DROP POLICY IF EXISTS "read_own_roles"       ON user_produit_roles;
DROP POLICY IF EXISTS "lecture authentifiée" ON user_produit_roles;
DROP POLICY IF EXISTS "écriture admin"       ON user_produit_roles;

-- ──────────────────────────────────────────────────────────────
-- user_profiles — retire les doublons legacy. "allow_own_profile"
-- était en ALL (y compris DELETE) pour l'utilisateur sur sa propre
-- ligne : on ne garde que la suppression réservée aux admins
-- (déjà géré par user_profiles_delete).
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_all_profiles" ON user_profiles;
DROP POLICY IF EXISTS "allow_own_profile"  ON user_profiles;
DROP POLICY IF EXISTS "read_own_profile"   ON user_profiles;


-- ──────────────────────────────────────────────────────────────
-- app_settings — config RAG globale (seuils avancement/budget/
-- blocages), lecture nécessaire à tous pour calculer les statuts
-- santé produit, écriture déjà réservée aux admins côté UI
-- (ProduitsPage.tsx) : on aligne la base sur la même règle.
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_read"  ON app_settings;
DROP POLICY IF EXISTS "authenticated_write" ON app_settings;

DROP POLICY IF EXISTS "app_settings_select" ON app_settings;
CREATE POLICY "app_settings_select" ON app_settings FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "app_settings_insert" ON app_settings;
CREATE POLICY "app_settings_insert" ON app_settings FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "app_settings_update" ON app_settings;
CREATE POLICY "app_settings_update" ON app_settings FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "app_settings_delete" ON app_settings;
CREATE POLICY "app_settings_delete" ON app_settings FOR DELETE TO authenticated
  USING (is_admin());


-- ──────────────────────────────────────────────────────────────
-- Tables confirmées NON utilisées par le frontend (aucun résultat
-- pour `grep -rn "from('<table>')" src/`) : verrouillées admin
-- uniquement par précaution. Si l'une d'elles s'avère utilisée
-- ailleurs (fonction SQL, export, outil externe), dites-le-moi
-- pour lui donner une policy adaptée plutôt qu'un verrou total.
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['epics','jalons','metiers','po_blocages','po_produits','po_reunions','po_sprints']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'allow_all_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_all', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'admin_only_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t, t); -- au cas où nommée juste comme la table
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_admin_only', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin())',
      t || '_admin_only', t
    );
  END LOOP;
END $$;


-- ════════════════════════════════════════════════════════════════
-- APRÈS EXÉCUTION : relancez ce test pour confirmer qu'il n'y a
-- plus AUCUNE policy accordant un accès public/anon nulle part :
--
--   SELECT tablename, policyname, roles, cmd
--   FROM pg_policies
--   WHERE roles::text LIKE '%public%' OR 'anon' = ANY(roles)
--   ORDER BY tablename;
--
-- Le résultat attendu est : AUCUNE LIGNE.
-- ════════════════════════════════════════════════════════════════
