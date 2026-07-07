-- La vue "DoD" est en réalité utilisée comme un référentiel d'EXIGENCES
-- produit (F1.1 Alimentation, F2.x Train de galets…), pas comme une
-- Definition of Done de processus. On assume ce rôle : la table `dod` est
-- conservée telle quelle (renommer casserait lien_dod, RLS, hooks) mais
-- enrichie des attributs d'une exigence d'ingénierie :
--
--   type        : fonctionnelle | performance | securite | cout
--   criticite   : haute | moyenne | basse
--   verifiee    : distinct de "couverte" — une exigence est couverte quand
--                 une US y travaille (lien_dod), mais vérifiée seulement
--                 quand un essai l'a validée. C'est ce statut qui pilote la
--                 sortie des boucles proto/essais (P1 → P2 → P3…).
--   valeur_cible / valeur_constatee : pour les exigences chiffrées
--                 (coût cible costkilling, performance) — texte libre pour
--                 accepter "≤ 1200 €", "≥ 12 m/min", etc.
--
-- Idempotent : rejouable sans risque.
ALTER TABLE dod ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'fonctionnelle';
ALTER TABLE dod ADD COLUMN IF NOT EXISTS criticite text NOT NULL DEFAULT 'moyenne';
ALTER TABLE dod ADD COLUMN IF NOT EXISTS verifiee boolean NOT NULL DEFAULT false;
ALTER TABLE dod ADD COLUMN IF NOT EXISTS valeur_cible text;
ALTER TABLE dod ADD COLUMN IF NOT EXISTS valeur_constatee text;
