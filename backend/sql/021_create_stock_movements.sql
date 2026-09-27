-- =====================================================
-- STOCK MOVEMENTS TABLE
-- Migration: 021_create_stock_movements.sql
-- Purpose: Track all stock movements including warehouse transfers
--          with cost optimization features
-- =====================================================

-- Create stock movement types enum
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_movement_type') THEN
        CREATE TYPE stock_movement_type AS ENUM (
            'in',              -- Stock coming in (purchase, return from customer)
            'out',             -- Stock going out (sale, damage, loss)
            'transfer_out',    -- Transfer from this warehouse to another
            'transfer_in',     -- Transfer received from another warehouse
            'adjustment',      -- Manual adjustment (inventory count correction)
            'return',          -- Return from customer
            'damaged',         -- Marked as damaged
            'reserved',        -- Reserved for order
            'released'         -- Released from reservation
        );
    END IF;
END $$;

-- Create stock movements table
CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    
    -- Reference fields
    stock_id INTEGER NOT NULL REFERENCES stock(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    
    -- Movement details
    movement_type stock_movement_type NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    quantity_before INTEGER NOT NULL CHECK (quantity_before >= 0),
    quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),
    
    -- Transfer-specific fields
    from_warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
    to_warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
    transfer_cost DECIMAL(12,2) DEFAULT 0 CHECK (transfer_cost >= 0),
    
    -- Tracking and audit
    reason TEXT,
    reference_type VARCHAR(50), -- 'order', 'return', 'manual', 'transfer', 'purchase'
    reference_id INTEGER, -- ID of related order, return, etc.
    unit_cost DECIMAL(12,2), -- Cost per unit at time of movement
    total_value DECIMAL(12,2), -- Total value of movement (quantity * unit_cost)
    
    -- User tracking
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Notes and metadata
    notes TEXT,
    metadata JSONB, -- Additional data like shipping info, damage details, etc.
    
    -- Constraints
    CHECK (
        -- Transfer movements must have both warehouses
        (movement_type IN ('transfer_out', 'transfer_in') AND from_warehouse_id IS NOT NULL AND to_warehouse_id IS NOT NULL)
        OR
        -- Non-transfer movements should not have transfer warehouses
        (movement_type NOT IN ('transfer_out', 'transfer_in') AND from_warehouse_id IS NULL AND to_warehouse_id IS NULL)
    ),
    CHECK (
        -- Transfer out: from_warehouse must match warehouse_id
        (movement_type = 'transfer_out' AND from_warehouse_id = warehouse_id)
        OR
        -- Transfer in: to_warehouse must match warehouse_id
        (movement_type = 'transfer_in' AND to_warehouse_id = warehouse_id)
        OR
        -- Not a transfer
        (movement_type NOT IN ('transfer_out', 'transfer_in'))
    )
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX idx_stock_movements_stock ON stock_movements(stock_id);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_warehouse ON stock_movements(warehouse_id);
CREATE INDEX idx_stock_movements_type ON stock_movements(movement_type);
CREATE INDEX idx_stock_movements_date ON stock_movements(created_at DESC);
CREATE INDEX idx_stock_movements_reference ON stock_movements(reference_type, reference_id);
CREATE INDEX idx_stock_movements_transfer_from ON stock_movements(from_warehouse_id) WHERE movement_type = 'transfer_out';
CREATE INDEX idx_stock_movements_transfer_to ON stock_movements(to_warehouse_id) WHERE movement_type = 'transfer_in';
CREATE INDEX idx_stock_movements_created_by ON stock_movements(created_by);

-- =====================================================
-- VIEWS FOR REPORTING
-- =====================================================

-- View: Recent stock movements with details
CREATE OR REPLACE VIEW v_stock_movements_detailed AS
SELECT 
    sm.id,
    sm.movement_type,
    sm.quantity,
    sm.quantity_before,
    sm.quantity_after,
    sm.transfer_cost,
    sm.unit_cost,
    sm.total_value,
    sm.reason,
    sm.reference_type,
    sm.reference_id,
    sm.created_at,
    
    -- Product info
    p.id as product_id,
    p.product_name,
    p.sku,
    
    -- Warehouse info
    w.id as warehouse_id,
    w.warehouse_name,
    w.location_address,
    
    -- Transfer warehouse info
    wf.id as from_warehouse_id,
    wf.warehouse_name as from_warehouse_name,
    wt.id as to_warehouse_id,
    wt.warehouse_name as to_warehouse_name,
    
    -- User info
    u.id as user_id,
    u.username as created_by_username,
    
    sm.notes,
    sm.metadata
FROM stock_movements sm
INNER JOIN products p ON sm.product_id = p.id
INNER JOIN warehouses w ON sm.warehouse_id = w.id
LEFT JOIN warehouses wf ON sm.from_warehouse_id = wf.id
LEFT JOIN warehouses wt ON sm.to_warehouse_id = wt.id
LEFT JOIN users u ON sm.created_by = u.id;

-- View: Transfer summary by warehouse
CREATE OR REPLACE VIEW v_warehouse_transfers_summary AS
SELECT 
    w.id as warehouse_id,
    w.warehouse_name,
    COUNT(*) FILTER (WHERE sm.movement_type = 'transfer_out') as transfers_out_count,
    COUNT(*) FILTER (WHERE sm.movement_type = 'transfer_in') as transfers_in_count,
    SUM(sm.quantity) FILTER (WHERE sm.movement_type = 'transfer_out') as qty_transferred_out,
    SUM(sm.quantity) FILTER (WHERE sm.movement_type = 'transfer_in') as qty_transferred_in,
    SUM(sm.transfer_cost) FILTER (WHERE sm.movement_type = 'transfer_out') as total_transfer_costs,
    SUM(sm.total_value) FILTER (WHERE sm.movement_type = 'transfer_out') as total_value_out,
    SUM(sm.total_value) FILTER (WHERE sm.movement_type = 'transfer_in') as total_value_in
FROM warehouses w
LEFT JOIN stock_movements sm ON w.id = sm.warehouse_id
WHERE w.deleted_at IS NULL
GROUP BY w.id, w.warehouse_name;

-- View: Cost analysis for stock movements
CREATE OR REPLACE VIEW v_stock_movement_costs AS
SELECT 
    DATE_TRUNC('month', sm.created_at) as month,
    sm.movement_type,
    w.warehouse_name,
    COUNT(*) as movement_count,
    SUM(sm.quantity) as total_quantity,
    SUM(sm.transfer_cost) as total_transfer_cost,
    SUM(sm.total_value) as total_movement_value,
    AVG(sm.transfer_cost) as avg_transfer_cost,
    AVG(sm.unit_cost) as avg_unit_cost
FROM stock_movements sm
INNER JOIN warehouses w ON sm.warehouse_id = w.id
WHERE sm.created_at >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', sm.created_at), sm.movement_type, w.warehouse_name
ORDER BY month DESC, total_transfer_cost DESC;

-- =====================================================
-- FUNCTION: Record stock movement with automatic tracking
-- =====================================================

CREATE OR REPLACE FUNCTION record_stock_movement(
    p_stock_id INTEGER,
    p_product_id INTEGER,
    p_warehouse_id INTEGER,
    p_movement_type stock_movement_type,
    p_quantity INTEGER,
    p_reason TEXT DEFAULT NULL,
    p_reference_type VARCHAR(50) DEFAULT NULL,
    p_reference_id INTEGER DEFAULT NULL,
    p_from_warehouse_id INTEGER DEFAULT NULL,
    p_to_warehouse_id INTEGER DEFAULT NULL,
    p_transfer_cost DECIMAL DEFAULT 0,
    p_unit_cost DECIMAL DEFAULT NULL,
    p_created_by INTEGER DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_quantity_before INTEGER;
    v_quantity_after INTEGER;
    v_movement_id INTEGER;
    v_current_stock RECORD;
    v_calculated_cost DECIMAL;
BEGIN
    -- Get current stock quantity
    SELECT quantity, cost_price INTO v_current_stock
    FROM stock s
    INNER JOIN products p ON s.product_id = p.id
    WHERE s.id = p_stock_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock record not found: %', p_stock_id;
    END IF;
    
    v_quantity_before := v_current_stock.quantity;
    
    -- Calculate quantity after based on movement type
    CASE p_movement_type
        WHEN 'in', 'transfer_in', 'return', 'released' THEN
            v_quantity_after := v_quantity_before + p_quantity;
        WHEN 'out', 'transfer_out', 'damaged', 'reserved' THEN
            v_quantity_after := v_quantity_before - p_quantity;
        WHEN 'adjustment' THEN
            -- For adjustments, p_quantity is the new total, not delta
            v_quantity_after := p_quantity;
            p_quantity := ABS(p_quantity - v_quantity_before);
        ELSE
            RAISE EXCEPTION 'Invalid movement type: %', p_movement_type;
    END CASE;
    
    -- Use product cost_price if unit_cost not provided
    IF p_unit_cost IS NULL THEN
        v_calculated_cost := COALESCE(v_current_stock.cost_price, 0);
    ELSE
        v_calculated_cost := p_unit_cost;
    END IF;
    
    -- Insert movement record
    INSERT INTO stock_movements (
        stock_id,
        product_id,
        warehouse_id,
        movement_type,
        quantity,
        quantity_before,
        quantity_after,
        from_warehouse_id,
        to_warehouse_id,
        transfer_cost,
        reason,
        reference_type,
        reference_id,
        unit_cost,
        total_value,
        created_by,
        notes,
        metadata,
        created_at
    ) VALUES (
        p_stock_id,
        p_product_id,
        p_warehouse_id,
        p_movement_type,
        p_quantity,
        v_quantity_before,
        v_quantity_after,
        p_from_warehouse_id,
        p_to_warehouse_id,
        p_transfer_cost,
        p_reason,
        p_reference_type,
        p_reference_id,
        v_calculated_cost,
        v_calculated_cost * p_quantity,
        p_created_by,
        p_notes,
        p_metadata,
        CURRENT_TIMESTAMP
    ) RETURNING id INTO v_movement_id;
    
    RETURN v_movement_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE stock_movements IS 'Tracks all stock movements including warehouse transfers with cost optimization';
COMMENT ON COLUMN stock_movements.movement_type IS 'Type of stock movement (in/out/transfer/adjustment)';
COMMENT ON COLUMN stock_movements.transfer_cost IS 'Cost associated with transferring stock between warehouses';
COMMENT ON COLUMN stock_movements.total_value IS 'Total inventory value of this movement (quantity * unit_cost)';
COMMENT ON FUNCTION record_stock_movement IS 'Helper function to record stock movements with automatic quantity tracking';

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

GRANT SELECT, INSERT ON stock_movements TO postgres;
GRANT USAGE ON SEQUENCE stock_movements_id_seq TO postgres;
GRANT SELECT ON v_stock_movements_detailed TO postgres;
GRANT SELECT ON v_warehouse_transfers_summary TO postgres;
GRANT SELECT ON v_stock_movement_costs TO postgres;
