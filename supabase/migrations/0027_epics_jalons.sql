-- Les Epics et Jalons étaient jusqu'ici une liste GLOBALE figée dans le code
-- (EPIC_LIST/JALON_LIST, src/constants/index.ts), partagée par tous les
-- produits — alors qu'ils sont en réalité spécifiques à chaque produit et
-- doivent pouvoir être ajoutés/renommés/supprimés indépendamment.
--
-- Les tables `epics`/`jalons` existent déjà en base avec le schéma ci-dessous
-- (code + nom séparés, bg_couleur pour le fond des badges) : ce script
-- n'écrase rien, il complète (index, RLS, policies, backfill), de façon
-- idempotente — rejouable sans risque à tout moment.
--   epics  : id, produit_id, code ("EPIC 1"), nom ("Architecture & CDC"),
--            couleur (texte/bordure), bg_couleur (fond badge), ordre
--   jalons : id, produit_id, code ("I1"), couleur, ordre

CREATE UNIQUE INDEX IF NOT EXISTS epics_produit_id_code_key ON epics(produit_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS jalons_produit_id_code_key ON jalons(produit_id, code);

ALTER TABLE epics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "epics_select" ON epics;
CREATE POLICY "epics_select" ON epics FOR SELECT TO authenticated USING (has_any_role_on_produit(produit_id));
DROP POLICY IF EXISTS "epics_insert" ON epics;
CREATE POLICY "epics_insert" ON epics FOR INSERT TO authenticated WITH CHECK (can_edit(produit_id));
DROP POLICY IF EXISTS "epics_update" ON epics;
CREATE POLICY "epics_update" ON epics FOR UPDATE TO authenticated USING (can_edit(produit_id)) WITH CHECK (can_edit(produit_id));
DROP POLICY IF EXISTS "epics_delete" ON epics;
CREATE POLICY "epics_delete" ON epics FOR DELETE TO authenticated USING (can_edit(produit_id));

ALTER TABLE jalons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jalons_select" ON jalons;
CREATE POLICY "jalons_select" ON jalons FOR SELECT TO authenticated USING (has_any_role_on_produit(produit_id));
DROP POLICY IF EXISTS "jalons_insert" ON jalons;
CREATE POLICY "jalons_insert" ON jalons FOR INSERT TO authenticated WITH CHECK (can_edit(produit_id));
DROP POLICY IF EXISTS "jalons_update" ON jalons;
CREATE POLICY "jalons_update" ON jalons FOR UPDATE TO authenticated USING (can_edit(produit_id)) WITH CHECK (can_edit(produit_id));
DROP POLICY IF EXISTS "jalons_delete" ON jalons;
CREATE POLICY "jalons_delete" ON jalons FOR DELETE TO authenticated USING (can_edit(produit_id));

-- Backfill : idempotent (ON CONFLICT DO NOTHING) — ne touche pas les lignes déjà
-- présentes, complète seulement les produits qui n'ont encore aucun epic/jalon.
INSERT INTO epics (produit_id, code, nom, couleur, bg_couleur, ordre)
SELECT p.id, e.code, e.nom, e.couleur, e.bg_couleur, e.ordre
FROM produits p
CROSS JOIN (VALUES
  ('EPIC 1',  'Architecture & CDC',             '#5B21B6', '#EDE9FE', 1),
  ('EPIC 2',  'Avaloir',                        '#065F46', '#D1FAE5', 2),
  ('EPIC 3',  'Train de Galets',                '#92600A', '#FEF3C7', 3),
  ('EPIC 4',  'Refendage',                      '#991B1B', '#FEE2E2', 4),
  ('EPIC 5',  'Coupe / Cisaille',                '#C2410C', '#FFEDD5', 5),
  ('EPIC 6',  'Châssis & Structure',             '#1E40AF', '#DBEAFE', 6),
  ('EPIC 7',  'Motorisation',                    '#6B21A8', '#F3E8FF', 7),
  ('EPIC 8',  'Interface Opérateur',             '#9D174D', '#FCE7F3', 8),
  ('EPIC 9',  'Sécurité & CE',                   '#134E4A', '#CCFBF1', 9),
  ('EPIC 10', 'Maintenance & SAV',               '#713F12', '#FEF9C3', 10),
  ('EPIC 11', 'Prototype & Essais',              '#0C4A6E', '#E0F2FE', 11),
  ('EPIC 12', 'Validation & Industrialisation',  '#14532D', '#F0FDF4', 12),
  ('EPIC 13', 'Commerce & Marketing',            '#9A3412', '#FFF7ED', 13)
) AS e(code, nom, couleur, bg_couleur, ordre)
ON CONFLICT (produit_id, code) DO NOTHING;

INSERT INTO jalons (produit_id, code, couleur, ordre)
SELECT p.id, j.code, j.couleur, j.ordre
FROM produits p
CROSS JOIN (VALUES
  ('I1', '#5B21B6', 1),
  ('I2', '#065F46', 2),
  ('I3', '#92600A', 3),
  ('I4', '#991B1B', 4),
  ('I5', '#1E40AF', 5),
  ('I6', '#14532D', 6)
) AS j(code, couleur, ordre)
ON CONFLICT (produit_id, code) DO NOTHING;
