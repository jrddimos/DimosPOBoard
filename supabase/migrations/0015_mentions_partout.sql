-- ════════════════════════════════════════════════════════════════
-- 0015 — Mentions @trigramme dans tous les champs commentaire/notes
-- ════════════════════════════════════════════════════════════════
-- Jusqu'ici seul le fil de discussion (tache_commentaires, table
-- append-only) déclenchait une vraie notification de mention. On
-- étend le mécanisme à taches.commentaire et aux notes de la
-- réunion PO (reunions.notes_seance/phase_notes, reunion_revues.notes),
-- qui sont des champs modifiables (UPDATE), pas un journal d'entrées.
-- On ne notifie que les mentions NOUVELLEMENT ajoutées (diff ancien
-- texte / nouveau texte), pour ne pas spammer à chaque sauvegarde.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('assignation', 'sprint_cloture', 'tache_bloquee', 'mention', 'acces_demande', 'mention_reunion'));

CREATE OR REPLACE FUNCTION extract_mentions(txt text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(array_agg(DISTINCT m[1]), '{}')
  FROM regexp_matches(COALESCE(txt, ''), '@([A-Za-z0-9]{2,5})', 'g') AS m
$$;

-- 1. Commentaire PO d'une tâche (taches.commentaire)
CREATE OR REPLACE FUNCTION notify_mention_commentaire_tache()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_mentions text[];
  v_trigramme text;
  v_user_id uuid;
BEGIN
  IF NEW.produit_id IS NULL THEN RETURN NEW; END IF;
  v_new_mentions := ARRAY(
    SELECT unnest(extract_mentions(NEW.commentaire))
    EXCEPT SELECT unnest(extract_mentions(OLD.commentaire))
  );
  FOREACH v_trigramme IN ARRAY v_new_mentions LOOP
    SELECT user_id INTO v_user_id FROM user_profiles WHERE trigramme = v_trigramme LIMIT 1;
    IF v_user_id IS NOT NULL AND v_user_id <> auth.uid() THEN
      INSERT INTO notifications (user_id, produit_id, type, title, body, target)
      VALUES (v_user_id, NEW.produit_id, 'mention', 'Vous avez été mentionné', NEW.titre, NEW.id_tache);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_mention_commentaire_tache ON taches;
CREATE TRIGGER trg_notify_mention_commentaire_tache AFTER UPDATE OF commentaire ON taches
FOR EACH ROW WHEN (NEW.commentaire IS DISTINCT FROM OLD.commentaire)
EXECUTE FUNCTION notify_mention_commentaire_tache();

-- 2. Notes de séance + notes par phase (reunions)
CREATE OR REPLACE FUNCTION notify_mention_reunion_notes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_text text;
  v_new_text text;
  v_new_mentions text[];
  v_trigramme text;
  v_user_id uuid;
  v_target text;
BEGIN
  v_old_text := COALESCE(OLD.notes_seance, '') || ' ' ||
    COALESCE((SELECT string_agg(x, ' ') FROM jsonb_array_elements_text(OLD.phase_notes) x), '');
  v_new_text := COALESCE(NEW.notes_seance, '') || ' ' ||
    COALESCE((SELECT string_agg(x, ' ') FROM jsonb_array_elements_text(NEW.phase_notes) x), '');
  v_new_mentions := ARRAY(SELECT unnest(extract_mentions(v_new_text)) EXCEPT SELECT unnest(extract_mentions(v_old_text)));
  v_target := NEW.semaine::text || '-' || NEW.annee::text;
  FOREACH v_trigramme IN ARRAY v_new_mentions LOOP
    SELECT user_id INTO v_user_id FROM user_profiles WHERE trigramme = v_trigramme LIMIT 1;
    IF v_user_id IS NOT NULL AND v_user_id <> auth.uid() THEN
      INSERT INTO notifications (user_id, produit_id, type, title, body, target)
      VALUES (v_user_id, NULL, 'mention_reunion', 'Mentionné en réunion PO', 'Semaine ' || NEW.semaine || '/' || NEW.annee, v_target);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_mention_reunion_notes ON reunions;
CREATE TRIGGER trg_notify_mention_reunion_notes AFTER UPDATE ON reunions
FOR EACH ROW WHEN (NEW.notes_seance IS DISTINCT FROM OLD.notes_seance OR NEW.phase_notes IS DISTINCT FROM OLD.phase_notes)
EXECUTE FUNCTION notify_mention_reunion_notes();

-- 3. Notes de revue par produit (reunion_revues.notes)
-- Passage en upsert côté front (au lieu de delete+reinsert à chaque
-- sauvegarde) pour permettre un vrai diff ancien/nouveau texte.
ALTER TABLE reunion_revues DROP CONSTRAINT IF EXISTS reunion_revues_reunion_produit_uniq;
ALTER TABLE reunion_revues ADD CONSTRAINT reunion_revues_reunion_produit_uniq UNIQUE (reunion_id, produit_id);

CREATE OR REPLACE FUNCTION notify_mention_reunion_revue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_text text := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.notes, '') ELSE '' END;
  v_new_mentions text[];
  v_trigramme text;
  v_user_id uuid;
  v_semaine int;
  v_annee int;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.notes IS NOT DISTINCT FROM OLD.notes THEN RETURN NEW; END IF;
  v_new_mentions := ARRAY(SELECT unnest(extract_mentions(NEW.notes)) EXCEPT SELECT unnest(extract_mentions(v_old_text)));
  IF array_length(v_new_mentions, 1) IS NULL THEN RETURN NEW; END IF;

  SELECT semaine, annee INTO v_semaine, v_annee FROM reunions WHERE id = NEW.reunion_id;

  FOREACH v_trigramme IN ARRAY v_new_mentions LOOP
    SELECT user_id INTO v_user_id FROM user_profiles WHERE trigramme = v_trigramme LIMIT 1;
    IF v_user_id IS NOT NULL AND v_user_id <> auth.uid() THEN
      INSERT INTO notifications (user_id, produit_id, type, title, body, target)
      VALUES (v_user_id, NEW.produit_id, 'mention_reunion', 'Mentionné en réunion PO',
        'Semaine ' || v_semaine || '/' || v_annee, v_semaine::text || '-' || v_annee::text);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_mention_reunion_revue ON reunion_revues;
CREATE TRIGGER trg_notify_mention_reunion_revue AFTER INSERT OR UPDATE OF notes ON reunion_revues
FOR EACH ROW EXECUTE FUNCTION notify_mention_reunion_revue();
