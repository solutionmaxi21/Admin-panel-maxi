import express from 'express';
import db from '../src/db/postgres.js';
import { authenticateToken, requireAdmin } from '../src/shared/middleware/auth.js';
import { validate } from '../src/shared/middleware/validate.js';
import { asyncHandler } from '../src/shared/middleware/errorHandler.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../src/shared/errors/index.js';
import NotificationService from '../src/services/NotificationService.js';
import {
  getReviewsSchema,
  getReviewSchema,
  updateReviewStatusSchema,
  deleteReviewSchema,
  createReviewSchema,
  updateReviewSchema
} from '../src/shared/validation/index.js';

const router = express.Router();

// ============ PUBLIC STOREFRONT ROUTES ============

/**
 * GET /api/reviews/product/:productId
 * Get approved reviews for a product (public)
 */
router.get('/product/:productId', asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.productId);
  
  const query = `
    SELECT 
      r.id as review_id,
      r.product_id,
      r.user_id,
      r.rating,
      r.review_text,
      r.verified_purchase,
      r.created_at,
      u.first_name,
      u.last_name
    FROM reviews r
    LEFT JOIN users u ON r.user_id = u.id
    WHERE r.product_id = $1 
      AND r.deleted_at IS NULL 
      AND r.status = 'approved'
    ORDER BY r.created_at DESC
  `;
  
  const reviews = await db.queryMany(query, [productId]);
  
  const transformedReviews = reviews.map(review => ({
    review_id: review.review_id,
    product_id: review.product_id,
    user_id: review.user_id,
    rating: review.rating,
    review_text: review.review_text,
    verified_purchase: review.verified_purchase || false,
    created_at: review.created_at,
    user: review.first_name ? {
      first_name: review.first_name,
      last_name: review.last_name ? review.last_name.charAt(0) + '.' : ''
    } : null
  }));
  
  const averageRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;
  
  res.json({
    reviews: transformedReviews,
    total: reviews.length,
    averageRating: Math.round(averageRating * 10) / 10
  });
}));

/**
 * GET /api/reviews/eligibility/:productId
 * Check if user can review a product
 */
router.get('/eligibility/:productId', authenticateToken, asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.productId);
  const userId = req.user.userId;
  
  // Check existing review
  const existingReview = await db.queryOne(
    `SELECT * FROM reviews 
     WHERE user_id = $1 AND product_id = $2 AND deleted_at IS NULL`,
    [userId, productId]
  );
  
  if (existingReview) {
    const canEdit = (existingReview.edit_count || 0) === 0;
    return res.json({
      eligible: false,
      canEdit,
      reason: canEdit ? 'already_reviewed_can_edit' : 'already_reviewed',
      existingReview: {
        review_id: existingReview.id,
        rating: existingReview.rating,
        review_text: existingReview.review_text,
        status: existingReview.status,
        created_at: existingReview.created_at
      }
    });
  }
  
  // Check if user has purchased and received the product
  const deliveredOrder = await db.queryOne(
    `SELECT o.delivered_at 
     FROM orders o
     JOIN order_items oi ON o.id = oi.order_id
     WHERE o.user_id = $1 
       AND oi.product_id = $2 
       AND o.current_status = 'delivered'
       AND o.delivered_at IS NOT NULL
     ORDER BY o.delivered_at DESC
     LIMIT 1`,
    [userId, productId]
  );
  
  if (!deliveredOrder) {
    return res.json({
      eligible: false,
      reason: 'not_purchased',
      daysRemaining: 0
    });
  }
  
  // Check 7-day window
  const deliveredDate = new Date(deliveredOrder.delivered_at);
  const now = new Date();
  const daysSinceDelivery = Math.floor((now - deliveredDate) / (1000 * 60 * 60 * 24));
  const daysRemaining = 7 - daysSinceDelivery;
  
  if (daysRemaining < 0) {
    return res.json({
      eligible: false,
      reason: 'time_expired',
      daysRemaining: 0
    });
  }
  
  res.json({
    eligible: true,
    reason: 'eligible',
    daysRemaining
  });
}));

/**
 * POST /api/reviews
 * Create a new review
 */
router.post('/', authenticateToken, validate(createReviewSchema), asyncHandler(async (req, res) => {
  const { productId, rating, reviewText, reviewTitle, comment, title } = req.body;
  const userId = req.user.userId;
  
  // Accept both reviewText/comment and reviewTitle/title for backwards compatibility
  const finalReviewText = reviewText || comment;
  const finalReviewTitle = reviewTitle || title;
  
  // Validate required fields
  if (!finalReviewText || finalReviewText.trim().length < 10) {
    throw new ValidationError('Review text must be at least 10 characters');
  }
  
  // Verify product exists
  const product = await db.queryOne('SELECT id FROM products WHERE id = $1 AND deleted_at IS NULL', [productId]);
  if (!product) {
    throw new NotFoundError('Product not found');
  }
  
  // Check for existing review
  const existing = await db.queryOne(
    'SELECT id FROM reviews WHERE user_id = $1 AND product_id = $2 AND deleted_at IS NULL',
    [userId, productId]
  );
  
  if (existing) {
    throw new ValidationError('You have already reviewed this product');
  }
  
  // Verify purchase
  const hasPurchased = await db.queryOne(
    `SELECT 1 FROM orders o
     JOIN order_items oi ON o.id = oi.order_id
     WHERE o.user_id = $1 AND oi.product_id = $2 AND o.current_status = 'delivered'`,
    [userId, productId]
  );
  
  const query = `
    INSERT INTO reviews (
      product_id, user_id, rating, review_title, review_text, 
      verified_purchase, status, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    RETURNING *
  `;
  
  const review = await db.queryOne(query, [
    productId,
    userId,
    rating,
    finalReviewTitle || null,
    finalReviewText.trim(),
    !!hasPurchased,
    'pending'
  ]);

  // Create notification for review submission
  try {
    // Notify customer
    await NotificationService.create({
      userId,
      type: 'REVIEW_SUBMITTED',
      title: 'Review Submitted',
      message: 'Your review has been submitted and is pending moderation. We will notify you once it is approved.',
      actionUrl: `/fr/product/${productId}`,
      relatedEntityType: 'review',
      relatedEntityId: review.id,
    });

    // Notify admins about new review pending moderation
    const productInfo = await db.queryOne('SELECT product_name FROM products WHERE id = $1', [productId]);
    await NotificationService.notifyAdmins({
      type: 'NEW_REVIEW',
      title: 'New Review Pending / مراجعة جديدة',
      message: `New ${rating}-star review for "${productInfo?.product_name || 'Product'}". Requires moderation.`,
      actionUrl: '/reviews',
      relatedEntityType: 'review',
      relatedEntityId: review.id,
    });
    console.log(`[Notification] Notified admins about new review ${review.id}`);
  } catch (notificationError) {
    console.error('[Notification] Failed to create review submission notification:', notificationError);
  }
  
  res.status(201).json({
    message: 'Review submitted successfully. It will be visible after moderation.',
    review: {
      review_id: review.id,
      product_id: review.product_id,
      rating: review.rating,
      review_text: review.review_text,
      status: review.status,
      created_at: review.created_at
    }
  });
}));

/**
 * PUT /api/reviews/:id
 * Update user's own review
 */
router.put('/:id', authenticateToken, validate(updateReviewSchema), asyncHandler(async (req, res) => {
  const reviewId = parseInt(req.params.id);
  const { rating, reviewText, reviewTitle } = req.body;
  const userId = req.user.userId;
  
  const review = await db.queryOne(
    'SELECT * FROM reviews WHERE id = $1 AND deleted_at IS NULL',
    [reviewId]
  );
  
  if (!review) {
    throw new NotFoundError('Review not found');
  }
  
  if (review.user_id !== userId) {
    throw new ForbiddenError('You can only edit your own reviews');
  }
  
  if ((review.edit_count || 0) >= 1) {
    throw new ForbiddenError('Reviews can only be edited once');
  }
  
  const query = `
    UPDATE reviews 
    SET rating = $1, 
        review_text = $2, 
        review_title = $3,
        edited_at = NOW(),
        edit_count = COALESCE(edit_count, 0) + 1,
        status = 'pending'
    WHERE id = $4
    RETURNING *
  `;
  
  const updated = await db.queryOne(query, [rating, reviewText, reviewTitle || null, reviewId]);
  
  res.json({
    message: 'Review updated successfully. It will be re-reviewed by moderators.',
    review: {
      review_id: updated.id,
      rating: updated.rating,
      review_text: updated.review_text,
      status: updated.status,
      edit_count: updated.edit_count
    }
  });
}));

/**
 * DELETE /api/reviews/my/:id
 * Delete user's own review
 */
router.delete('/my/:id', authenticateToken, asyncHandler(async (req, res) => {
  const reviewId = parseInt(req.params.id);
  const userId = req.user.userId;
  
  const review = await db.queryOne(
    'SELECT user_id FROM reviews WHERE id = $1 AND deleted_at IS NULL',
    [reviewId]
  );
  
  if (!review) {
    throw new NotFoundError('Review not found');
  }
  
  if (review.user_id !== userId) {
    throw new ForbiddenError('You can only delete your own reviews');
  }
  
  await db.query('UPDATE reviews SET deleted_at = NOW() WHERE id = $1', [reviewId]);
  
  res.json({ message: 'Review deleted successfully' });
}));

// ============ ADMIN ROUTES ============

/**
 * GET /api/reviews
 * Get all reviews with filters (admin)
 */
router.get('/', authenticateToken, requireAdmin, validate(getReviewsSchema), asyncHandler(async (req, res) => {
  const { status, productId, userId, rating, page = 1, limit = 20, includeDeleted, onlyDeleted } = req.query;
  
  const conditions = ['1=1'];
  if (onlyDeleted) {
    conditions.push('r.deleted_at IS NOT NULL');
  } else if (!includeDeleted) {
    conditions.push('r.deleted_at IS NULL');
  }
  const params = [];
  let paramCount = 1;
  
  if (status) {
    conditions.push(`r.status = $${paramCount}`);
    params.push(status);
    paramCount++;
  }
  
  if (productId) {
    conditions.push(`r.product_id = $${paramCount}`);
    params.push(parseInt(productId));
    paramCount++;
  }
  
  if (userId) {
    conditions.push(`r.user_id = $${paramCount}`);
    params.push(parseInt(userId));
    paramCount++;
  }

  if (rating) {
    conditions.push(`r.rating = $${paramCount}`);
    params.push(parseInt(rating));
    paramCount++;
  }
  
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  const query = `
    SELECT 
      r.id as review_id,
      r.product_id,
      r.user_id,
      r.rating,
      r.review_title,
      r.review_text,
      r.verified_purchase,
      r.status,
      r.created_at,
      r.edited_at,
      r.edit_count,
      r.rejection_reason,
      r.moderated_by,
      r.moderated_at,
      r.deleted_at,
      p.product_name,
      u.first_name,
      u.last_name,
      u.email
    FROM reviews r
    LEFT JOIN products p ON r.product_id = p.id
    LEFT JOIN users u ON r.user_id = u.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY r.created_at DESC
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;
  
  const countQuery = `
    SELECT COUNT(*) as total
    FROM reviews r
    WHERE ${conditions.join(' AND ')}
  `;
  
  const [reviews, countResult] = await Promise.all([
    db.queryMany(query, [...params, parseInt(limit), offset]),
    db.queryOne(countQuery, params)
  ]);
  
  res.json({
    reviews,
    total: parseInt(countResult.total),
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(countResult.total / parseInt(limit))
  });
}));

/**
 * PUT /api/reviews/:id/status
 * Update review status (admin)
 */
router.put('/:id/status', authenticateToken, requireAdmin, validate(updateReviewStatusSchema), asyncHandler(async (req, res) => {
  const reviewId = parseInt(req.params.id);
  const { status, rejectionReason } = req.body;
  
  const query = `
    UPDATE reviews 
    SET status = $1,
        rejection_reason = $2,
        moderated_by = $3,
        moderated_at = NOW()
    WHERE id = $4 AND deleted_at IS NULL
    RETURNING *
  `;
  
  const updated = await db.queryOne(query, [
    status,
    rejectionReason || null,
    req.user.userId,
    reviewId
  ]);
  
  if (!updated) {
    throw new NotFoundError('Review not found');
  }

  // Create notification for review moderation
  try {
    const reviewerQuery = `
      SELECT user_id FROM reviews WHERE id = $1
    `;
    const reviewer = await db.queryOne(reviewerQuery, [reviewId]);
    
    if (reviewer) {
      let title, message;
      if (status === 'approved') {
        title = 'Review Approved';
        message = 'Your review has been approved and is now visible on the product page.';
      } else if (status === 'rejected') {
        title = 'Review Rejected';
        message = `Your review has been rejected. ${rejectionReason ? `Reason: ${rejectionReason}` : ''}`;
      }
      
      if (title) {
        await NotificationService.create({
          userId: reviewer.user_id,
          type: 'REVIEW_MODERATED',
          title,
          message,
          actionUrl: `/fr/product/${updated.product_id}`,
          relatedEntityType: 'review',
          relatedEntityId: updated.id,
        });
      }
    }
  } catch (notificationError) {
    console.error('[Notification] Failed to create moderation notification:', notificationError);
  }
  
  res.json({
    message: 'Review status updated',
    review: {
      review_id: updated.id,
      status: updated.status,
      rejection_reason: updated.rejection_reason
    }
  });
}));

/**
 * DELETE /api/reviews/:id
 * Delete review (admin)
 */
router.delete('/:id', authenticateToken, requireAdmin, validate(deleteReviewSchema), asyncHandler(async (req, res) => {
  const reviewId = parseInt(req.params.id);
  
  const result = await db.queryOne(
    'UPDATE reviews SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
    [reviewId]
  );
  
  if (!result) {
    throw new NotFoundError('Review not found');
  }
  
  res.json({ message: 'Review deleted successfully' });
}));

/**
 * POST /api/reviews/:id/restore
 * Restore review from trash (admin)
 */
router.post('/:id/restore', authenticateToken, requireAdmin, validate(getReviewSchema), asyncHandler(async (req, res) => {
  const reviewId = parseInt(req.params.id);

  const review = await db.queryOne('SELECT id, deleted_at FROM reviews WHERE id = $1', [reviewId]);
  if (!review) throw new NotFoundError('Review not found');
  if (!review.deleted_at) {
    return res.json({ success: true, message: 'Review is already active' });
  }

  await db.query('UPDATE reviews SET deleted_at = NULL WHERE id = $1', [reviewId]);
  res.json({ success: true, message: 'Review restored successfully' });
}));

/**
 * DELETE /api/reviews/:id/hard
 * Permanently delete review (only from trash) (admin)
 */
router.delete('/:id/hard', authenticateToken, requireAdmin, validate(getReviewSchema), asyncHandler(async (req, res) => {
  const reviewId = parseInt(req.params.id);

  const review = await db.queryOne('SELECT id, deleted_at FROM reviews WHERE id = $1', [reviewId]);
  if (!review) throw new NotFoundError('Review not found');
  if (!review.deleted_at) {
    throw new ValidationError([{ field: 'review', message: 'Review must be in trash before permanent deletion' }]);
  }

  await db.query('DELETE FROM reviews WHERE id = $1', [reviewId]);
  res.json({ success: true, message: 'Review permanently deleted' });
}));

/**
 * GET /api/reviews/stats/summary
 * Get review statistics (admin)
 */
router.get('/stats/summary', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const query = `
    SELECT 
      COUNT(*) as total_reviews,
      COUNT(*) FILTER (WHERE status = 'pending') as pending_reviews,
      COUNT(*) FILTER (WHERE status = 'approved') as approved_reviews,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected_reviews,
      COALESCE(AVG(rating), 0) as average_rating,
      COUNT(*) FILTER (WHERE verified_purchase = true) as verified_purchases
    FROM reviews
    WHERE deleted_at IS NULL
  `;
  
  const stats = await db.queryOne(query);
  
  res.json({
    total: parseInt(stats.total_reviews),
    pending: parseInt(stats.pending_reviews),
    approved: parseInt(stats.approved_reviews),
    rejected: parseInt(stats.rejected_reviews),
    averageRating: parseFloat(stats.average_rating).toFixed(1),
    verifiedPurchases: parseInt(stats.verified_purchases)
  });
}));

/**
 * GET /api/reviews/stats/summary
 * Get review statistics for dashboard
 * Requires admin authentication
 */
router.get('/stats/summary', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  console.log(`[REVIEW STATS] Admin ${req.user.userId} requested review statistics summary`);
  
  const query = `
    SELECT 
      COUNT(*) as total_reviews,
      COUNT(*) FILTER (WHERE status = 'pending') as pending_reviews,
      COUNT(*) FILTER (WHERE status = 'approved') as approved_reviews,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected_reviews,
      COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', NOW())) as reviews_this_month,
      ROUND(AVG(rating)::numeric, 2) as average_rating,
      COUNT(DISTINCT product_id) as products_reviewed,
      COUNT(DISTINCT user_id) as reviewers_count,
      COUNT(*) FILTER (WHERE rating = 5) as five_star_count,
      COUNT(*) FILTER (WHERE rating = 4) as four_star_count,
      COUNT(*) FILTER (WHERE rating = 3) as three_star_count,
      COUNT(*) FILTER (WHERE rating = 2) as two_star_count,
      COUNT(*) FILTER (WHERE rating = 1) as one_star_count,
      COUNT(*) FILTER (WHERE verified_purchase = true) as verified_purchases
    FROM reviews
    WHERE deleted_at IS NULL
  `;
  
  const stats = await db.queryOne(query);
  
  if (!stats) {
    return res.json({
      totalReviews: 0,
      pendingReviews: 0,
      approvedReviews: 0,
      rejectedReviews: 0,
      reviewsThisMonth: 0,
      averageRating: 0,
      productsReviewed: 0,
      reviewersCount: 0,
      starDistribution: { fiveStar: 0, fourStar: 0, threeStar: 0, twoStar: 0, oneStar: 0 },
      verifiedPurchases: 0
    });
  }
  
  const totalReviews = parseInt(stats.total_reviews);
  const approvedReviews = parseInt(stats.approved_reviews);
  
  console.log('[REVIEW STATS] Statistics retrieved successfully');
  
  res.json({
    totalReviews: totalReviews,
    pendingReviews: parseInt(stats.pending_reviews),
    approvedReviews: approvedReviews,
    rejectedReviews: parseInt(stats.rejected_reviews),
    reviewsThisMonth: parseInt(stats.reviews_this_month),
    averageRating: parseFloat(stats.average_rating) || 0,
    productsReviewed: parseInt(stats.products_reviewed),
    reviewersCount: parseInt(stats.reviewers_count),
    approvalRate: totalReviews > 0 ? Math.round((approvedReviews / totalReviews) * 100) : 0,
    starDistribution: {
      fiveStar: parseInt(stats.five_star_count),
      fourStar: parseInt(stats.four_star_count),
      threeStar: parseInt(stats.three_star_count),
      twoStar: parseInt(stats.two_star_count),
      oneStar: parseInt(stats.one_star_count)
    },
    verifiedPurchases: parseInt(stats.verified_purchases),
    reportedAt: new Date().toISOString()
  });
}));

export default router;
