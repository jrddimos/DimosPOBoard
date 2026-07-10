-- Sous-gammes : hiérarchie à deux niveaux dans gammes_produits via parent_id
-- (Gamme > Sous-gamme > Produit sur la roadmap). Un élément de roadmap peut
-- référencer indifféremment une gamme (niveau 1) ou une sous-gamme (niveau 2)
-- via roadmap_items.gamme_id — pas de changement de schéma côté items.
-- La suppression d'une gamme emporte ses sous-gammes (CASCADE), qui emportent
-- elles-mêmes leurs roadmap_items (CASCADE posé en 0047).
ALTER TABLE gammes_produits ADD COLUMN IF NOT EXISTS parent_id bigint REFERENCES gammes_produits(id) ON DELETE CASCADE;
