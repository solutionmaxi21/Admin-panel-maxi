// Reviews API service

import { api } from './client'

export interface Review {
  review_id: number
  product_id: number
  user_id: number
  rating: number
  review_text: string
  review_title?: string
  verified_purchase: boolean
  status?: 'pending' | 'approved' | 'rejected'
  created_at: string
  edited_at?: string | null
  edit_count?: number
  rejection_reason?: string | null
  deleted_at: string | null
  user?: {
    first_name: string
    last_name: string
  }
}

export interface CreateReviewRequest {
  productId: number
  rating: number
  comment: string
  title?: string
}

export interface UpdateReviewRequest {
  rating?: number
  comment?: string
  title?: string
}

export interface ReviewEligibility {
  eligible: boolean
  canEdit: boolean
  reason: string
  daysRemaining: number
  existingReview: Review | null
}

export interface ReviewsResponse {
  reviews: Review[]
  total: number
  averageRating: number
}

export const reviewsApi = {
  // Get reviews for a product (uses public endpoint)
  async getByProductId(productId: number): Promise<{ data?: ReviewsResponse; error?: string }> {
    const response = await api.get<ReviewsResponse>(`/reviews/product/${productId}`)

    if (response.error) {
      return { error: response.error.message }
    }

    return { data: response.data }
  },

  // Check eligibility to review a product
  async checkEligibility(productId: number): Promise<{ data?: ReviewEligibility; error?: string }> {
    const response = await api.get<ReviewEligibility>(`/reviews/eligibility/${productId}`)

    if (response.error) {
      return { error: response.error.message }
    }

    return { data: response.data }
  },

  // Create a review
  async create(reviewData: CreateReviewRequest): Promise<{ data?: Review; error?: string }> {
    const response = await api.post<Review>('/reviews', reviewData)

    if (response.error) {
      return { error: response.error.message }
    }

    return { data: response.data }
  },

  // Update a review
  async update(
    id: number,
    data: UpdateReviewRequest
  ): Promise<{ data?: Review; error?: string }> {
    const response = await api.put<Review>(`/reviews/${id}`, data)

    if (response.error) {
      return { error: response.error.message }
    }

    return { data: response.data }
  },

  // Delete user's own review
  async deleteOwn(id: number): Promise<{ success: boolean; error?: string }> {
    const response = await api.delete<void>(`/reviews/my/${id}`)

    if (response.error) {
      return { success: false, error: response.error.message }
    }

    return { success: true }
  },
}
