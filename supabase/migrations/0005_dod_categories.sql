-- ════════════════════════════════════════════════════════════════
-- Table dod_categories — liste de catégories DoD par produit
-- ════════════════════════════════════════════════════════════════
--
-- CONTEXTE
-- Le champ `categorie` de la table `dod` était jusqu'ici une liste
-- fixe codée en dur côté frontend (F1 à F10, taxonomie machine
-- industrielle) — non adaptée à tous les produits. On la remplace
-- par une vraie liste de catégories, définie et éditable par produit,
-- indépendamment des critères DoD déjà créés (peut être pré-remplie
-- avant même de créer le premier critère).
--
-- Mêmes règles d'accès que la table `dod` : lecture pour tout membre
-- ayant un rôle sur le produit, écriture réservée à can_edit()
-- (admin/po).
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dod_categories (
  id         serial PRIMARY KEY,
  produit_id integer NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  nom        text NOT NULL,
  ordre      integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (produit_id, nom)
);

CREATE INDEX IF NOT EXISTS dod_categories_produit_id_idx ON dod_categories(produit_id);

ALTER TABLE dod_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dod_categories_select" ON dod_categories;
CREATE POLICY "dod_categories_select" ON dod_categories FOR SELECT TO authenticated
  USING (has_any_role_on_produit(produit_id));

DROP POLICY IF EXISTS "dod_categories_insert" ON dod_categories;
CREATE POLICY "dod_categories_insert" ON dod_categories FOR INSERT TO authenticated
  WITH CHECK (can_edit(produit_id));

DROP POLICY IF EXISTS "dod_categories_update" ON dod_categories;
CREATE POLICY "dod_categories_update" ON dod_categories FOR UPDATE TO authenticated
  USING (can_edit(produit_id)) WITH CHECK (can_edit(produit_id));

DROP POLICY IF EXISTS "dod_categories_delete" ON dod_categories;
CREATE POLICY "dod_categories_delete" ON dod_categories FOR DELETE TO authenticated
  USING (can_edit(produit_id));
