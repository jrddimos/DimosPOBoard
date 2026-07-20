-- ════════════════════════════════════════════════════════════════
-- 0059 — Suggestions : critère d'importance + édition par l'auteur
-- ════════════════════════════════════════════════════════════════
-- Ajoute un niveau d'importance (basse/moyenne/haute), choisi à la création
-- et modifiable ensuite, pour pouvoir trier les propositions par importance
-- (en plus du tri par créateur, fait côté client).
-- Ouvre aussi l'UPDATE aux auteurs sur leurs propres propositions (pas
-- seulement aux admins comme avant) : ils doivent pouvoir revenir dessus
-- pour les compléter (titre/description/importance), pas seulement les
-- admins qui ne touchaient jusqu'ici qu'au statut.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS importance text NOT NULL DEFAULT 'moyenne'
  CHECK (importance IN ('basse', 'moyenne', 'haute'));

DROP POLICY IF EXISTS "suggestions_update" ON suggestions;
CREATE POLICY "suggestions_update" ON suggestions FOR UPDATE TO authenticated
  USING (auteur_id = auth.uid() OR is_admin())
  WITH CHECK (auteur_id = auth.uid() OR is_admin());
