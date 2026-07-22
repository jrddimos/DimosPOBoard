-- ════════════════════════════════════════════════════════════════
-- 0067 — Suppression d'une réunion terminée réservée aux admins
-- ════════════════════════════════════════════════════════════════
-- Le bouton Supprimer est déjà masqué côté front pour un non-admin sur une
-- réunion terminée (cf. ReunionDetailPage) — mais la policy RLS de 0021
-- autorisait encore n'importe quel PO/dev à supprimer via l'API directe.
-- On aligne la policy sur la règle produit : suppression d'une réunion
-- terminée réservée à is_admin().

DROP POLICY IF EXISTS "reunions_delete" ON reunions;
CREATE POLICY "reunions_delete" ON reunions FOR DELETE TO authenticated
  USING (
    reunion_visible(privee, produit_id, created_by, participants)
    AND has_any_produit_role(ARRAY['po', 'dev'])
    AND (NOT terminee OR is_admin())
  );
