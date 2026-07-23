-- ════════════════════════════════════════════════════════════════
-- ROCKS / FL3 (scorecard) réservé aux admins
-- ════════════════════════════════════════════════════════════════
-- Le widget ROCKS/FL3 (Dashboard Portefeuille) est une vue stratégique
-- réservée aux admins côté UI (cf. CockpitView.tsx, onglet FL3 masqué aux
-- non-admins) — mais la RLS posée en 0061 autorisait SELECT/INSERT/UPDATE
-- à `true` pour tout utilisateur authentifié, et DELETE à `true` sur
-- scorecard_increments : un non-admin pouvait donc lire/modifier ces
-- données directement via l'API, en contournant le seul filtre côté client.

DROP POLICY IF EXISTS "scorecard_initiatives_select" ON scorecard_initiatives;
CREATE POLICY "scorecard_initiatives_select" ON scorecard_initiatives FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "scorecard_initiatives_insert" ON scorecard_initiatives;
CREATE POLICY "scorecard_initiatives_insert" ON scorecard_initiatives FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "scorecard_initiatives_update" ON scorecard_initiatives;
CREATE POLICY "scorecard_initiatives_update" ON scorecard_initiatives FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
-- scorecard_initiatives_delete était déjà is_admin() (0061), inchangée.

DROP POLICY IF EXISTS "scorecard_increments_select" ON scorecard_increments;
CREATE POLICY "scorecard_increments_select" ON scorecard_increments FOR SELECT TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "scorecard_increments_insert" ON scorecard_increments;
CREATE POLICY "scorecard_increments_insert" ON scorecard_increments FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "scorecard_increments_update" ON scorecard_increments;
CREATE POLICY "scorecard_increments_update" ON scorecard_increments FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "scorecard_increments_delete" ON scorecard_increments;
CREATE POLICY "scorecard_increments_delete" ON scorecard_increments FOR DELETE TO authenticated USING (is_admin());
