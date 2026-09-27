// Promotions API service

import { api } from './client'

export interface Promotion {
  promotion_id: number
  /** Alias renvoye par certains endpoints (meme convention que Collection). */
  id?: number
  coupon_code?: string
  promotion_code?: string
  promotion_name: string
  description?: string
  discount_type: 'fixed' | 'percentage' | 'free_shipping'
  discount_percentage?: number | null
  discount_amount?: number | null
  discount_value?: number
  min_order_amount: number
  applicable_categories?: string
  applicable_products?: string | null
  applicable_collections?: string | null
  applicable_to?: 'all' | 'categories' | 'products' | 'collections' | 'users' | string
  start_date: string
  end_date: string
  max_uses?: number | null
  max_uses_per_user?: number
  current_uses?: number
}

export interface PromotionsResponse {
  promotions: Promotion[]
}

export interface ValidatePromoResponse {
  valid: boolean
  promotion?: Promotion
  discount?: number
  error?: string
  message?: string
  code?: string
  description?: string
  type?: 'fixed' | 'percentage' | 'free_shipping'
  value?: number
}

export const promotionsApi = {
  // Get all active promotions (uses public endpoint)
  async getActive(): Promise<{ data?: Promotion[]; error?: string }> {
    const response = await api.get<PromotionsResponse>('/promotions/active')

    if (response.error) {
      return { error: response.error.message }
    }

    return { data: response.data?.promotions || [] }
  },

  // Validate a promotion code (uses public endpoint)
  async validate(
    code: string,
    orderTotal: number
  ): Promise<ValidatePromoResponse> {
    const response = await api.post<any>('/promotions/validate', {
      code,
      orderTotal,
    })

    if (response.error) {
      return { 
        valid: false, 
        message: response.error.message 
      }
    }

    const data = response.data
    
    // If validation failed, return the error
    if (data && !data.valid) {
      return {
        valid: false,
        message: data.error || data.message || 'Invalid promo code'
      }
    }
    
    // Transform the response to include the properties we need
    if (data?.valid && data?.promotion) {
      const promo = data.promotion
      return {
        valid: true,
        promotion: promo,
        code: promo.promotion_code || promo.coupon_code || '',
        description: promo.description || promo.promotion_name || '',
        type: promo.discount_type as 'fixed' | 'percentage' | 'free_shipping',
        value: promo.discount_value || promo.discount_amount || promo.discount_percentage || 0,
        discount: data.discount || 0
      }
    }

    return { valid: false, message: 'Invalid promo code' }
  },

  // Get promotion by code
  async getByCode(code: string): Promise<{ data?: Promotion; error?: string }> {
    const response = await api.get<Promotion>(`/promotions/code/${code}`)

    if (response.error) {
      return { error: response.error.message }
    }

    return { data: response.data }
  },
}
