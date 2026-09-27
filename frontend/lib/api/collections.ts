import { api } from './client'
import type { Product } from './products'

export type BilingualString = string | { fr?: string; ar?: string }

export interface Collection {
  collection_id: number
  id: number
  parent_collection_id: number | null
  collection_name: BilingualString
  collection_slug: string
  description?: BilingualString | null
  tagline?: BilingualString | null
  icon?: string | null
  gradient?: string | null
  banner_image?: string | null
  thumbnail_image?: string | null
  benefits?: { fr?: string[]; ar?: string[] } | string[] | null
  level: number
  sort_order: number
  is_active: boolean
  meta_title?: string | null
  meta_description?: string | null
  product_count?: number
  created_at: string
  updated_at?: string
}

export interface CollectionProductsResponse {
  collection: Collection
  children: Collection[]
  products: Product[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export const collectionsApi = {
  async getAll(rootOnly = true): Promise<{ data?: Collection[]; error?: string }> {
    const response = await api.get<{ collections: Collection[] }>(`/storefront/collections?rootOnly=${rootOnly}`)

    if (response.error) {
      return { error: response.error.message }
    }

    return { data: response.data?.collections }
  },

  async getBySlug(slug: string, params?: { page?: number; limit?: number; sortBy?: string }): Promise<{ data?: CollectionProductsResponse; error?: string }> {
    const query = new URLSearchParams()
    if (params?.page) query.append('page', params.page.toString())
    if (params?.limit) query.append('limit', params.limit.toString())
    if (params?.sortBy) query.append('sortBy', params.sortBy)

    const response = await api.get<CollectionProductsResponse>(`/storefront/collections/${slug}${query.toString() ? `?${query.toString()}` : ''}`)

    if (response.error) {
      return { error: response.error.message }
    }

    return { data: response.data }
  },

  async getChildren(slug: string): Promise<{ data?: Collection[]; error?: string }> {
    const response = await api.get<{ children: Collection[] }>(`/storefront/collections/${slug}/children`)

    if (response.error) {
      return { error: response.error.message }
    }

    return { data: response.data?.children }
  },
}
