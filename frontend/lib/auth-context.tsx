"use client"

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react"
import { authApi, type User, type VerifyResult } from "./api"
import { useRouter, usePathname } from "next/navigation"

type AuthState = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  authState: AuthState
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  googleLogin: (token: string) => Promise<{ success: boolean; error?: string }> // New Function
  logout: () => void
  register: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phone?: string 
  ) => Promise<{ success: boolean; error?: string }>
   verifyEmail: (token: string) => Promise<{ success: boolean; error?: string }>
  forgotPassword: (email: string) => Promise<{ success: boolean; message?: string; error?: string }>
  resetPassword: (token: string, newPassword: string) => Promise<{ success: boolean; error?: string }>
  resendVerification: (email: string) => Promise<void>
  updateUser: (user: User) => void
  isAuthenticated: boolean
  isAuthReady: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Environment-aware logging
const isDev = process.env.NODE_ENV === 'development'
const authLog = (message: string, ...args: any[]) => {
  if (isDev) {
    console.log(message, ...args)
  }
}

/**
 * Verify auth with exponential backoff retry
 * ENHANCED: Now properly uses error details from verify() for smarter retry logic
 * 
 * Retry policy:
 * - 401/403: No retry (auth failure - user needs to login)
 * - 4xx (other): No retry (client error)
 * - 5xx: Retry with exponential backoff (server error)
 * - Network error: Retry with exponential backoff
 */
const verifyAuthWithRetry = async (maxRetries = 3): Promise<{ success: boolean; user: User | null; reason?: 'auth_failed' | 'transient' }> => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result: VerifyResult = await authApi.verify()
      
      if (result.valid && result.user) {
        authLog(`[Auth] Session verified successfully on attempt ${attempt + 1}`)
        return { success: true, user: result.user }
      }
      
      // ENHANCED: Now properly uses error object from verify()
      if (result.error) {
        const { status, isNetworkError, message } = result.error
        
        // 401/403: Auth failure - don't retry, user needs to login
        if (status === 401 || status === 403) {
          authLog(`[Auth] Got ${status} - Session invalid, not retrying. Message: ${message}`)
          return { success: false, user: null, reason: 'auth_failed' }
        }
        
        // Other 4xx: Client error - don't retry
        if (status >= 400 && status < 500) {
          authLog(`[Auth] Got ${status} - Client error, not retrying`)
          return { success: false, user: null, reason: 'auth_failed' }
        }
        
        // Network error or 5xx: Retry with exponential backoff
        if (isNetworkError || status >= 500 || status === 0) {
          authLog(`[Auth] ${isNetworkError ? 'Network error' : `Got ${status}`} - will retry if attempts remain`)
          
          if (attempt < maxRetries - 1) {
            const delayMs = 200 * Math.pow(2, attempt) // 200ms, 400ms, 800ms
            authLog(`[Auth] Retrying in ${delayMs}ms...`)
            await new Promise(resolve => setTimeout(resolve, delayMs))
            continue // Continue to next iteration
          }
        }
      }
      
      // Unknown error or no error object - don't retry
      return { success: false, user: null, reason: 'auth_failed' }
    } catch (error) {
      const isNetworkError = error instanceof TypeError || (error instanceof Error && error.message.includes('fetch'))
      authLog(`[Auth] Verify attempt ${attempt + 1}/${maxRetries} failed (network: ${isNetworkError})`, error)
      
      if (attempt < maxRetries - 1) {
        // Only retry on network errors or transient failures
        if (isNetworkError) {
          // Exponential backoff: 200ms, 400ms, 800ms
          const delayMs = 200 * Math.pow(2, attempt)
          authLog(`[Auth] Retrying in ${delayMs}ms...`)
          await new Promise(resolve => setTimeout(resolve, delayMs))
        } else {
          // Non-network error - don't retry
          authLog('[Auth] Non-network error, not retrying')
          return { success: false, user: null, reason: 'auth_failed' }
        }
      }
    }
  }
  
  authLog('[Auth] All retry attempts exhausted')
  return { success: false, user: null, reason: 'transient' }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [authState, setAuthState] = useState<AuthState>('loading')
  const router = useRouter()
  const pathname = usePathname()
  
  // Ref to track if we're currently verifying (prevents duplicate calls)
  const isVerifying = useRef(false)
  

  
  // Ref for BroadcastChannel
  const authChannelRef = useRef<BroadcastChannel | null>(null)

  // Extract locale from pathname
  const getLocale = useCallback(() => {
    return pathname?.split('/')[1] || 'fr'
  }, [pathname])

  // Setup cross-tab authentication synchronization
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
      return // Not supported or SSR
    }

    try {
      const channel = new BroadcastChannel('auth-sync')
      authChannelRef.current = channel
      
      channel.onmessage = (event) => {
        const { type, timestamp } = event.data
        authLog(`[Auth] Received cross-tab event: ${type}`)
        
        if (type === 'LOGOUT') {
          // Another tab logged out - sync this tab
          authLog('[Auth] Cross-tab logout detected - syncing...')
          setUser(null)
          setAuthState('unauthenticated')
          // Don't redirect here - let the user continue on public pages
        }
        
        if (type === 'LOGIN') {
          // Another tab logged in - re-verify to get user data
          // OPTIMIZED: Only verify if we're not already verifying
          authLog('[Auth] Cross-tab login detected - re-verifying...')
          if (!isVerifying.current) {
            isVerifying.current = true
            // Use single retry instead of 3 retries for cross-tab sync
            verifyAuthWithRetry(1).then(result => {
              if (result.success && result.user) {
                setUser(result.user)
                setAuthState('authenticated')
              }
              isVerifying.current = false
            }).catch(() => {
              isVerifying.current = false
            })
          }
        }
        
        if (type === 'REFRESH') {
          // Token was refreshed in another tab - no action needed
          // The current session is still valid, no need to re-verify
          authLog('[Auth] Cross-tab refresh detected - session still valid')
        }
      }

      return () => {
        channel.close()
        authChannelRef.current = null
      }
    } catch (err) {
      authLog('[Auth] BroadcastChannel error:', err)
    }
  }, [])

  // Verify session on mount (Cookie check) - with retry logic
  useEffect(() => {
    const verifyAuth = async () => {
      if (isVerifying.current) return // Prevent duplicate verification
      
      isVerifying.current = true
      setAuthState('loading')
      
      try {
        const result = await verifyAuthWithRetry(3)
        
        if (result.success && result.user) {
          setUser(result.user)
          setAuthState('authenticated')
          authLog('[Auth] Session verified')
        } else if (result.reason === 'transient') {
          // Transient failure (network/429/5xx) - don't force logout, stay in unauthenticated
          // but don't redirect. User can try again manually.
          setUser(null)
          setAuthState('unauthenticated')
          authLog('[Auth] Session check failed due to transient error - not forcing logout')
        } else {
          setUser(null)
          setAuthState('unauthenticated')
          authLog('[Auth] Session not authenticated')
        }
      } finally {
        isVerifying.current = false
      }
    }

    verifyAuth()
  }, [])

  // Re-verify auth when tab becomes visible (user returns after inactivity)
  // OPTIMIZED: Only verify if user has been away for a significant time (5+ minutes)
  useEffect(() => {
    if (typeof window === 'undefined') return

    let lastVerifyTime = Date.now()
    const MIN_VERIFY_INTERVAL = 5 * 60 * 1000 // 5 minutes

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && authState === 'authenticated') {
        const timeSinceLastVerify = Date.now() - lastVerifyTime
        
        // Only verify if enough time has passed to avoid excessive calls
        if (timeSinceLastVerify < MIN_VERIFY_INTERVAL) {
          authLog('[Auth] Tab became visible but verified recently, skipping')
          return
        }
        
        authLog('[Auth] Tab became visible - re-verifying session...')
        lastVerifyTime = Date.now()
        
        // Quick verify without full retry (the client.ts will handle refresh if needed)
        authApi.verify().then(result => {
          if (result.valid && result.user) {
            setUser(result.user)
            authLog('[Auth] Session still valid after visibility change')
          } else if (result.error?.status === 401) {
            // Session expired - update state (refresh was already attempted by client.ts)
            authLog('[Auth] Session expired after visibility change')
            setUser(null)
            setAuthState('unauthenticated')
          }
          // For network errors, keep current state and let user retry manually
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [authState])

  const login = useCallback(async (email: string, password: string) => {
    setAuthState('loading')
    try {
      const result = await authApi.login({ email, password })
      if (result.success && result.user) {
        setUser(result.user)
        setAuthState('authenticated')
        return { success: true }
      }
      setAuthState('unauthenticated')
      setUser(null)
      return { success: false, error: result.error || "Invalid email or password" }
    } catch {
      setAuthState('unauthenticated')
      setUser(null)
      return { success: false, error: "Network error. Please try again." }
    }
  }, [])

  // New Google Login Handler
  const googleLogin = useCallback(async (token: string) => {
    setAuthState('loading')
    try {
      // Call the backend endpoint we created
      const result = await authApi.googleLogin(token)
      if (result.success && result.user) {
        setUser(result.user)
        setAuthState('authenticated')
        return { success: true }
      }
      setAuthState('unauthenticated')
      setUser(null)
      return { success: false, error: result.error || "Google login failed" }
    } catch {
      setAuthState('unauthenticated')
      setUser(null)
      return { success: false, error: "Network error. Please try again." }
    }
  }, [])

  const logout = useCallback(async () => {
    const locale = getLocale()
    
    // Keep authState as 'loading' throughout the entire logout process
    // This prevents useProtectedRoute from racing with its own redirect
    setUser(null)
    setAuthState('loading')
    
    // Clear cookies on the backend BEFORE navigating
    try {
      await authApi.logout()
    } catch (err) {
      console.error("[Auth] Backend logout failed (cookies may persist until expiry):", err)
    }
    
    // Navigate FIRST, then set unauthenticated on next tick
    // This ensures useProtectedRoute on /account doesn't fire a competing redirect
    router.replace(`/${locale}/login`)
    
    // Delay state change so the navigation starts before useProtectedRoute can react
    setTimeout(() => {
      setAuthState('unauthenticated')
    }, 0)
  }, [router, getLocale])

const register = useCallback(async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phone?: string
  ) => {
    setAuthState('loading')
    try {
      const result = await authApi.register({
        email,
        password,
        firstName,
        lastName,
        phone,
      })
    if (result.success) {
        // Don't set authenticated state for registration - require email verification
        setAuthState('unauthenticated')
        return { success: true }
      }
      setAuthState('unauthenticated')
      return { success: false, error: result.error || "Registration failed" }
    } catch {
      setAuthState('unauthenticated')
      return { success: false, error: "Network error. Please try again." }
    }
  }, [])



    const verifyEmail = useCallback(async (token: string) => {
    setAuthState('loading')
    try {
      return await authApi.verifyEmail(token)
    } finally {
      setAuthState('unauthenticated')
    }
  }, [])

  const forgotPassword = useCallback(async (email: string) => {
    try {
      return await authApi.forgotPassword(email)
    } catch {
      return { success: false, error: "Network error. Please try again." }
    }
  }, [])

  const resetPassword = useCallback(async (token: string, newPassword: string) => {
    setAuthState('loading')
    try {
      return await authApi.resetPassword(token, newPassword)
    } finally {
      setAuthState('unauthenticated')
    }
  }, [])

  const resendVerification = useCallback(async (email: string) => {
      await authApi.resendVerification(email)
    }, [])

    const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: authState === 'loading',
        authState,
        login,
        googleLogin, // Exported here
        logout,
        register,
        updateUser,
        verifyEmail,
        forgotPassword,
        resetPassword,
        resendVerification,
        isAuthenticated: authState === 'authenticated',
        isAuthReady: authState !== 'loading',
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export type { User } from "./api"