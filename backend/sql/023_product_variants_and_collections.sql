-- =====================================================
-- 023 — Tables manquantes : variantes, collections, promotions
-- =====================================================
-- POURQUOI CE FICHIER EXISTE
--
-- Le code backend reference trois familles d'objets qu'AUCUN fichier SQL du
-- depot ne cree. Sur une base neuve, les routes correspondantes echouent avec
-- « relation ... does not exist » :
--
--   * `product_variants`      -> ~51 references (routes/products-v2.js,
--                                routes/orders-v2.js, src/services/productService.js)
--   * `collections`           -> routes/collections-v2.js, et cote frontend
--   * `collection_products`      app/[locale]/store/page.tsx qui lit
--                                `collection_name`, `tagline`, `product_count`
--   * `applicable_to` + les colonnes de `promotions` utilisees par
--                                routes/promotions-v2.js (`$7::applicable_to`)
--
-- S'y ajoutent deux colonnes de variante attendues par le stock :
--   * `stock.variant_id`           (ON CONFLICT (variant_id, warehouse_id),
--                                   routes/orders-v2.js:1025)
--   * `stock_movements.variant_id` (routes/stock-movements.js:203)
--
-- Idempotent : `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, et un
-- bloc `DO` pour le type ENUM (PostgreSQL n'accepte pas `CREATE TYPE IF NOT
-- EXISTS`). Le fichier est donc rejouable sans erreur.

-- =====================================================
-- 1. Variantes de produit
-- =====================================================

CREATE TABLE IF NOT EXISTS product_variants (
    id              SERIAL PRIMARY KEY,
    product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_name    VARCHAR(255) NOT NULL,
    sku             VARCHAR(100),
    barcode         VARCHAR(255),
    cost_price      NUMERIC(12,2),
    wholesale_price NUMERIC(12,2),
    current_price   NUMERIC(12,2),
    sale_price      NUMERIC(12,2),
    weight_kg       NUMERIC(8,3),
    is_default      BOOLEAN NOT NULL DEFAULT false,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    display_order   SMALLINT DEFAULT 0,
    metadata        JSONB,
    supplier_id     INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ
);

-- Unicite portant sur les lignes vivantes uniquement : une variante supprimee
-- (deleted_at non nul) ne doit pas bloquer la reutilisation de son SKU.
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_sku_key
    ON product_variants (LOWER(sku)) WHERE deleted_at IS NULL AND sku IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_barcode_key
    ON product_variants (LOWER(barcode)) WHERE deleted_at IS NULL AND barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_variants_product
    ON product_variants (product_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_variants_supplier
    ON product_variants (supplier_id);

-- =====================================================
-- 2. Colonnes de variante sur le stock
-- =====================================================

ALTER TABLE stock
    ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id) ON DELETE CASCADE;

-- Index uniques requis par les `ON CONFLICT` du code.
CREATE UNIQUE INDEX IF NOT EXISTS stock_variant_warehouse_key
    ON stock (variant_id, warehouse_id) WHERE variant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stock_product_warehouse_key
    ON stock (product_id, warehouse_id);

ALTER TABLE stock_movements
    ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON stock_movements(variant_id);

-- =====================================================
-- 3. Collections (catalogue editorial, noms multilingues)
-- =====================================================

CREATE TABLE IF NOT EXISTS collections (
    id                   SERIAL PRIMARY KEY,
    parent_collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL,
    -- Les noms et libelles sont multilingues : {"fr": "...", "ar": "..."}
    collection_name      JSONB NOT NULL,
    collection_slug      VARCHAR(255) NOT NULL UNIQUE,
    description          JSONB,
    tagline              JSONB,
    icon                 VARCHAR(255),
    gradient             VARCHAR(255),
    banner_image         VARCHAR(500),
    thumbnail_image      VARCHAR(500),
    benefits             JSONB,
    level                SMALLINT NOT NULL DEFAULT 1,
    sort_order           INTEGER DEFAULT 0,
    is_active            BOOLEAN DEFAULT true,
    meta_title           VARCHAR(255),
    meta_description     TEXT,
    created_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMPTZ,
    deleted_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_collections_parent ON collections(parent_collection_id);
CREATE INDEX IF NOT EXISTS idx_collections_active ON collections(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_collections_slug ON collections(collection_slug);

CREATE TABLE IF NOT EXISTS collection_products (
    id            SERIAL PRIMARY KEY,
    collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    product_id    INTEGER NOT NULL REFERENCES products(id)    ON DELETE CASCADE,
    UNIQUE (collection_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_products_collection ON collection_products(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_products_product ON collection_products(product_id);

-- =====================================================
-- 4. Promotions : type d'application + colonnes manquantes
-- =====================================================

DO $$
BEGIN
    CREATE TYPE applicable_to AS ENUM ('ALL', 'CATEGORIES', 'PRODUCTS', 'COLLECTIONS');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE promotions ADD COLUMN IF NOT EXISTS promotion_code        VARCHAR(50);
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS promotion_name        JSONB;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS min_order_amount      NUMERIC(12,2);
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS applicable_to         applicable_to;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS applicable_categories  INTEGER[];
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS applicable_products    INTEGER[];
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS applicable_collections INTEGER[];
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS max_uses              INTEGER DEFAULT 0;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS max_uses_per_user     INTEGER DEFAULT 1;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS current_uses          INTEGER DEFAULT 0;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS deleted_at            TIMESTAMPTZ;

-- NOTE : aucune correction n'est necessaire sur `promotions.discount_type`.
-- La colonne est de type ENUM `discount_type`, defini par `001_schema.sql:20`
-- avec exactement les valeurs minuscules que le code ecrit
-- ('fixed', 'percentage', 'free_shipping'). Un ENUM ne peut pas etre compare
-- via `lower()` ; la contrainte CHECK d'origine a donc deja disparu avec le
-- changement de type.

-- =====================================================
-- 5. Index de recherche sur les commandes
-- =====================================================

-- `008` / `010` renomment la colonne de suivi ; on s'assure que l'index suit.
CREATE INDEX IF NOT EXISTS idx_orders_tracking_number ON orders(tracking_number);
CREATE INDEX IF NOT EXISTS idx_orders_current_status ON orders(current_status);
