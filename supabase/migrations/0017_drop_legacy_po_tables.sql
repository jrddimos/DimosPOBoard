-- ════════════════════════════════════════════════════════════════
-- 0017 — Suppression des tables/vues legacy "po_*"
-- ════════════════════════════════════════════════════════════════
-- Tables héritées d'un ancien tableau de bord, jamais utilisées par
-- le frontend actuel (aucune référence dans src/), déjà verrouillées
-- admin-only depuis 0002_cleanup_legacy_policies.sql par précaution.
-- Après vérification (0016 a déjà retiré le seul trigger qui y
-- écrivait encore, sync_po_sprints_from_taches) et confirmation
-- qu'aucune autre fonction/trigger n'y fait référence : suppression
-- définitive.
--
-- ⚠️ Irréversible — supprime aussi les données qu'elles contiennent
-- (dashboard legacy, PO/velocité/blocages d'un ancien système).
-- Vues d'abord (elles dépendent des tables), puis les tables.
-- ════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS po_vue_dashboard;
DROP VIEW IF EXISTS po_vue_reunions;

DROP TABLE IF EXISTS po_blocages;
DROP TABLE IF EXISTS po_sprints;
DROP TABLE IF EXISTS po_produits;
DROP TABLE IF EXISTS po_reunions;
