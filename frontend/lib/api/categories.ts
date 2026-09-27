// Categories API service

import { api } from './client'
import type { Category } from './products'

export interface CategoriesResponse {
  categories: Category[]
}

export const categoriesApi = {
  // Get all categories
  async getAll(): Promise<{ data?: Category[]; error?: string }> {
    const response = await api.get<Category[]>('/categories')

    if (response.error) {
      return { error: response.error.message }
    }

    return { data: response.data }
  },

  // Get category by ID
  async getById(id: number): Promise<{ data?: Category; error?: string }> {
    const response = await api.get<Category>(`/categories/${id}`)

    if (response.error) {
      return { error: response.error.message }
    }

    return { data: response.data }
  },

  // Get category by slug
  async getBySlug(slug: string): Promise<{ data?: Category; error?: string }> {
    const response = await api.get<Category>(`/categories/slug/${slug}`)

    if (response.error) {
      return { error: response.error.message }
    }

    return { data: response.data }
  },

  // Get root categories (top-level)
  async getRootCategories(): Promise<{ data?: Category[]; error?: string }> {
    const response = await api.get<Category[]>('/categories?level=1')

    if (response.error) {
      return { error: response.error.message }
    }

    return { data: response.data }
  },

  // Get subcategories of a parent
  async getSubcategories(parentId: number): Promise<{ data?: Category[]; error?: string }> {
    const response = await api.get<Category[]>(`/categories?parentId=${parentId}`)

    if (response.error) {
      return { error: response.error.message }
    }

    return { data: response.data }
  },
}
