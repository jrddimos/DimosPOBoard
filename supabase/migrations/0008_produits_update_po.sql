-- ════════════════════════════════════════════════════════════════
-- Correction — les PO doivent pouvoir modifier leur produit
-- ════════════════════════════════════════════════════════════════
--
-- CONTEXTE
-- La policy `produits_update` (0001_enable_rls.sql) restreignait
-- l'écriture sur `produits` aux admins uniquement (`is_admin()`).
-- Or `ProduitConfigPage.tsx` (vision, budget, objectifs trimestriels)
-- est ouverte aux PO côté interface, et partout ailleurs dans l'app
-- la convention est `can_edit()` = admin OU po (jamais admin seul).
-- Un PO qui modifiait son produit recevait donc un 403 RLS silencieux
-- — même symptôme que le bug corrigé sur l'envoi de quick notes vers
-- la LOP (0006_action_lop_rpc.sql), mais sur une autre table.
--
-- La création (INSERT) et la suppression (DELETE) de produits
-- restent réservées aux admins : ce sont des décisions plus lourdes
-- que la mise à jour du contenu d'un produit existant.
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "produits_update" ON produits;
CREATE POLICY "produits_update" ON produits FOR UPDATE TO authenticated
  USING (can_edit(id)) WITH CHECK (can_edit(id));
