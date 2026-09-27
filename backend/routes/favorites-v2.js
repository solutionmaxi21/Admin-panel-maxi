/**
 * Favorites/Wishlist Routes
 * Handles fetching and managing user favorites
 */

import express from 'express';
import db from '../src/db/postgres.js';
import { authenticateToken } from '../src/shared/middleware/auth.js';

const router = express.Router();

/**
 * GET /api/favorites
 * Get all favorites for the logged-in user
 */
router.get('/', authenticateToken, async (req, res) => {
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({ 
      error: 'Unauthorized' 
    });
  }

  try {
    const result = await db.query(
      `SELECT 
        f.id,
        f.product_id,
        f.added_at,
        p.product_name,
        p.sku,
        p.current_price,
        p.stock_level,
        p.image_url
      FROM favorites f
      INNER JOIN products p ON f.product_id = p.id
      WHERE f.user_id = $1
      ORDER BY f.added_at DESC`,
      [userId]
    );

    const favorites = result.rows.map(row => ({
      id: row.id,
      productId: row.product_id,
      addedAt: row.added_at,
      product: {
        id: row.product_id,
        name: row.product_name,
        sku: row.sku,
        price: row.current_price ? parseFloat(row.current_price) : null,
        stockLevel: row.stock_level,
        imageUrl: row.image_url
      }
    }));

    res.json({
      success: true,
      favorites,
      count: favorites.length
    });
  } catch (error) {
    console.error('❌ Error fetching favorites:', error);
    res.status(500).json({ 
      error: 'Failed to fetch favorites'
    });
  }
});

/**
 * GET /api/favorites/product-ids
 * Get just the product IDs for favorites (lightweight)
 */
router.get('/product-ids', authenticateToken, async (req, res) => {
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({ 
      error: 'Unauthorized' 
    });
  }

  try {
    const result = await db.query(
      `SELECT product_id, added_at
       FROM favorites
       WHERE user_id = $1
       ORDER BY added_at DESC`,
      [userId]
    );

    const productIds = result.rows.map(row => ({
      productId: row.product_id,
      addedAt: row.added_at
    }));

    res.json({
      success: true,
      favorites: productIds,
      count: productIds.length
    });
  } catch (error) {
    console.error('❌ Error fetching favorite IDs:', error);
    res.status(500).json({ 
      error: 'Failed to fetch favorite IDs'
    });
  }
});

/**
 * DELETE /api/favorites/:productId
 * Remove a product from favorites
 * Note: This is a direct delete, not queued like the sync mutations
 */
router.delete('/:productId', authenticateToken, async (req, res) => {
  const userId = req.user?.userId;
  const productId = parseInt(req.params.productId);

  if (!userId) {
    return res.status(401).json({ 
      error: 'Unauthorized' 
    });
  }

  if (isNaN(productId)) {
    return res.status(400).json({ 
      error: 'Invalid product ID' 
    });
  }

  try {
    const result = await db.query(
      'DELETE FROM favorites WHERE user_id = $1 AND product_id = $2 RETURNING id',
      [userId, productId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Favorite not found' 
      });
    }

    res.json({
      success: true,
      message: 'Removed from favorites',
      productId
    });
  } catch (error) {
    console.error('❌ Error removing favorite:', error);
    res.status(500).json({ 
      error: 'Failed to remove favorite'
    });
  }
});

/**
 * POST /api/favorites/:productId
 * Add a product to favorites
 * Note: This is a direct add, not queued like the sync mutations
 */
router.post('/:productId', authenticateToken, async (req, res) => {
  const userId = req.user?.userId;
  const productId = parseInt(req.params.productId);

  if (!userId) {
    return res.status(401).json({ 
      error: 'Unauthorized' 
    });
  }

  if (isNaN(productId)) {
    return res.status(400).json({ 
      error: 'Invalid product ID' 
    });
  }

  try {
    // Check if product exists
    const productCheck = await db.query(
      'SELECT id FROM products WHERE id = $1',
      [productId]
    );

    if (productCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Product not found' 
      });
    }

    // Add to favorites (or ignore if exists)
    const result = await db.query(
      `INSERT INTO favorites (user_id, product_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, product_id) DO NOTHING
       RETURNING id`,
      [userId, productId]
    );

    const created = result.rows.length > 0;

    res.json({
      success: true,
      message: created ? 'Added to favorites' : 'Already in favorites',
      productId,
      created
    });
  } catch (error) {
    console.error('❌ Error adding favorite:', error);
    res.status(500).json({ 
      error: 'Failed to add favorite'
    });
  }
});

export default router;
