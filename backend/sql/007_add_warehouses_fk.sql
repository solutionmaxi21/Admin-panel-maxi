-- Add FK from warehouses.wilaya_id to guepex_wilayas
-- Safe to rerun (drops existing constraint if present)

ALTER TABLE warehouses
  DROP CONSTRAINT IF EXISTS fk_warehouses_wilaya;

ALTER TABLE warehouses
  ADD CONSTRAINT fk_warehouses_wilaya
    FOREIGN KEY (wilaya_id)
    REFERENCES guepex_wilayas(id)
    ON DELETE SET NULL;
