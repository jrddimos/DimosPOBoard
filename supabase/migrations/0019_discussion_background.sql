-- ════════════════════════════════════════════════════════════════
-- 0019 — Fond personnalisable du canal de discussion produit
-- ════════════════════════════════════════════════════════════════
-- Un admin peut définir une image de fond + son opacité pour le
-- panneau de discussion d'un produit. Stockage dans un nouveau
-- bucket public dédié (même pattern que "avatars"), upload réservé
-- aux admins.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE produits ADD COLUMN IF NOT EXISTS discussion_bg_url     text;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS discussion_bg_opacity numeric NOT NULL DEFAULT 0.15;

INSERT INTO storage.buckets (id, name, public)
VALUES ('discussion-backgrounds', 'discussion-backgrounds', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "discussion_bg_public_read" ON storage.objects;
CREATE POLICY "discussion_bg_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'discussion-backgrounds');

DROP POLICY IF EXISTS "discussion_bg_admin_upload" ON storage.objects;
CREATE POLICY "discussion_bg_admin_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'discussion-backgrounds' AND is_admin());

DROP POLICY IF EXISTS "discussion_bg_admin_update" ON storage.objects;
CREATE POLICY "discussion_bg_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'discussion-backgrounds' AND is_admin())
  WITH CHECK (bucket_id = 'discussion-backgrounds' AND is_admin());

DROP POLICY IF EXISTS "discussion_bg_admin_delete" ON storage.objects;
CREATE POLICY "discussion_bg_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'discussion-backgrounds' AND is_admin());
