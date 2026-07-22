-- ════════════════════════════════════════════════════════════════
-- 0071 — Documente le SECURITY DEFINER volontaire de absences_capacite
-- ════════════════════════════════════════════════════════════════
-- L'audit sécurité Supabase flague absences_capacite (0070) comme vue
-- SECURITY DEFINER — avertissement générique et volontaire ici : la vue
-- ne réexpose QUE des colonnes non sensibles (id, trigramme, annee,
-- date_debut, date_fin), jamais `label` (motif, potentiellement une
-- donnée de santé) ni `created_by`, qui restent protégés par le RLS
-- resserré de `absences`. Pas une fuite — un contournement de RLS
-- délibéré et scopé, documenté ici pour une future revue de sécurité.
-- ════════════════════════════════════════════════════════════════

COMMENT ON VIEW absences_capacite IS
  'SECURITY DEFINER volontaire (cf. migration 0070/0071) : expose uniquement id/trigramme/annee/date_debut/date_fin pour le calcul de capacité (Plan de charges, widget Charge équipe) — jamais label ni created_by, qui restent protégés par le RLS de absences (admin/PO/soi-même). Faux positif attendu dans l''audit sécurité Supabase.';
