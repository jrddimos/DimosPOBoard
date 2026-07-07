-- Propositions d'amélioration de l'application : tout utilisateur connecté
-- peut en soumettre une ; seuls les admins peuvent accepter/rejeter/fermer.
CREATE TABLE IF NOT EXISTS suggestions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auteur_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titre       text NOT NULL,
  description text,
  statut      text NOT NULL DEFAULT 'nouvelle' CHECK (statut IN ('nouvelle', 'acceptee', 'rejetee', 'fermee')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);
CREATE INDEX IF NOT EXISTS suggestions_statut_idx ON suggestions(statut);

ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suggestions_select" ON suggestions FOR SELECT TO authenticated USING (true);
CREATE POLICY "suggestions_insert" ON suggestions FOR INSERT TO authenticated WITH CHECK (auteur_id = auth.uid());
CREATE POLICY "suggestions_update" ON suggestions FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "suggestions_delete" ON suggestions FOR DELETE TO authenticated USING (is_admin());
