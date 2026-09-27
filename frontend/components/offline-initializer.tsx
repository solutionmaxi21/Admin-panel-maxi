'use client'

import { useEffect } from 'react'
import { initSyncManager } from '@/lib/sync/sync-manager'
import { initializeSigningKey, clearSigningKey, parseJWT } from '@/lib/crypto/hmac-signer'
import { offlineDB } from '@/lib/db/offline-store'
import { useAuth } from '@/lib/auth-context'
import { getApiBaseUrl } from '@/lib/api/base-url'

/**
 * Initialize offline functionality
 * - Sync manager for queue processing
 * - HMAC signing key from JWT
 */
export function OfflineInitializer() {
  const { user } = useAuth()

  useEffect(() => {
    // Initialize sync manager
    initSyncManager()

    return () => {
      // Cleanup on unmount (though this rarely happens for root layout)
    }
  }, [])

  useEffect(() => {
    // Initialize HMAC signing key when user logs in
    const initializeKey = async () => {
      if (user?.id) {  // Add null safety check
        try {
          // Always initialize the in-memory key for the current runtime.
          // The signing key is not persisted across page refreshes.
          await offlineDB.appMetadata.put({
            key: 'user',
            value: { id: user.id.toString(), initialized: false },
          })

          // Fetch the JWT iat from the server (since JWT is in HttpOnly cookie)
          const apiUrl = getApiBaseUrl()
          const response = await fetch(`${apiUrl}/auth/me`, {
            credentials: 'include'
          }).catch((fetchError) => {
            // Network error (backend unavailable)
            console.warn('⚠️ Cannot reach backend. Offline features will be limited.')
            return null
          })
          
          if (!response) {
            // Fetch failed (network error)
            return
          }
          
          if (!response.ok) {
            // Backend returned an error (likely 401 Unauthorized if not logged in)
            if (response.status === 401) {
              console.debug('User not authenticated. Skipping offline initialization.')
            } else {
              console.warn(`⚠️ Backend returned status ${response.status}. Offline features may be limited.`)
            }
            return // Gracefully skip offline initialization
          }
          
          const data = await response.json()
          
          const payload = {
            userId: user.id.toString(),
            iat: data.jwtIat // Use the REAL iat from JWT
          }
          
          await initializeSigningKey(payload)
          
          // Mark as initialized to prevent duplicate calls
          await offlineDB.appMetadata.put({
            key: 'user',
            value: { id: user.id.toString(), initialized: true },
          })
          
          console.log('✅ Offline mode initialized for user:', user.id, 'iat:', data.jwtIat)
        } catch (error) {
          // Catch any other errors (JSON parsing, database errors, etc.)
          console.warn('⚠️ Could not initialize offline mode:', error instanceof Error ? error.message : 'Unknown error')
          // Don't throw - allow app to continue without offline features
        }
      } else if (user === null) {
        // Clear signing key on logout (only when user is explicitly null, not undefined)
        await offlineDB.appMetadata.delete('user')
        clearSigningKey()
      }
    }

    initializeKey()
  }, [user])

  return null // This component doesn't render anything
}
