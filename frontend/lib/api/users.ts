import { api, type ApiResponse } from './client'
import type { User } from './auth'

export interface Address {
  id: number
  userId: number
  firstName: string
  lastName: string
  addressLine1: string
  addressLine2?: string
  city: string
  state: string
  postalCode: string
  country: string
  phone: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface UpdateProfileRequest {
  firstName?: string
  lastName?: string
  phone?: string
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

export interface AddAddressRequest {
  firstName: string
  lastName: string
  addressLine1: string
  addressLine2?: string
  city: string
  state: string
  postalCode: string
  country: string
  phone: string
  isDefault?: boolean
}

export interface UpdateAddressRequest extends AddAddressRequest {
  id: number
}

export const usersApi = {
  // Get current user profile
  getProfile: async (): Promise<User> => {
    const response = await api.get<User>('/users/profile')
    return response.data!
  },

  // Update profile
  updateProfile: async (data: UpdateProfileRequest): Promise<User> => {
    const response = await api.put<User>('/users/profile', data)
    return response.data!
  },

  // Change password
  changePassword: async (data: ChangePasswordRequest): Promise<{ success: boolean; message: string }> => {
    const response = await api.post<{ success: boolean; message: string }>('/users/change-password', data)
    return response.data!
  },

  // Get user addresses
  getAddresses: async (): Promise<Address[]> => {
    const response = await api.get<Address[]>('/users/addresses')
    return response.data || []
  },

  // Add new address
  addAddress: async (data: AddAddressRequest): Promise<Address> => {
    const response = await api.post<Address>('/users/addresses', data)
    return response.data!
  },

  // Update address
  updateAddress: async (id: number, data: Omit<UpdateAddressRequest, 'id'>): Promise<Address> => {
    const response = await api.put<Address>(`/users/addresses/${id}`, data)
    return response.data!
  },

  // Delete address
  deleteAddress: async (id: number): Promise<{ success: boolean }> => {
    const response = await api.delete<{ success: boolean }>(`/users/addresses/${id}`)
    return response.data!
  },

  // Set default address
  setDefaultAddress: async (id: number): Promise<Address> => {
    const response = await api.post<Address>(`/users/addresses/${id}/default`, {})
    return response.data!
  },
}
