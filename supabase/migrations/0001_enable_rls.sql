-- ════════════════════════════════════════════════════════════════
-- Activation du Row Level Security (RLS) — dimos-d3x-react
-- ════════════════════════════════════════════════════════════════
--
-- CONTEXTE
-- Un audit a montré que la clé publique `anon` (visible dans le
-- bundle frontend, donc accessible à n'importe qui) permet
-- actuellement de LIRE l'intégralité des tables `taches`, `dod`,
-- `produits`, `sprints`, `equipes`, `user_produit_roles` sans
-- aucune authentification. Ce script active RLS et pose des
-- policies alignées sur le modèle de rôles déjà défini côté
-- frontend (src/contexts/AuthContext.tsx) :
--   - role_global = 'admin'                → accès total
--   - user_produit_roles.role par produit  → 'po' | 'dev' | 'lecteur'
--   - canEdit(pid)  = admin OU role='po'
--   - canWrite(pid) = admin OU role IN ('po','dev')
--   - 'lecteur' = lecture seule
--
-- COMMENT APPLIQUER CE SCRIPT
-- 1. Relire entièrement ce fichier (adapter les noms de colonnes
--    si votre schéma réel diffère de celui déduit du code TypeScript).
-- 2. Coller dans Supabase Dashboard → SQL Editor → New query, ou
--    `supabase db push` si vous utilisez la CLI localement.
-- 3. TESTER IMMÉDIATEMENT APRÈS avec un compte de chaque rôle
--    (admin, po, dev, lecteur) sur les pages principales :
--    Backlog, Tâches, Sprint Board, Plan de charges, Setup, DoD.
--    Si une page casse (erreur 403 inattendue), c'est probablement
--    qu'une requête manque un `.eq('produit_id', ...)` explicite
--    ou que la policy est trop stricte pour un usage légitime —
--    corrigez la policy correspondante, ne désactivez pas RLS.
-- 4. Gardez une fenêtre de rollback : en cas de blocage bloquant,
--    `ALTER TABLE <table> DISABLE ROW LEVEL SECURITY;` réactive
--    l'accès complet en urgence le temps de corriger.
--
-- ⚠️ Ce script n'a jamais été exécuté ni testé contre votre base
-- réelle — il a été écrit à partir de la lecture du code TypeScript
-- (hooks, types). Vérifiez chaque nom de colonne avant d'exécuter.
--
-- MISE À JOUR après premier test réel : un audit de pg_policies a
-- révélé une policy héritée "allow_all" (roles {anon,authenticated},
-- USING true) sur taches/dod/sprints/membres, posée lors d'un
-- prototypage antérieur. Les policies RLS permissives se cumulent en
-- OU : cette policy à elle seule annulait toutes les policies fines
-- ci-dessous. Le script la supprime désormais explicitement sur ces
-- 4 tables. Si après ré-exécution une table est ENCORE lisible par
-- anon, relancez cette requête pour traquer d'autres policies du
-- même genre sur des tables non couvertes par ce script :
--   SELECT tablename, policyname, roles FROM pg_policies
--   WHERE 'anon' = ANY(roles) ORDER BY tablename;
-- ════════════════════════════════════════════════════════════════


-- ──────────────────────────────────────────────────────────────
-- 1. Fonctions utilitaires (SECURITY DEFINER pour éviter la
--    récursion RLS quand elles lisent user_profiles / user_produit_roles)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = auth.uid() AND role_global = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION has_produit_role(p_produit_id bigint, p_roles text[])
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT is_admin() OR EXISTS (
    SELECT 1 FROM user_produit_roles
    WHERE user_id = auth.uid()
      AND produit_id = p_produit_id
      AND role = ANY (p_roles)
  );
$$;

-- Vrai si l'utilisateur a un des rôles donnés sur AU MOINS UN produit
-- (utile pour les tables transverses : réunions, etc.)
CREATE OR REPLACE FUNCTION has_any_produit_role(p_roles text[])
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT is_admin() OR EXISTS (
    SELECT 1 FROM user_produit_roles
    WHERE user_id = auth.uid()
      AND role = ANY (p_roles)
  );
$$;

-- Raccourcis correspondant à canEdit / canWrite côté frontend
CREATE OR REPLACE FUNCTION can_edit(p_produit_id bigint)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT has_produit_role(p_produit_id, ARRAY['po']);
$$;

CREATE OR REPLACE FUNCTION can_write(p_produit_id bigint)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT has_produit_role(p_produit_id, ARRAY['po', 'dev']);
$$;

CREATE OR REPLACE FUNCTION has_any_role_on_produit(p_produit_id bigint)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT has_produit_role(p_produit_id, ARRAY['po', 'dev', 'lecteur']);
$$;


-- ──────────────────────────────────────────────────────────────
-- 2. produits
-- ──────────────────────────────────────────────────────────────
ALTER TABLE produits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "produits_select" ON produits;
CREATE POLICY "produits_select" ON produits FOR SELECT TO authenticated
  USING (is_admin() OR has_any_role_on_produit(id));

DROP POLICY IF EXISTS "produits_insert" ON produits;
CREATE POLICY "produits_insert" ON produits FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "produits_update" ON produits;
CREATE POLICY "produits_update" ON produits FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "produits_delete" ON produits;
CREATE POLICY "produits_delete" ON produits FOR DELETE TO authenticated
  USING (is_admin());


-- ──────────────────────────────────────────────────────────────
-- 3. taches
-- ──────────────────────────────────────────────────────────────
ALTER TABLE taches ENABLE ROW LEVEL SECURITY;

-- Policy héritée d'un ancien setup (prototypage) qui donnait un accès
-- total à anon+authenticated et annulait toutes les policies ci-dessous
-- (les policies RLS permissives se cumulent en OU). À supprimer.
DROP POLICY IF EXISTS "allow_all" ON taches;

DROP POLICY IF EXISTS "taches_select" ON taches;
CREATE POLICY "taches_select" ON taches FOR SELECT TO authenticated
  USING (produit_id IS NULL OR has_any_role_on_produit(produit_id));

DROP POLICY IF EXISTS "taches_insert" ON taches;
CREATE POLICY "taches_insert" ON taches FOR INSERT TO authenticated
  WITH CHECK (produit_id IS NOT NULL AND can_write(produit_id));

DROP POLICY IF EXISTS "taches_update" ON taches;
CREATE POLICY "taches_update" ON taches FOR UPDATE TO authenticated
  USING (produit_id IS NOT NULL AND can_write(produit_id))
  WITH CHECK (produit_id IS NOT NULL AND can_write(produit_id));

DROP POLICY IF EXISTS "taches_delete" ON taches;
CREATE POLICY "taches_delete" ON taches FOR DELETE TO authenticated
  USING (produit_id IS NOT NULL AND can_write(produit_id));


-- ──────────────────────────────────────────────────────────────
-- 4. plan_charges
-- ──────────────────────────────────────────────────────────────
ALTER TABLE plan_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plan_charges_select" ON plan_charges;
CREATE POLICY "plan_charges_select" ON plan_charges FOR SELECT TO authenticated
  USING (has_any_role_on_produit(produit_id));

DROP POLICY IF EXISTS "plan_charges_insert" ON plan_charges;
CREATE POLICY "plan_charges_insert" ON plan_charges FOR INSERT TO authenticated
  WITH CHECK (can_write(produit_id));

DROP POLICY IF EXISTS "plan_charges_update" ON plan_charges;
CREATE POLICY "plan_charges_update" ON plan_charges FOR UPDATE TO authenticated
  USING (can_write(produit_id)) WITH CHECK (can_write(produit_id));

DROP POLICY IF EXISTS "plan_charges_delete" ON plan_charges;
CREATE POLICY "plan_charges_delete" ON plan_charges FOR DELETE TO authenticated
  USING (can_write(produit_id));


-- ──────────────────────────────────────────────────────────────
-- 5. dod (Definition of Done) — gouvernance produit, réservé aux PO
-- ──────────────────────────────────────────────────────────────
ALTER TABLE dod ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all" ON dod;

DROP POLICY IF EXISTS "dod_select" ON dod;
CREATE POLICY "dod_select" ON dod FOR SELECT TO authenticated
  USING (has_any_role_on_produit(produit_id));

DROP POLICY IF EXISTS "dod_insert" ON dod;
CREATE POLICY "dod_insert" ON dod FOR INSERT TO authenticated
  WITH CHECK (can_edit(produit_id));

DROP POLICY IF EXISTS "dod_update" ON dod;
CREATE POLICY "dod_update" ON dod FOR UPDATE TO authenticated
  USING (can_edit(produit_id)) WITH CHECK (can_edit(produit_id));

DROP POLICY IF EXISTS "dod_delete" ON dod;
CREATE POLICY "dod_delete" ON dod FOR DELETE TO authenticated
  USING (can_edit(produit_id));


-- ──────────────────────────────────────────────────────────────
-- 6. sprints — cycle de vie (créer/démarrer/clôturer) réservé aux PO
-- ──────────────────────────────────────────────────────────────
ALTER TABLE sprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all" ON sprints;

DROP POLICY IF EXISTS "sprints_select" ON sprints;
CREATE POLICY "sprints_select" ON sprints FOR SELECT TO authenticated
  USING (has_any_role_on_produit(produit_id));

DROP POLICY IF EXISTS "sprints_insert" ON sprints;
CREATE POLICY "sprints_insert" ON sprints FOR INSERT TO authenticated
  WITH CHECK (can_edit(produit_id));

DROP POLICY IF EXISTS "sprints_update" ON sprints;
CREATE POLICY "sprints_update" ON sprints FOR UPDATE TO authenticated
  USING (can_edit(produit_id)) WITH CHECK (can_edit(produit_id));

DROP POLICY IF EXISTS "sprints_delete" ON sprints;
CREATE POLICY "sprints_delete" ON sprints FOR DELETE TO authenticated
  USING (can_edit(produit_id));


-- ──────────────────────────────────────────────────────────────
-- 7. user_profiles
--    Lecture ouverte à tous les connectés (trigrammes/avatars
--    affichés partout). Écriture : soi-même, ou admin pour tous.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_profiles_select" ON user_profiles;
CREATE POLICY "user_profiles_select" ON user_profiles FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "user_profiles_insert" ON user_profiles;
CREATE POLICY "user_profiles_insert" ON user_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR is_admin());

DROP POLICY IF EXISTS "user_profiles_update" ON user_profiles;
CREATE POLICY "user_profiles_update" ON user_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (
    -- Un non-admin ne peut pas s'auto-promouvoir admin
    (auth.uid() = user_id AND (role_global IS NOT DISTINCT FROM (SELECT role_global FROM user_profiles WHERE user_id = auth.uid())))
    OR is_admin()
  );

DROP POLICY IF EXISTS "user_profiles_delete" ON user_profiles;
CREATE POLICY "user_profiles_delete" ON user_profiles FOR DELETE TO authenticated
  USING (is_admin());


-- ──────────────────────────────────────────────────────────────
-- 8. user_produit_roles
--    Lecture ouverte (rosters d'équipe affichés partout).
--    Écriture réservée aux admins (attribution des rôles).
-- ──────────────────────────────────────────────────────────────
ALTER TABLE user_produit_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_produit_roles_select" ON user_produit_roles;
CREATE POLICY "user_produit_roles_select" ON user_produit_roles FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "user_produit_roles_insert" ON user_produit_roles;
CREATE POLICY "user_produit_roles_insert" ON user_produit_roles FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "user_produit_roles_update" ON user_produit_roles;
CREATE POLICY "user_produit_roles_update" ON user_produit_roles FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "user_produit_roles_delete" ON user_produit_roles;
CREATE POLICY "user_produit_roles_delete" ON user_produit_roles FOR DELETE TO authenticated
  USING (is_admin());


-- ──────────────────────────────────────────────────────────────
-- 9. pending_profiles — invitations en attente, données de rôles
--    sensibles avant création du compte : admin uniquement.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE pending_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pending_profiles_all" ON pending_profiles;
CREATE POLICY "pending_profiles_all" ON pending_profiles FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());


-- ──────────────────────────────────────────────────────────────
-- 10. equipes — référentiel global, lecture ouverte, écriture admin
-- ──────────────────────────────────────────────────────────────
ALTER TABLE equipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipes_select" ON equipes;
CREATE POLICY "equipes_select" ON equipes FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "equipes_insert" ON equipes;
CREATE POLICY "equipes_insert" ON equipes FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "equipes_update" ON equipes;
CREATE POLICY "equipes_update" ON equipes FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "equipes_delete" ON equipes;
CREATE POLICY "equipes_delete" ON equipes FOR DELETE TO authenticated
  USING (is_admin());


-- ──────────────────────────────────────────────────────────────
-- 11. periodes_fermeture — jours fériés/fermetures, global,
--     lecture ouverte (nécessaire au calcul du plan de charges
--     partout), écriture admin.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE periodes_fermeture ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "periodes_fermeture_select" ON periodes_fermeture;
CREATE POLICY "periodes_fermeture_select" ON periodes_fermeture FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "periodes_fermeture_insert" ON periodes_fermeture;
CREATE POLICY "periodes_fermeture_insert" ON periodes_fermeture FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "periodes_fermeture_update" ON periodes_fermeture;
CREATE POLICY "periodes_fermeture_update" ON periodes_fermeture FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "periodes_fermeture_delete" ON periodes_fermeture;
CREATE POLICY "periodes_fermeture_delete" ON periodes_fermeture FOR DELETE TO authenticated
  USING (is_admin());


-- ──────────────────────────────────────────────────────────────
-- 12. reunions — réunion hebdo transverse (pas liée à un seul
--     produit). Lecture ouverte, écriture réservée à qui a un
--     rôle po/dev sur au moins un produit.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE reunions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reunions_select" ON reunions;
CREATE POLICY "reunions_select" ON reunions FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "reunions_insert" ON reunions;
CREATE POLICY "reunions_insert" ON reunions FOR INSERT TO authenticated
  WITH CHECK (has_any_produit_role(ARRAY['po', 'dev']));

DROP POLICY IF EXISTS "reunions_update" ON reunions;
CREATE POLICY "reunions_update" ON reunions FOR UPDATE TO authenticated
  USING (has_any_produit_role(ARRAY['po', 'dev']))
  WITH CHECK (has_any_produit_role(ARRAY['po', 'dev']));

DROP POLICY IF EXISTS "reunions_delete" ON reunions;
CREATE POLICY "reunions_delete" ON reunions FOR DELETE TO authenticated
  USING (has_any_produit_role(ARRAY['po', 'dev']));


-- ──────────────────────────────────────────────────────────────
-- 13. reunion_revues — revue par produit dans la réunion hebdo
-- ──────────────────────────────────────────────────────────────
ALTER TABLE reunion_revues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reunion_revues_select" ON reunion_revues;
CREATE POLICY "reunion_revues_select" ON reunion_revues FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "reunion_revues_insert" ON reunion_revues;
CREATE POLICY "reunion_revues_insert" ON reunion_revues FOR INSERT TO authenticated
  WITH CHECK (can_write(produit_id));

DROP POLICY IF EXISTS "reunion_revues_update" ON reunion_revues;
CREATE POLICY "reunion_revues_update" ON reunion_revues FOR UPDATE TO authenticated
  USING (can_write(produit_id)) WITH CHECK (can_write(produit_id));

DROP POLICY IF EXISTS "reunion_revues_delete" ON reunion_revues;
CREATE POLICY "reunion_revues_delete" ON reunion_revues FOR DELETE TO authenticated
  USING (can_write(produit_id));


-- ──────────────────────────────────────────────────────────────
-- 14. reunion_sujets — sujets transverses de la réunion hebdo
--     (pas de produit_id : même règle que `reunions`)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE reunion_sujets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reunion_sujets_select" ON reunion_sujets;
CREATE POLICY "reunion_sujets_select" ON reunion_sujets FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "reunion_sujets_insert" ON reunion_sujets;
CREATE POLICY "reunion_sujets_insert" ON reunion_sujets FOR INSERT TO authenticated
  WITH CHECK (has_any_produit_role(ARRAY['po', 'dev']));

DROP POLICY IF EXISTS "reunion_sujets_update" ON reunion_sujets;
CREATE POLICY "reunion_sujets_update" ON reunion_sujets FOR UPDATE TO authenticated
  USING (has_any_produit_role(ARRAY['po', 'dev']))
  WITH CHECK (has_any_produit_role(ARRAY['po', 'dev']));

DROP POLICY IF EXISTS "reunion_sujets_delete" ON reunion_sujets;
CREATE POLICY "reunion_sujets_delete" ON reunion_sujets FOR DELETE TO authenticated
  USING (has_any_produit_role(ARRAY['po', 'dev']));


-- ──────────────────────────────────────────────────────────────
-- 15. finance_config — config globale (singleton id=1), contient
--     les TJM par équipe.
--     Lecture ouverte à tous les connectés : DashboardPage,
--     ProduitDashboardBody, ProduitBandeauRow et ProduitConfigPage
--     calculent des métriques budgétaires à partir de cette table
--     et doivent rester exactes pour les PO/dev, pas seulement
--     pour les admins.
--     La restriction voulue porte sur la PAGE de configuration
--     (menu Finance = FinanceSetupPage), pas sur la donnée en
--     lecture : cette page est déjà protégée côté route dans
--     App.tsx (`/admin/finance` → redirect si !isAdmin), et les
--     policies INSERT/UPDATE/DELETE ci-dessous garantissent que
--     seul un admin peut modifier les TJM, même en contournant
--     l'UI (appel direct à l'API).
-- ──────────────────────────────────────────────────────────────
ALTER TABLE finance_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_config_select" ON finance_config;
CREATE POLICY "finance_config_select" ON finance_config FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "finance_config_insert" ON finance_config;
CREATE POLICY "finance_config_insert" ON finance_config FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "finance_config_update" ON finance_config;
CREATE POLICY "finance_config_update" ON finance_config FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "finance_config_delete" ON finance_config;
CREATE POLICY "finance_config_delete" ON finance_config FOR DELETE TO authenticated
  USING (is_admin());


-- ──────────────────────────────────────────────────────────────
-- 16. membres — table non référencée dans le code frontend exploré
--     (aucun `supabase.from('membres')` trouvé). Confirmée obsolète/
--     non utilisée par l'app : verrouillée aux admins par défaut,
--     le plus sûr tant qu'on ne sait pas ce qui la consomme
--     (fonction SQL, trigger, ancien import…).
-- ──────────────────────────────────────────────────────────────
ALTER TABLE membres ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all" ON membres;

DROP POLICY IF EXISTS "membres_all" ON membres;
CREATE POLICY "membres_all" ON membres FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());


-- ════════════════════════════════════════════════════════════════
-- FIN — Tables volontairement NON traitées ici, à vérifier
-- manuellement si elles existent dans votre schéma :
--   - `feature` (référencée dans src/types/index.ts) : non vue
--     dans les hooks explorés, à vérifier si elle existe et est
--     utilisée en écriture quelque part.
--   - toute autre table présente dans votre projet Supabase mais
--     non référencée dans le code exploré par cet audit (vérifiez
--     la liste complète des tables dans Dashboard → Table Editor).
-- ════════════════════════════════════════════════════════════════
