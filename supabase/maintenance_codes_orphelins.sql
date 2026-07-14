-- ═══════════════════════════════════════════════════════════════════
-- Nettoyage des codes Épic/Jalon orphelins portés par les tâches
-- ═══════════════════════════════════════════════════════════════════
-- Une tâche référence son épic par le libellé complet "CODE — NOM" et son
-- jalon par le code — de simples champs texte. Quand un épic/jalon est
-- renommé ou supprimé du référentiel (tables epics/jalons), ou quand une
-- tâche est importée/dupliquée, le texte porté par la tâche peut ne plus
-- correspondre à rien : le dashboard produit les affiche alors marqués
-- "(hors référentiel)".
--
-- À exécuter dans Supabase → SQL Editor. Les SELECT sont sans risque ;
-- les UPDATE en bas sont des modèles à adapter, à lancer UN PAR UN.
-- ATTENTION : le séparateur des épics est " — " (tiret cadratin), pas "-".

-- ── 1. DIAGNOSTIC ────────────────────────────────────────────────────

-- Épics orphelins : tâches dont l'epic n'existe pas dans le référentiel
-- de LEUR produit (libellé attendu : code || ' — ' || nom)
SELECT t.produit_id, p.nom AS produit, t.epic AS epic_orphelin,
       count(*) AS nb_taches, array_agg(t.id_tache ORDER BY t.id_tache) AS taches
FROM taches t
JOIN produits p ON p.id = t.produit_id
WHERE t.epic IS NOT NULL AND t.epic <> ''
  AND NOT EXISTS (
    SELECT 1 FROM epics e
    WHERE e.produit_id = t.produit_id
      AND (e.code || ' — ' || e.nom) = t.epic
  )
GROUP BY t.produit_id, p.nom, t.epic
ORDER BY p.nom, t.epic;

-- Jalons orphelins : tâches dont le jalon n'existe pas dans le
-- référentiel de LEUR produit
SELECT t.produit_id, p.nom AS produit, t.jalon AS jalon_orphelin,
       count(*) AS nb_taches, array_agg(t.id_tache ORDER BY t.id_tache) AS taches
FROM taches t
JOIN produits p ON p.id = t.produit_id
WHERE t.jalon IS NOT NULL AND t.jalon <> ''
  AND NOT EXISTS (
    SELECT 1 FROM jalons j
    WHERE j.produit_id = t.produit_id AND j.code = t.jalon
  )
GROUP BY t.produit_id, p.nom, t.jalon
ORDER BY p.nom, t.jalon;

-- Cas fréquent à repérer : un épic renommé — même code, nom différent.
-- Liste les orphelins dont le CODE (avant " — ") existe encore : le remap
-- est alors automatique (requête 2a).
SELECT DISTINCT t.produit_id, p.nom AS produit,
       t.epic AS epic_orphelin,
       (e.code || ' — ' || e.nom) AS epic_actuel
FROM taches t
JOIN produits p ON p.id = t.produit_id
JOIN epics e ON e.produit_id = t.produit_id
           AND e.code = split_part(t.epic, ' — ', 1)
WHERE t.epic IS NOT NULL AND t.epic <> ''
  AND (e.code || ' — ' || e.nom) <> t.epic;

-- ── 2. CORRECTIONS (modèles — adapter puis exécuter un par un) ──────

-- 2a. Épics renommés : réaligne automatiquement le libellé des tâches
-- sur le référentiel quand le code correspond encore. (Sans danger :
-- ne touche que les tâches dont le code épic existe dans le référentiel.)
-- UPDATE taches t
-- SET epic = e.code || ' — ' || e.nom
-- FROM epics e
-- WHERE e.produit_id = t.produit_id
--   AND e.code = split_part(t.epic, ' — ', 1)
--   AND (e.code || ' — ' || e.nom) <> t.epic;

-- 2b. Remap manuel d'un épic orphelin vers un épic existant :
-- UPDATE taches
-- SET epic = 'EPIC 3 — Nouveau nom exact'
-- WHERE produit_id = <ID_PRODUIT> AND epic = '<libellé orphelin exact>';

-- 2c. Remap manuel d'un jalon orphelin :
-- UPDATE taches
-- SET jalon = 'I2'
-- WHERE produit_id = <ID_PRODUIT> AND jalon = '<code orphelin>';

-- 2d. Détacher (vider) un code sans équivalent :
-- UPDATE taches SET epic = NULL
-- WHERE produit_id = <ID_PRODUIT> AND epic = '<libellé orphelin exact>';
-- UPDATE taches SET jalon = NULL
-- WHERE produit_id = <ID_PRODUIT> AND jalon = '<code orphelin>';

-- ── 3. VÉRIFICATION ──────────────────────────────────────────────────
-- Relancer les deux SELECT du §1 : ils doivent revenir vides.
