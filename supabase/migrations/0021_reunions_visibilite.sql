-- ════════════════════════════════════════════════════════════════
-- 0021 — Visibilité des réunions
-- ════════════════════════════════════════════════════════════════
-- Jusqu'ici toute personne authentifiée lisait toutes les réunions.
-- Nouveau modèle :
--   · réunion transverse (produit_id NULL)  → visible par tous
--   · réunion liée à un produit             → visible par qui a un
--     rôle sur ce produit (has_any_role_on_produit)
--   · réunion privée (privee = true)        → visible uniquement par
--     le créateur, les participants (trigrammes) et les admins
-- Les revues et sujets suivent la visibilité de leur réunion parente.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE reunions ADD COLUMN IF NOT EXISTS privee     boolean NOT NULL DEFAULT false;
ALTER TABLE reunions ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();

-- ── Helper de visibilité ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION reunion_visible(p_privee boolean, p_produit_id bigint, p_created_by uuid, p_participants jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_admin()
      OR p_created_by = auth.uid()
      OR COALESCE(p_participants ? (SELECT trigramme FROM user_profiles WHERE user_id = auth.uid()), false)
      OR (NOT p_privee AND (p_produit_id IS NULL OR has_any_role_on_produit(p_produit_id)))
$$;

-- ── reunions ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "reunions_select" ON reunions;
CREATE POLICY "reunions_select" ON reunions FOR SELECT TO authenticated
  USING (reunion_visible(privee, produit_id, created_by, participants));

DROP POLICY IF EXISTS "reunions_insert" ON reunions;
CREATE POLICY "reunions_insert" ON reunions FOR INSERT TO authenticated
  WITH CHECK (has_any_produit_role(ARRAY['po', 'dev']));

DROP POLICY IF EXISTS "reunions_update" ON reunions;
CREATE POLICY "reunions_update" ON reunions FOR UPDATE TO authenticated
  USING (reunion_visible(privee, produit_id, created_by, participants) AND has_any_produit_role(ARRAY['po', 'dev']))
  WITH CHECK (has_any_produit_role(ARRAY['po', 'dev']));

DROP POLICY IF EXISTS "reunions_delete" ON reunions;
CREATE POLICY "reunions_delete" ON reunions FOR DELETE TO authenticated
  USING (reunion_visible(privee, produit_id, created_by, participants) AND has_any_produit_role(ARRAY['po', 'dev']));

-- ── reunion_revues / reunion_sujets : suivent la réunion parente ──
-- (le sous-select sur reunions applique les policies RLS ci-dessus)
DROP POLICY IF EXISTS "reunion_revues_select" ON reunion_revues;
CREATE POLICY "reunion_revues_select" ON reunion_revues FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM reunions r WHERE r.id = reunion_id));

DROP POLICY IF EXISTS "reunion_sujets_select" ON reunion_sujets;
CREATE POLICY "reunion_sujets_select" ON reunion_sujets FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM reunions r WHERE r.id = reunion_id));
