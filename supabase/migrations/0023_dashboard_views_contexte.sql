-- ════════════════════════════════════════════════════════════════
-- 0023 — Vues personnalisées : contexte portefeuille / produit
-- ════════════════════════════════════════════════════════════════
-- La table user_dashboard_views servait uniquement au cockpit
-- portefeuille. Le dashboard produit devient personnalisable à son
-- tour : la colonne contexte distingue les deux familles de vues.
--   'portefeuille' → vues nommées du cockpit (plusieurs par user)
--   'produit'      → disposition unique du dashboard produit,
--                    commune à tous les produits de l'utilisateur
-- ════════════════════════════════════════════════════════════════

ALTER TABLE user_dashboard_views
  ADD COLUMN IF NOT EXISTS contexte text NOT NULL DEFAULT 'portefeuille';

CREATE INDEX IF NOT EXISTS user_dashboard_views_ctx_idx
  ON user_dashboard_views(user_id, contexte, ordre);
