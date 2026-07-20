-- ════════════════════════════════════════════════════════════════
-- 0060 — Tâches : plusieurs assignés sur une US
-- ════════════════════════════════════════════════════════════════
-- `taches.assigne_a` reste une colonne texte (pas de migration de type) :
-- une US peut désormais y stocker plusieurs trigrammes séparés par des
-- virgules ("ABC, DEF"), lus/écrits côté app via parseAssignees/
-- serializeAssignees (src/lib/utils.ts). Une sous-tâche continue de n'y
-- stocker qu'un seul trigramme — règle appliquée côté UI, pas en base.
--
-- effort_realise_split (jsonb, {trigramme: jours}) : quand une US SANS
-- sous-tâche a plusieurs assignés et son propre effort réalisé, le popup
-- de clôture (SprintBoardPage) demande la répartition entre eux plutôt que
-- de tout créditer au premier — c'est cette répartition qui est stockée
-- ici, lue par useRealiseFromTasks pour alimenter le Plan de charges.
--
-- notify_task_assignment : réécrit pour boucler sur chaque trigramme de
-- NEW.assigne_a (au lieu d'une comparaison stricte) et ne notifier que les
-- assignés NOUVELLEMENT ajoutés (absents de OLD.assigne_a) — sinon modifier
-- n'importe quel autre champ d'une US à 3 assignés aurait renotifié les 3
-- à chaque fois (l'ancien trigger ne se déclenchait que si assigne_a
-- changeait tout court, donc ce risque n'existait pas en mono-assigné).
-- ════════════════════════════════════════════════════════════════

ALTER TABLE taches ADD COLUMN IF NOT EXISTS effort_realise_split jsonb;

CREATE OR REPLACE FUNCTION notify_task_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
  v_new_tri text;
  v_old_set text[];
BEGIN
  IF NEW.assigne_a IS NULL OR NEW.produit_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigne_a IS NOT DISTINCT FROM OLD.assigne_a THEN RETURN NEW; END IF;

  v_old_set := CASE WHEN TG_OP = 'UPDATE' AND OLD.assigne_a IS NOT NULL
    THEN (SELECT array_agg(trim(t)) FROM regexp_split_to_table(OLD.assigne_a, '[,;]+') AS t WHERE trim(t) <> '')
    ELSE '{}'::text[] END;

  FOR v_new_tri IN SELECT trim(t) FROM regexp_split_to_table(NEW.assigne_a, '[,;]+') AS t WHERE trim(t) <> ''
  LOOP
    IF v_new_tri = ANY(v_old_set) THEN CONTINUE; END IF;
    SELECT user_id INTO v_user_id FROM user_profiles WHERE trigramme = v_new_tri LIMIT 1;
    IF v_user_id IS NULL OR v_user_id = auth.uid() THEN CONTINUE; END IF;
    INSERT INTO notifications (user_id, produit_id, type, title, body, target)
    VALUES (v_user_id, NEW.produit_id, 'assignation', 'Nouvelle tâche assignée', NEW.titre, NEW.id_tache);
  END LOOP;
  RETURN NEW;
END;
$$;
