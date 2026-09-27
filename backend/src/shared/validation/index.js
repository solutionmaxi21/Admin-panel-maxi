/**
 * Validation Schemas Index
 * 
 * Central export point for all Zod validation schemas.
 * Import schemas from here for route validation.
 * 
 * @example
 * import { validate } from '../middleware/validate.js';
 * import { loginSchema, registerSchema } from '../validation/index.js';
 * 
 * router.post('/login', validate(loginSchema), authController.login);
 */

// Common schemas (reusable building blocks)
export {
  paginationSchema,
  idParamSchema,
  slugParamSchema,
  emailSchema,
  phoneSchema,
  priceSchema,
  addressSchema,
  dateRangeSchema,
  searchSchema,
} from './common.js';

// Auth schemas
export {
  loginSchema,
  registerSchema,
  refreshTokenSchema,
} from './auth.js';

// Product schemas
export {
  productFiltersSchema,
  createProductSchema,
  updateProductSchema,
  getProductSchema,
  deleteProductSchema,
  bulkProductUpdateSchema,
} from './products.js';

// Order schemas
export {
  orderStatusEnum,
  paymentStatusEnum,
  paymentMethodEnum,
  createOrderSchema,
  updateOrderStatusSchema,
  getOrdersSchema,
  getOrderSchema,
  cancelOrderSchema,
} from './orders.js';

// User schemas
export {
  getUsersSchema,
  getUserSchema,
  createUserSchema,
  updateProfileSchema,
  updateUserSchema,
  deleteUserSchema,
  changePasswordSchema,
  addAddressSchema,
  updateAddressSchema,
  deleteAddressSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './users.js';

// Category schemas
export {
  getCategoriesSchema,
  getCategorySchema,
  createCategorySchema,
  updateCategorySchema,
  deleteCategorySchema,
  reorderCategoriesSchema,
} from './categories.js';

// Collection schemas
export {
  getCollectionsSchema,
  getCollectionSchema,
  createCollectionSchema,
  updateCollectionSchema,
  deleteCollectionSchema,
  collectionProductsSchema,
  reorderCollectionProductsSchema,
} from './collections.js';

// Review schemas
export {
  createReviewSchema,
  updateReviewSchema,
  getProductReviewsSchema,
  moderateReviewSchema,
  markHelpfulSchema,
  getReviewsSchema,
  getReviewSchema,
  updateReviewStatusSchema,
  deleteReviewSchema,
} from './reviews.js';

// Inventory schemas
export {
  getStockSchema,
  updateStockSchema,
  addStockSchema,
  transferStockSchema,
  bulkStockUpdateSchema,
  getStockHistorySchema,
  getWarehousesSchema,
  createWarehouseSchema,
  updateWarehouseSchema,
} from './inventory.js';

// Supplier schemas
export {
  getSuppliersSchema,
  getSupplierSchema,
  createSupplierSchema,
  updateSupplierSchema,
  deleteSupplierSchema,
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
} from './suppliers.js';

// Promotion schemas
export {
  getPromotionsSchema,
  getPromotionSchema,
  validateCouponSchema,
  createPromotionSchema,
  updatePromotionSchema,
  deletePromotionSchema,
  applyPromotionSchema,
  removePromotionSchema,
} from './promotions.js';

// Return schemas
export {
  getReturnsSchema,
  getReturnSchema,
  createReturnSchema,
  updateReturnCustomerSchema,
  processReturnSchema,
  cancelReturnSchema,
  addReturnNoteSchema,
  uploadReturnImagesSchema,
} from './returns.js';

// Default exports grouped by domain
import commonSchemas from './common.js';
import authSchemas from './auth.js';
import productSchemas from './products.js';
import orderSchemas from './orders.js';
import userSchemas from './users.js';
import categorySchemas from './categories.js';
import collectionSchemas from './collections.js';
import reviewSchemas from './reviews.js';
import inventorySchemas from './inventory.js';
import supplierSchemas from './suppliers.js';
import promotionSchemas from './promotions.js';
import returnSchemas from './returns.js';

export const schemas = {
  common: commonSchemas,
  auth: authSchemas,
  products: productSchemas,
  orders: orderSchemas,
  users: userSchemas,
  categories: categorySchemas,
  collections: collectionSchemas,
  reviews: reviewSchemas,
  inventory: inventorySchemas,
  suppliers: supplierSchemas,
  promotions: promotionSchemas,
  returns: returnSchemas,
};

export default schemas;
