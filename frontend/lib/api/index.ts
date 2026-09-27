// API service exports

export { api, API_URL, ERROR_CODES, broadcastAuthEvent, updateLastSuccessfulAuth, getLastSuccessfulAuth } from './client'
export type { ApiError, ApiResponse } from './client'

export { authApi } from './auth'
export type { User, LoginRequest, RegisterRequest, VerifyResponse, VerifyResult } from './auth'

export { productsApi } from './products'
export type {
  Product,
  ProductVariant,
  Category,
  ProductImage,
  ProductAttribute,
  Stock,
  ProductsResponse,
  ProductFilters,
} from './products'

export { categoriesApi } from './categories'

export { collectionsApi } from './collections'
export type { Collection, CollectionProductsResponse } from './collections'

export { ordersApi } from './orders'
export type {
  Order,
  OrderItem,
  OrderHistory,
  CreateOrderRequest,
  OrdersResponse,
  OrderApiError,
} from './orders'

export { reviewsApi } from './reviews'
export type { Review, CreateReviewRequest, UpdateReviewRequest, ReviewEligibility, ReviewsResponse } from './reviews'

export { promotionsApi } from './promotions'
export type { Promotion, ValidatePromoResponse } from './promotions'

export { usersApi } from './users'
export type { 
  Address, 
  UpdateProfileRequest, 
  ChangePasswordRequest, 
  AddAddressRequest, 
  UpdateAddressRequest 
} from './users'
