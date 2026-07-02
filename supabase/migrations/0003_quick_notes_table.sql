-- ════════════════════════════════════════════════════════════════
-- Table quick_notes — "Points à traiter" (panneau profil)
-- ════════════════════════════════════════════════════════════════
--
-- CONTEXTE
-- Le panneau "Points à traiter" (pied de la sidebar) stockait ses
-- notes dans le localStorage du navigateur (`quick_notes_${userId}`)
-- — perdues si on change d'appareil/navigateur, jamais synchronisées.
-- Cette table les persiste côté serveur, liées à l'utilisateur
-- connecté (auth.uid()).
--
-- Chaque utilisateur ne voit et ne modifie que SES PROPRES notes —
-- ce n'est pas une donnée d'équipe, donc pas de policy "lecture
-- ouverte" comme sur les tables partagées.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS quick_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text       text NOT NULL,
  done       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quick_notes_user_id_idx ON quick_notes(user_id);

ALTER TABLE quick_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quick_notes_select" ON quick_notes;
CREATE POLICY "quick_notes_select" ON quick_notes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "quick_notes_insert" ON quick_notes;
CREATE POLICY "quick_notes_insert" ON quick_notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "quick_notes_update" ON quick_notes;
CREATE POLICY "quick_notes_update" ON quick_notes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "quick_notes_delete" ON quick_notes;
CREATE POLICY "quick_notes_delete" ON quick_notes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
