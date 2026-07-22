-- ════════════════════════════════════════════════════════════════
-- 0064 — Active Supabase Realtime sur taches
-- ════════════════════════════════════════════════════════════════
-- Pousse en direct les modifications de `taches` vers tous les clients
-- connectés au même produit (cf. src/hooks/useTachesRealtime.ts) — sans ça,
-- chacun ne voyait les changements des autres qu'au prochain refetch
-- (staleTime 30s + refocus), jamais pendant qu'un panneau de détail reste
-- ouvert. RLS déjà compatible (mêmes policies que les requêtes normales,
-- Realtime les applique par ligne via le rôle authenticated).
-- ════════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE public.taches;
