import express from 'express';
import { authenticateToken, requireAdmin } from '../src/shared/middleware/auth.js';
import { validate } from '../src/shared/middleware/validate.js';
import { asyncHandler } from '../src/shared/middleware/errorHandler.js';
import { NotFoundError, ValidationError, ConflictError } from '../src/shared/errors/index.js';
import {
  getSuppliersSchema,
  getSupplierSchema,
  createSupplierSchema,
  updateSupplierSchema,
  deleteSupplierSchema
} from '../src/shared/validation/index.js';
import db from '../src/db/postgres.js';

const router = express.Router();

// Helper to enrich supplier with product count
async function enrichSupplierWithStats(supplier) {
  const productCount = await db.queryOne(
    'SELECT COUNT(*) as count FROM products WHERE supplier_id = $1 AND deleted_at IS NULL',
    [supplier.id]
  );
  
  return {
    supplier_id: supplier.id,
    id: supplier.id,
    ...supplier,
    product_count: parseInt(productCount.count)
  };
}

// GET /api/suppliers - List all suppliers
router.get('/', authenticateToken, requireAdmin, validate(getSuppliersSchema), asyncHandler(async (req, res) => {
  const { search, includeDeleted, onlyDeleted } = req.query;
  
  let query = 'SELECT * FROM suppliers';
  const conditions = [];
  const params = [];

  if (onlyDeleted) {
    conditions.push('deleted_at IS NOT NULL');
  } else if (!includeDeleted) {
    conditions.push('deleted_at IS NULL');
  }

  if (search) {
    conditions.push('(name ILIKE $1 OR contact_email ILIKE $1 OR address ILIKE $1)');
    params.push(`%${search}%`);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY name ASC';

  let suppliers = await db.queryMany(query, params);

  const enriched = await Promise.all(
    suppliers.map(s => enrichSupplierWithStats(s))
  );

  res.json(enriched);
}));

// GET /api/suppliers/stats - Get supplier statistics
router.get('/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const statsQuery = `
    SELECT 
      COUNT(*) as total_suppliers,
      COUNT(*) as active_suppliers,
      (SELECT COUNT(DISTINCT supplier_id) FROM products WHERE deleted_at IS NULL) as suppliers_with_products,
      (SELECT COUNT(*) FROM suppliers WHERE id NOT IN (SELECT DISTINCT supplier_id FROM products WHERE deleted_at IS NULL) AND deleted_at IS NULL) as suppliers_without_products,
      (SELECT COUNT(*) FROM products WHERE deleted_at IS NULL) as total_products
    FROM suppliers
    WHERE deleted_at IS NULL
  `;

  const stats = await db.queryOne(statsQuery);

  // Get top suppliers by product count
  const topSuppliers = await db.queryMany(`
    SELECT s.id, s.name, COUNT(p.id) as product_count
    FROM suppliers s
    LEFT JOIN products p ON s.id = p.supplier_id AND p.deleted_at IS NULL
    WHERE s.deleted_at IS NULL
    GROUP BY s.id, s.name
    ORDER BY product_count DESC
    LIMIT 5
  `);

  res.json({
    total: parseInt(stats.total_suppliers),
    active: parseInt(stats.active_suppliers),
    withProducts: parseInt(stats.suppliers_with_products),
    withoutProducts: parseInt(stats.suppliers_without_products),
    totalProducts: parseInt(stats.total_products),
    topSuppliers: topSuppliers.map(s => ({
      id: s.id,
      name: s.name,
      productCount: parseInt(s.product_count)
    }))
  });
}));

// GET /api/suppliers/:id - Get single supplier
router.get('/:id', authenticateToken, requireAdmin, validate(getSupplierSchema), asyncHandler(async (req, res) => {
  const supplierId = parseInt(req.params.id);

  const supplier = await db.queryOne(
    'SELECT * FROM suppliers WHERE id = $1 AND deleted_at IS NULL',
    [supplierId]
  );

  if (!supplier) {
    throw new NotFoundError('Supplier not found');
  }

  const enriched = await enrichSupplierWithStats(supplier);
  res.json(enriched);
}));

// POST /api/suppliers - Create new supplier
router.post('/', authenticateToken, requireAdmin, validate(createSupplierSchema), asyncHandler(async (req, res) => {
  const { name, contact_email, contact_phone, address } = req.body;

  // Check for duplicate name
  const existing = await db.queryOne(
    'SELECT id FROM suppliers WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL',
    [name]
  );

  if (existing) {
    throw new ValidationError([{ field: 'name', message: 'Supplier with this name already exists' }]);
  }

  const query = `
    INSERT INTO suppliers (
      name, contact_email, contact_phone, address, created_at
    ) VALUES ($1, $2, $3, $4, NOW())
    RETURNING *
  `;

  const newSupplier = await db.queryOne(query, [
    name,
    contact_email || null,
    contact_phone || null,
    address || null
  ]);

  const enriched = await enrichSupplierWithStats(newSupplier);
  res.status(201).json(enriched);
}));

// PUT /api/suppliers/:id - Update supplier
router.put('/:id', authenticateToken, requireAdmin, validate(updateSupplierSchema), asyncHandler(async (req, res) => {
  const supplierId = parseInt(req.params.id);
  const { name, contact_email, contact_phone, address } = req.body;

  const supplier = await db.queryOne(
    'SELECT * FROM suppliers WHERE id = $1 AND deleted_at IS NULL',
    [supplierId]
  );

  if (!supplier) {
    throw new NotFoundError('Supplier not found');
  }

  // Check for duplicate name (excluding current supplier)
  if (name) {
    const existing = await db.queryOne(
      'SELECT id FROM suppliers WHERE LOWER(name) = LOWER($1) AND id != $2 AND deleted_at IS NULL',
      [name, supplierId]
    );

    if (existing) {
      throw new ValidationError([{ field: 'name', message: 'Supplier with this name already exists' }]);
    }
  }

  const updates = [];
  const params = [];
  let paramIndex = 1;

  if (name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    params.push(name);
  }

  if (contact_email !== undefined) {
    updates.push(`contact_email = $${paramIndex++}`);
    params.push(contact_email);
  }

  if (contact_phone !== undefined) {
    updates.push(`contact_phone = $${paramIndex++}`);
    params.push(contact_phone);
  }

  if (address !== undefined) {
    updates.push(`address = $${paramIndex++}`);
    params.push(address);
  }

  if (updates.length === 0) {
    const enriched = await enrichSupplierWithStats(supplier);
    return res.json(enriched);
  }

  params.push(supplierId);

  const query = `UPDATE suppliers SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
  const updated = await db.queryOne(query, params);

  const enriched = await enrichSupplierWithStats(updated);
  res.json(enriched);
}));

// DELETE /api/suppliers/:id - Delete supplier
router.delete('/:id', authenticateToken, requireAdmin, validate(deleteSupplierSchema), asyncHandler(async (req, res) => {
  const supplierId = parseInt(req.params.id);

  const supplier = await db.queryOne(
    'SELECT id FROM suppliers WHERE id = $1 AND deleted_at IS NULL',
    [supplierId]
  );

  if (!supplier) {
    throw new NotFoundError('Supplier not found');
  }

  // Check for products from this supplier
  const productsCount = await db.queryOne(
    'SELECT COUNT(*) as count FROM products WHERE supplier_id = $1 AND deleted_at IS NULL',
    [supplierId]
  );

  if (parseInt(productsCount.count) > 0) {
    throw new ValidationError([{
      field: 'supplier',
      message: `Cannot delete supplier with ${productsCount.count} active products`
    }]);
  }

  await db.query('UPDATE suppliers SET deleted_at = NOW() WHERE id = $1', [supplierId]);

  res.json({ success: true, message: 'Supplier deleted successfully' });
}));

// POST /api/suppliers/:id/restore - Restore supplier from trash
router.post('/:id/restore', authenticateToken, requireAdmin, validate(getSupplierSchema), asyncHandler(async (req, res) => {
  const supplierId = parseInt(req.params.id);

  const supplier = await db.queryOne('SELECT * FROM suppliers WHERE id = $1', [supplierId]);
  if (!supplier) throw new NotFoundError('Supplier not found');
  if (!supplier.deleted_at) {
    return res.json({ success: true, message: 'Supplier is already active' });
  }

  const conflict = await db.queryOne(
    'SELECT id FROM suppliers WHERE LOWER(name) = LOWER($1) AND id != $2 AND deleted_at IS NULL',
    [supplier.name, supplierId]
  );
  if (conflict) {
    throw new ConflictError('Cannot restore supplier: an active supplier with the same name already exists');
  }

  const restored = await db.queryOne(
    'UPDATE suppliers SET deleted_at = NULL WHERE id = $1 RETURNING *',
    [supplierId]
  );

  const enriched = await enrichSupplierWithStats(restored);
  res.json({ success: true, supplier: enriched });
}));

// DELETE /api/suppliers/:id/hard - Permanently delete supplier (only from trash)
router.delete('/:id/hard', authenticateToken, requireAdmin, validate(getSupplierSchema), asyncHandler(async (req, res) => {
  const supplierId = parseInt(req.params.id);

  const supplier = await db.queryOne('SELECT id, deleted_at FROM suppliers WHERE id = $1', [supplierId]);
  if (!supplier) throw new NotFoundError('Supplier not found');
  if (!supplier.deleted_at) {
    throw new ValidationError([{ field: 'supplier', message: 'Supplier must be in trash before permanent deletion' }]);
  }

  // Safety: do not allow hard delete if ANY product references this supplier (FK restrictions and historical integrity).
  const productsCount = await db.queryOne(
    'SELECT COUNT(*) as count FROM products WHERE supplier_id = $1',
    [supplierId]
  );
  if (parseInt(productsCount.count) > 0) {
    throw new ConflictError('Cannot permanently delete supplier: it is referenced by products');
  }

  await db.query('DELETE FROM suppliers WHERE id = $1', [supplierId]);
  res.json({ success: true, message: 'Supplier permanently deleted' });
}));

export default router;
