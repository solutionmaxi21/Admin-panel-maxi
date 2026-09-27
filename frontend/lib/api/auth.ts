// Authentication API service
import { api, broadcastAuthEvent, updateLastSuccessfulAuth } from './client'

export interface User {
  id: number
  email: string
  firstName: string
  lastName: string
  role: 'admin' | 'customer' | 'warehouse_staff'
  phone?: string
}

export interface LoginRequest {
  email: string
  password: string
}

// Response no longer contains tokens (they are in cookies)
export interface AuthResponse {
  success: boolean
  message?: string
  user?: User
  error?: string
}

export interface RegisterRequest {
  email: string
  password: string
  firstName: string
  lastName: string
  phone?: string
}

export interface VerifyResponse {
  success: boolean
  user: User
}

// Enhanced verify result with error details for proper error handling
export interface VerifyResult {
  valid: boolean
  user?: User
  error?: {
    status: number
    message: string
    code?: string
    isNetworkError?: boolean
  }
}

export const authApi = {
  // Login user (Email/Password)
  async login(credentials: LoginRequest): Promise<{ success: boolean; user?: User; error?: string }> {
    // FIX: Pass 'false' as 3rd arg to disable auto-refresh on 401 error
    const response = await api.post<AuthResponse>('/auth/login', credentials, false)

    if (response.error) {
      return { success: false, error: response.error.message }
    }

    if (response.data?.success && response.data.user) {
      // Update auth timestamp and broadcast login event
      updateLastSuccessfulAuth()
      broadcastAuthEvent('LOGIN')
      return { success: true, user: response.data.user }
    }

    return { success: false, error: 'Unknown error' }
  },

  // Login user (Google)
  async googleLogin(token: string): Promise<{ success: boolean; user?: User; error?: string }> {
    // FIX: Pass 'false' here too
    const response = await api.post<AuthResponse>('/auth/google', { token }, false)

    if (response.error) {
      return { success: false, error: response.error.message }
    }

    if (response.data?.success && response.data.user) {
      // Update auth timestamp and broadcast login event
      updateLastSuccessfulAuth()
      broadcastAuthEvent('LOGIN')
      return { success: true, user: response.data.user }
    }

    return { success: false, error: 'Google login failed' }
  },

  // Register new user
  async register(data: RegisterRequest): Promise<{ success: boolean; user?: User; error?: string }> {
    const response = await api.post<AuthResponse>('/auth/signup', data, false)

    if (response.error) {
      return { success: false, error: response.error.message }
    }

    // === FIX: Check only for success, not for user ===
    if (response.data?.success) {
      // Return success even if user is undefined (because of email verification flow)
      return { success: true, user: response.data.user } 
    }

    return { success: false, error: 'Registration failed' }
  },
  
  // Verify current session - ENHANCED to return error details
  async verify(): Promise<VerifyResult> {
    // We KEEP retry=true (default) here because if this fails with 401, 
    // the client.ts will automatically attempt token refresh before returning error
    const response = await api.get<VerifyResponse>('/auth/me')

    // Return error details for proper handling in auth-context
    if (response.error) {
      return { 
        valid: false,
        error: {
          status: response.error.status,
          message: response.error.message,
          code: response.error.code,
          isNetworkError: response.error.isNetworkError,
        }
      }
    }

    if (!response.data?.success) {
      return { valid: false }
    }

    // Update successful auth timestamp
    updateLastSuccessfulAuth()
    return { valid: true, user: response.data.user }
  },

  // ...  
  async resendVerification(email: string): Promise<{ success: boolean; message?: string }> {
    await api.post('/auth/resend-verification', { email }, false)
    return { success: true, message: "Email sent" }
  },
// ...
  // Logout user - ENHANCED with broadcast
  async logout(): Promise<void> {
    // retry=false: don't attempt token refresh during logout
    await api.post('/auth/logout', {}, false, { 'x-client-type': 'customer' })
    // Broadcast logout to other tabs
    broadcastAuthEvent('LOGOUT')
  },


// Verify Email Token
  async verifyEmail(token: string): Promise<{ success: boolean; error?: string }> {
    const response = await api.post<{ success: boolean; message: string }>('/auth/verify-email', { token }, false)
    if (response.error) return { success: false, error: response.error.message }
    return { success: true }
  },

  // Request Password Reset Link
  async forgotPassword(email: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const response = await api.post<{ success: boolean; message: string }>('/auth/forgot-password', { email }, false)
    if (response.error) return { success: false, error: response.error.message }
    return { success: true, message: response.data?.message }
  },

  // Set New Password
  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const response = await api.post<{ success: boolean; message: string }>(
      '/auth/reset-password', 
      { token, newPassword }, 
      false
    )
    if (response.error) return { success: false, error: response.error.message }
    return { success: true }
  }

}