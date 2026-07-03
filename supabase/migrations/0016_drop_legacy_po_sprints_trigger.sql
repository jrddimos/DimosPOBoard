-- ════════════════════════════════════════════════════════════════
-- 0016 — Suppression du trigger legacy sync_po_sprints_from_taches
-- ════════════════════════════════════════════════════════════════
-- Trigger hérité d'un ancien tableau de bord (jamais capturé dans
-- une migration), qui synchronisait à chaque UPDATE/INSERT/DELETE
-- sur `taches` vers la table `po_sprints` — verrouillée admin-only
-- depuis 0002_cleanup_legacy_policies.sql car confirmée inutilisée
-- par le frontend (aucune référence dans src/).
--
-- Effet de bord cassant : tout utilisateur non-admin qui modifie
-- une tâche (changement de statut, etc.) déclenche ce trigger, qui
-- tente d'écrire dans po_sprints et se fait bloquer par sa policy
-- RLS admin-only → l'UPDATE entier échoue avec 42501, y compris
-- pour l'utilisateur PO/dev légitime sur son propre produit.
--
-- Le trigger utilisait en plus un produit_id=1 codé en dur (commentaire
-- "produit_id D3X+"), donc était déjà incorrect pour tous les autres
-- produits même quand il ne plantait pas.
-- ════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_sync_po_from_taches ON taches;
DROP FUNCTION IF EXISTS sync_po_sprints_from_taches();
