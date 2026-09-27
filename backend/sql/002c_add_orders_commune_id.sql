-- =====================================================
-- 002c — Colonne transitoire `orders.commune_id`
-- =====================================================
-- POURQUOI CE FICHIER EXISTE
--
-- `orders` est creee par `001_schema.sql` SANS colonne `commune_id`, mais deux
-- migrations ulterieures l'attendent :
--
--   * `008_comprehensive_fixes.sql:84`  -> copie `commune_id` vers
--     `delivery_commune_id` (`SET delivery_commune_id = commune_id ...`), puis
--     lui ajoute une cle etrangere vers `guepex_communes` (:90-105) et un index
--     partiel (:158) ;
--   * `010_optimize_orders_table.sql:103` -> meme recopie de secours, puis
--     `ALTER TABLE orders DROP COLUMN IF EXISTS commune_id;` (:138).
--
-- Sans cette colonne, `008` et `010` echouent tous les deux avec
-- « column "commune_id" does not exist » et la chaine de migrations s'arrete
-- avant d'appliquer les ~28 colonnes de commande dont depend le code
-- (`current_status`, `tracking_number`, `delivery_wilaya_id`, ...).
--
-- Il s'agit donc d'une colonne **transitoire** : creee ici, alimentee par
-- `008`, puis supprimee par `010`. Elle doit exister avant `008`.
--
-- Idempotent : `IF NOT EXISTS`, donc rejouable sans erreur.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS commune_id INTEGER;

COMMENT ON COLUMN orders.commune_id IS
  'TRANSITOIRE : ancienne commune de livraison. Recopiee vers delivery_commune_id par 008, puis supprimee par 010.';
