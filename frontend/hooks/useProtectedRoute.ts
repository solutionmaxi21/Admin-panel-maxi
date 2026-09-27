"use client"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useLanguage } from "@/lib/language-context"

/**
 * Hook for protecting routes with authentication
 * 
 * Returns:
 * - isLoading: true while authState === 'loading' (show spinner)
 * - The hook automatically redirects to login if authState === 'unauthenticated'
 * 
 * Usage:
 * ```tsx
 * export default function ProtectedPage() {
 *   const { isLoading } = useProtectedRoute()
 *   
 *   if (isLoading) {
 *     return <LoadingSpinner />
 *   }
 *   
 *   return <PageContent />
 * }
 * ```
 */
export function useProtectedRoute() {
  const { authState, user } = useAuth()
  const router = useRouter()
  const { language } = useLanguage()
  const pathname = usePathname()

  const isLoading = authState === 'loading'

  useEffect(() => {
    if (authState === 'unauthenticated') {
      console.log('[Auth] Route guard: User not authenticated, redirecting to login')
      const returnUrl = encodeURIComponent(pathname || '')
      router.replace(`/${language}/login${returnUrl ? `?returnUrl=${returnUrl}` : ''}`)
    }
  }, [authState, router, language, pathname])

  return {
    isLoading,
    user,
    authState,
  }
}
