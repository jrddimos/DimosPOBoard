-- ════════════════════════════════════════════════════════════════
-- Nettoyage des doublons quick_notes créés par la race condition de
-- la migration localStorage → Supabase (corrigée depuis dans le code).
-- Garde la ligne la plus ancienne par (user_id, text) et supprime
-- les copies plus récentes.
-- ════════════════════════════════════════════════════════════════

DELETE FROM quick_notes
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (PARTITION BY user_id, text ORDER BY created_at ASC) AS rn
    FROM quick_notes
  ) ranked
  WHERE rn > 1
);
