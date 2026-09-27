// Orders API service

import { api } from './client'

export interface OrderItem {
  order_item_id: number | string
  order_id: number
  product_id: number
  product_name_snapshot: string
  quantity: number
  unit_price: number
  discount_amount: number
  line_total: number
  product?: {
    product_id: number
    product_name: string
    images?: { image_url: string }[]
  }
}

export interface OrderHistory {
  history_id: number
  order_id: number
  status: string
  notes: string
  changed_by: number
  changed_at: string
}

export interface Order {
  order_id: number
  user_id: number
  order_number: string
  subtotal: number
  tax_amount: number
  shipping_cost: number
  discount_amount: number | null
  total_amount: number
  current_status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
  payment_status: 'paid' | 'unpaid' | 'refunded'
  payment_method: 'cod' | 'card' | 'bank_transfer'
  paid_amount: number | null
  promotion_id: number | null
  shipping_snapshot: string | any
  delivery_notes: string
  ordered_at: string
  delivered_at: string | null
  paid_at: string | null
  updated_at?: string
  
  // Tracking fields
  tracking_number?: string | null
  guepex_tracking_number?: string | null
  guepex_import_id?: string | null
  guepex_label_url?: string | null
  guepex_created_at?: string | null
  carrier?: string | null
  shipment_status?: string | null
  shipment_status_reason?: string | null
  
  // Payment breakdown (prepayment system)
  prepaid_amount?: number
  cod_amount?: number
  
  // Phone confirmation
  phone_confirmation_status?: string | null
  phone_confirmed_at?: string | null
  phone_confirmation_notes?: string | null
  
  // Customer info
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  
  // Delivery
  delivery_type?: string | null
  delivery_wilaya_id?: number | null
  delivery_commune_id?: number | null
  delivery_center_id?: number | null
  
  items?: OrderItem[]
  history?: OrderHistory[]
}

export interface CreateOrderRequest {
  items: {
    product_id: number
    variant_id?: number
    quantity: number
  }[]
  shipping_address: {
    address_line_1: string
    address_line_2?: string
    city: string
    state: string
    postal_code: string
    country: string
  }
  delivery_notes?: string
  promotion_code?: string
}

export interface OrdersResponse {
  orders: Order[]
  total: number
  page: number
  limit: number
}

export interface OrderApiError {
  message: string
  code?: string
  status?: number
  details?: any
}

export const ordersApi = {
  // Get all orders for current user
  async getMyOrders(): Promise<{ data?: Order[]; error?: OrderApiError }> {
    const response = await api.get<OrdersResponse>('/orders/my')

    if (response.error) {
      return { 
        error: {
          message: response.error.message || 'Failed to load orders',
          code: response.error.code,
          status: response.error.status,
        }
      }
    }

    // Handle various response structures
    const orders = response.data?.orders || (Array.isArray(response.data) ? response.data : [])
    return { data: orders }
  },

  // Get single order by ID
  async getById(id: number): Promise<{ data?: Order; error?: OrderApiError }> {
    const response = await api.get<{ success: boolean; data: Order }>(`/orders/${id}`)

    if (response.error) {
      return { 
        error: {
          message: response.error.message,
          code: response.error.code,
          status: response.error.status,
        }
      }
    }

    // Handle nested response structure
    const orderData = response.data?.data || response.data
    return { data: orderData as Order }
  },

  // Get order by order number
  async getByOrderNumber(orderNumber: string): Promise<{ data?: Order; error?: OrderApiError }> {
    const response = await api.get<{ success: boolean; data: Order }>(`/orders/${orderNumber}`)

    if (response.error) {
      return { 
        error: {
          message: response.error.message,
          code: response.error.code,
          status: response.error.status,
        }
      }
    }

    const orderData = response.data?.data || response.data
    return { data: orderData as Order }
  },

  // Create new order
  async create(orderData: CreateOrderRequest): Promise<{ data?: Order; error?: OrderApiError }> {
    const response = await api.post<{ success: boolean; data: Order }>('/orders', orderData)

    if (response.error) {
      return { 
        error: {
          message: response.error.message,
          code: response.error.code,
          status: response.error.status,
          details: response.error.details,
        }
      }
    }

    const order = response.data?.data || response.data
    return { data: order as Order }
  },

  // Cancel order
  async cancel(id: number): Promise<{ success: boolean; error?: OrderApiError }> {
    const response = await api.put<{ success: boolean; message: string }>(`/orders/my/${id}/cancel`, {})

    if (response.error) {
      return { 
        success: false, 
        error: {
          message: response.error.message,
          code: response.error.code,
          status: response.error.status,
        }
      }
    }

    return { success: true }
  },
}

