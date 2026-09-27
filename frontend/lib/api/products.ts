// Products API service

import { api } from './client'

export type BilingualString = string | { fr: string; ar: string };

export interface ProductVariant {
  id: number
  variant_name: string
  current_price: number
  sale_price: number | null
  is_default: boolean
  display_order: number
  metadata: Record<string, any> | null
  total_stock: number
}

export interface Product {
  product_id: number
  category_id: number
  supplier_id: number
  sku: string
  product_name: BilingualString
  brand: string
  model_number: string
  short_description: BilingualString
  full_description: BilingualString
  cost_price: number
  wholesale_price: number | null
  current_price: number
  sale_price: number | null
  weight_kg: number
  warranty_months: number
  is_active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
  // Joined data
  category?: Category
  images?: ProductImage[]
  attributes?: ProductAttribute[]
  stock?: Stock[]
  total_stock?: number
  variants?: ProductVariant[]
  average_rating?: number
  review_count?: number
}

export interface Category {
  category_id: number
  parent_category_id: number | null
  category_name: BilingualString
  category_slug: string
  category_image: string
  description: BilingualString
  level: number
  created_at: string
  deleted_at: string | null
}

export interface ProductImage {
  image_id: number
  product_id: number
  image_url: string
  alt_text: string
  display_order: number
  is_primary: boolean
}

export interface ProductAttribute {
  attribute_id: number
  product_id: number
  attribute_name: BilingualString
  attribute_value: string
}

export interface Stock {
  stock_id: number
  product_id: number
  warehouse_id: number
  quantity: number
  reserved_quantity: number
  reorder_level: number
  last_restocked: string
}

export interface ProductsResponse {
  products: Product[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface ProductFilters {
  search?: string
  category?: string
  collection?: string
  brand?: string
  minPrice?: number
  maxPrice?: number
  inStock?: boolean
  page?: number
  limit?: number
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'rating' | 'name'
}

export const productsApi = {
  // Get all products with filters (uses public storefront endpoint)
  async getAll(filters: ProductFilters = {}): Promise<{ data?: ProductsResponse; error?: string }> {
    const params = new URLSearchParams()

    if (filters.search) params.append('search', filters.search)
    if (filters.category) params.append('category', filters.category)
    if (filters.collection) params.append('collection', filters.collection)
    if (filters.brand) params.append('brand', filters.brand)
    if (filters.minPrice) params.append('minPrice', filters.minPrice.toString())
    if (filters.maxPrice) params.append('maxPrice', filters.maxPrice.toString())
    if (filters.inStock !== undefined) params.append('inStock', filters.inStock.toString())
    if (filters.page) params.append('page', filters.page.toString())
    if (filters.limit) params.append('limit', filters.limit.toString())
    if (filters.sortBy) params.append('sortBy', filters.sortBy)

    const queryString = params.toString()
    // Use storefront endpoint for public access (no auth required)
    const endpoint = `/storefront/products${queryString ? `?${queryString}` : ''}`

    const response = await api.get<ProductsResponse>(endpoint)

    if (response.error) {
      return { error: response.error.message }
    }

    return { data: response.data }
  },

  // Get single product by ID (uses public storefront endpoint)
  async getById(id: number): Promise<{ data?: Product; error?: string }> {
    const response = await api.get<Product>(`/storefront/products/${id}`)

    if (response.error) {
      return { error: response.error.message }
    }

    return { data: response.data }
  },

  // Get featured products (uses public storefront endpoint)
  async getFeatured(): Promise<{ data?: Product[]; error?: string }> {
    const response = await api.get<{ products: Product[] }>('/storefront/products/featured?limit=8')

    if (response.error) {
      return { error: response.error.message }
    }

    return { data: response.data?.products }
  },

  // Get new products (uses public storefront endpoint)
  async getNew(): Promise<{ data?: Product[]; error?: string }> {
    const response = await api.get<{ products: Product[] }>('/storefront/products/new?limit=8')

    if (response.error) {
      return { error: response.error.message }
    }

    return { data: response.data?.products }
  },

  // Get products by category (uses public storefront endpoint)
  async getByCategory(categorySlug: string): Promise<{ data?: Product[]; error?: string }> {
    const response = await api.get<ProductsResponse>(`/storefront/products?category=${categorySlug}`)

    if (response.error) {
      return { error: response.error.message }
    }

    return { data: response.data?.products }
  },



  async getTopBrands(): Promise<{ data?: string[]; error?: string }> {
    const response = await api.get<{ brands: string[] }>('/storefront/brands/top')

    if (response.error) {
      return { error: response.error.message }
    }

    return { data: response.data?.brands }
  },



  // Get all brands
  async getBrands(): Promise<{ data?: string[]; error?: string }> {
    const response = await api.get<{ brands: string[] }>('/products/brands')

    if (response.error) {
      return { error: response.error.message }
    }

    return { data: response.data?.brands }
  },
}
