-- ════════════════════════════════════════════════════════════════
-- 0070 — Motif d'absence confidentiel (RGPD)
-- ════════════════════════════════════════════════════════════════
-- `absences_select` était `USING (true)` : n'importe quel utilisateur
-- authentifié pouvait lire le motif libre (`label`, ex. "Arrêt maladie")
-- de N'IMPORTE QUI — potentiellement une donnée de santé, visible de toute
-- l'équipe via le Plan de charges (bouton "Gérer les absences" sur
-- chaque membre, src/pages/plancharges/MemberView.tsx).
--
-- Correctif à deux volets :
--   1. `absences_select` resserré au même principe que insert/delete déjà
--      en place (0024) : admin, PO d'au moins un produit, ou la personne
--      elle-même.
--   2. Le calcul de capacité (Plan de charges, widget cockpit "Charge
--      équipe") n'a besoin que des dates + trigramme, jamais du label —
--      vue `absences_capacite` (sans label ni created_by), lisible par
--      tout authentifié, pour ne pas casser ces écrans.
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "absences_select" ON absences;
CREATE POLICY "absences_select" ON absences FOR SELECT TO authenticated
  USING (
    is_admin()
    OR has_any_produit_role(ARRAY['po'])
    OR EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.trigramme = absences.trigramme)
  );

-- security_invoker = false (comportement par défaut) : la vue s'exécute
-- avec les droits de son propriétaire, qui contourne le RLS de la table
-- sous-jacente (comme les fonctions SECURITY DEFINER, ex. anonymize_user_
-- traces) — c'est ce qui permet à tout le monde de voir les dates/trigramme
-- de chacun pour le calcul de capacité, sans exposer `label`/`created_by`.
CREATE OR REPLACE VIEW absences_capacite
WITH (security_invoker = false) AS
  SELECT id, trigramme, annee, date_debut, date_fin FROM absences;

GRANT SELECT ON absences_capacite TO authenticated;
