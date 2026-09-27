import express from 'express';
import { authenticateToken, requireAdmin } from '../src/shared/middleware/auth.js';
import { asyncHandler } from '../src/shared/middleware/errorHandler.js';
import { NotFoundError, ValidationError } from '../src/shared/errors/index.js';
import db from '../src/db/postgres.js';

const router = express.Router();

/**
 * GET /api/warehouses
 * Get all warehouses
 */
router.get('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const warehouses = await db.queryMany(
        'SELECT * FROM warehouses WHERE deleted_at IS NULL ORDER BY warehouse_name'
    );
    res.json(warehouses);
}));

/**
 * GET /api/warehouses/trash
 * List soft-deleted warehouses
 * IMPORTANT: must be defined BEFORE /:id to avoid Express routing conflicts
 */
router.get('/trash', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { search } = req.query;
    const params = [];
    let query = 'SELECT * FROM warehouses WHERE deleted_at IS NOT NULL';

    if (search) {
        params.push(`%${search}%`);
        query += ` AND (warehouse_name ILIKE $${params.length} OR location_address ILIKE $${params.length})`;
    }

    query += ' ORDER BY deleted_at DESC';

    const warehouses = await db.queryMany(query, params);
    res.json(warehouses);
}));

/**
 * GET /api/warehouses/:id
 * Get warehouse by ID
 */
router.get('/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    const warehouse = await db.queryOne(
        'SELECT * FROM warehouses WHERE id = $1 AND deleted_at IS NULL',
        [id]
    );

    if (!warehouse) {
        throw new NotFoundError('Warehouse not found');
    }

    res.json(warehouse);
}));

/**
 * POST /api/warehouses
 * Create new warehouse
 */
router.post('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { name, address, phone, wilaya_id } = req.body;

    if (!name) {
        throw new ValidationError([{ field: 'name', message: 'Warehouse name is required' }]);
    }

    const existing = await db.queryOne(
        'SELECT id FROM warehouses WHERE warehouse_name = $1 AND deleted_at IS NULL',
        [name]
    );

    if (existing) {
        throw new ValidationError([{ field: 'name', message: 'Warehouse with this name already exists' }]);
    }

    const warehouse = await db.queryOne(
        `INSERT INTO warehouses (warehouse_name, location_address, contact_number, wilaya_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
        [name, address || '', phone || null, wilaya_id || null]
    );

    res.status(201).json(warehouse);
}));

/**
 * PUT /api/warehouses/:id
 * Update warehouse
 */
router.put('/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    const { name, address, phone, wilaya_id } = req.body;

    const warehouse = await db.queryOne(
        'SELECT * FROM warehouses WHERE id = $1 AND deleted_at IS NULL',
        [id]
    );

    if (!warehouse) {
        throw new NotFoundError('Warehouse not found');
    }

    if (name && name !== warehouse.warehouse_name) {
        const existing = await db.queryOne(
            'SELECT id FROM warehouses WHERE warehouse_name = $1 AND id != $2 AND deleted_at IS NULL',
            [name, id]
        );

        if (existing) {
            throw new ValidationError([{ field: 'name', message: 'Warehouse with this name already exists' }]);
        }
    }

    const updated = await db.queryOne(
        `UPDATE warehouses 
     SET warehouse_name = COALESCE($1, warehouse_name),
         location_address = COALESCE($2, location_address),
         contact_number = COALESCE($3, contact_number),
         wilaya_id = COALESCE($4, wilaya_id),
         updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
        [name, address, phone, wilaya_id, id]
    );

    res.json(updated);
}));

/**
 * DELETE /api/warehouses/:id
 * Soft delete warehouse
 */
router.delete('/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);

    const warehouse = await db.queryOne(
        'SELECT * FROM warehouses WHERE id = $1 AND deleted_at IS NULL',
        [id]
    );

    if (!warehouse) {
        throw new NotFoundError('Warehouse not found');
    }

    // Check if warehouse has stock
    const stockCount = await db.queryOne(
        'SELECT COUNT(*) as count FROM stock WHERE warehouse_id = $1 AND quantity > 0',
        [id]
    );

    if (parseInt(stockCount.count) > 0) {
        throw new ValidationError([{
            field: 'id',
            message: 'Cannot delete warehouse with active stock. Please move stock first.'
        }]);
    }

    await db.query(
        'UPDATE warehouses SET deleted_at = NOW() WHERE id = $1',
        [id]
    );

    res.json({ message: 'Warehouse deleted successfully' });
}));


/**
 * POST /api/warehouses/:id/restore
 * Restore a soft-deleted warehouse
 */
router.post('/:id/restore', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);

    const warehouse = await db.queryOne(
        'SELECT id FROM warehouses WHERE id = $1 AND deleted_at IS NOT NULL',
        [id]
    );

    if (!warehouse) {
        throw new NotFoundError('Warehouse not found in trash');
    }

    await db.query(
        'UPDATE warehouses SET deleted_at = NULL, updated_at = NOW() WHERE id = $1',
        [id]
    );

    res.json({ success: true, message: 'Warehouse restored successfully' });
}));

/**
 * DELETE /api/warehouses/:id/hard
 * Permanently delete a soft-deleted warehouse
 */
router.delete('/:id/hard', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);

    const warehouse = await db.queryOne(
        'SELECT id FROM warehouses WHERE id = $1 AND deleted_at IS NOT NULL',
        [id]
    );

    if (!warehouse) {
        throw new NotFoundError('Warehouse not found in trash');
    }

    await db.query('DELETE FROM warehouses WHERE id = $1', [id]);

    res.json({ success: true, message: 'Warehouse permanently deleted' });
}));

export default router;
