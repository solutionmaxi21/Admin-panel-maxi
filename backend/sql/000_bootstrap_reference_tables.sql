-- =====================================================
-- 000 — Bootstrap des tables de reference (shipping)
-- =====================================================
-- POURQUOI CE FICHIER EXISTE
--
-- `001_schema.sql` cree des cles etrangeres qui pointent vers `wilayas` et
-- `communes` (par ex. `addresses.wilaya_id REFERENCES wilayas(id)`), mais les
-- definitions de ces tables ont ete commentees dans `001_schema.sql` (lignes
-- 31-90) le jour ou les tables `guepex_*` les ont remplacees.
--
-- Consequence : la chaine de migrations n'est plus applicable sur une base
-- vierge. `001_schema.sql` echoue des sa premiere instruction avec
-- « relation "wilayas" does not exist », et donc aucun deploiement neuf ne
-- peut fonctionner.
--
-- Ce fichier restaure ces tables, avec les definitions d'origine copiees mot
-- pour mot depuis `001_schema.sql`, afin que la chaine complete s'applique sur
-- une base vide.
--
-- Ces tables sont volontairement transitoires : `006_create_standard_views.sql`
-- les supprime et les remplace par des vues au-dessus des tables `guepex_*`
-- (qui sont les tables reellement alimentees par l'API Guepex). Elles ne
-- servent ici qu'a satisfaire les contraintes de `001_schema.sql` au moment de
-- sa creation.
--
-- POURQUOI LE BLOC `DO` CI-DESSOUS
--
-- Un simple `CREATE TABLE IF NOT EXISTS` ne suffit pas a rendre ce fichier
-- rejouable. Apres `006_create_standard_views.sql`, `wilayas` n'est plus une
-- table mais une VUE : `CREATE TABLE IF NOT EXISTS wilayas` est alors ignore
-- (une relation de ce nom existe deja), et la cle etrangere de `communes` se
-- resout vers la vue, ce qui echoue avec :
--
--   « referenced relation "wilayas" is not a table »
--
-- Ce cas se produit des qu'une modification de ce fichier change son
-- empreinte SHA-256 et le fait rejouer sur une base deja migree. Le garde
-- ci-dessous rend le fichier inconditionnellement sur : si l'une des tables de
-- reference existe deja, sous forme de table ou de vue, le bloc ne fait rien.

DO $bootstrap$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN ('wilayas', 'communes', 'shipping_centers', 'shipping_tariffs')
    ) THEN
        RAISE NOTICE '000 : tables de reference deja presentes, ou remplacees par les vues de 006. Etape ignoree.';
        RETURN;
    END IF;

    -- Wilayas (Provinces)
    CREATE TABLE wilayas (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        zone SMALLINT NOT NULL CHECK (zone BETWEEN 1 AND 4),
        is_deliverable BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Communes (Cities/Towns)
    CREATE TABLE communes (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        wilaya_id INTEGER NOT NULL REFERENCES wilayas(id) ON DELETE RESTRICT,
        has_stop_desk BOOLEAN DEFAULT false,
        is_deliverable BOOLEAN DEFAULT true,
        delivery_time_parcel SMALLINT, -- Days
        delivery_time_payment SMALLINT, -- Days
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(name, wilaya_id)
    );

    -- Shipping Centers (Delivery agencies)
    CREATE TABLE shipping_centers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address TEXT NOT NULL,
        gps VARCHAR(100), -- "lat,lng"
        commune_id INTEGER REFERENCES communes(id) ON DELETE SET NULL,
        wilaya_id INTEGER NOT NULL REFERENCES wilayas(id) ON DELETE RESTRICT,
        provider VARCHAR(50), -- 'Yalidine', 'Guepex', etc.
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE
    );

    -- Shipping Tariffs (Fees)
    CREATE TABLE shipping_tariffs (
        id SERIAL PRIMARY KEY,
        from_wilaya_id INTEGER NOT NULL REFERENCES wilayas(id) ON DELETE CASCADE,
        to_wilaya_id INTEGER NOT NULL REFERENCES wilayas(id) ON DELETE CASCADE,
        to_commune_id INTEGER REFERENCES communes(id) ON DELETE CASCADE,
        zone SMALLINT NOT NULL,
        express_home DECIMAL(8,2),
        express_desk DECIMAL(8,2),
        economic_home DECIMAL(8,2),
        economic_desk DECIMAL(8,2),
        retour_fee DECIMAL(8,2),
        cod_percentage DECIMAL(5,2),
        insurance_percentage DECIMAL(5,2),
        oversize_fee DECIMAL(8,2),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE,
        UNIQUE(from_wilaya_id, to_wilaya_id, to_commune_id)
    );

    -- Index sur les colonnes de jointure.
    -- Volontairement limites a `shipping_centers` : `001_schema.sql` cree deja
    -- les index equivalents sur `communes(wilaya_id)` (:438) et sur les trois
    -- colonnes de `shipping_tariffs` (:442-444). Les redefinir ici ne
    -- produirait que des index dupliques.
    CREATE INDEX idx_shipping_centers_wilaya ON shipping_centers(wilaya_id);
    CREATE INDEX idx_shipping_centers_commune ON shipping_centers(commune_id);
END
$bootstrap$;
