"use client"

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react"
import { useAuth } from "./auth-context"
import { api } from "./api/client"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useLanguage } from "./language-context"
import { offlineDB } from "./db/offline-store"
import { encryptData, decryptData } from "./crypto/hmac-signer"
import { queueMutation } from "./sync/sync-manager"

interface WishlistItem {
  productId: number
  addedAt: string
}

interface WishlistContextType {
  items: WishlistItem[]
  isInWishlist: (productId: number) => boolean
  addToWishlist: (productId: number) => void
  removeFromWishlist: (productId: number) => void
  toggleWishlist: (productId: number) => void
  clearWishlist: () => void
  showClearDialog: () => void
  itemCount: number
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined)

const WISHLIST_STORAGE_KEY = "wishlist"

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<WishlistItem[]>([])
  const [isHydrated, setIsHydrated] = useState(false)
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [useIndexedDB, setUseIndexedDB] = useState(false)
  const [serverSynced, setServerSynced] = useState(false)
  const { user, authState } = useAuth()
  const languageContext = useLanguage()
  const router = useRouter()
  const lastUserIdRef = useRef<number | null>(null)
  const hydratedUserIdRef = useRef<number | null>(null)
  
  useEffect(() => {
    const currentUserId = user?.id ?? null
    if (lastUserIdRef.current !== currentUserId) {
      lastUserIdRef.current = currentUserId
      hydratedUserIdRef.current = null
      setIsHydrated(false)
      setServerSynced(false)
      setItems([])
    }
  }, [user?.id])
  
  // ✅ SECURITY FIX: Add null safety for SSR/initial render
  // Prevents "Cannot read properties of undefined" errors
  const t = languageContext?.t || { alertDialogs: { loginRequired: { title: '', description: '', loginButton: '' }, clearWishlist: { title: '', description: '' }, common: { cancel: '', delete: '' } } }
  const language = languageContext?.language || 'fr'

  // STEP 1: LOAD effect - runs once per user identity change
  useEffect(() => {
    let mounted = true

    const loadWishlist = async () => {
      try {
        if (typeof window === 'undefined') return

        // Wait for auth to resolve before making any decisions
        if (authState === 'loading') return

        // Only load if user is logged in
        if (!user?.id) {
          if (mounted) {
            setIsHydrated(true)
            setItems([])
          }
          return
        }
        let loaded = false

        // Try IndexedDB first
        try {
          const wishlistData = await offlineDB.appMetadata.get('wishlist')
          if (wishlistData?.value) {
            try {
              const decrypted = await decryptData(wishlistData.value as string | any, user.id.toString())
              let itemsParsed: any = typeof decrypted === 'string' ? JSON.parse(decrypted) : JSON.parse(JSON.stringify(decrypted))
              
              if (!Array.isArray(itemsParsed)) {
                console.warn('❌ Wishlist data invalid, resetting')
                itemsParsed = []
              }
              
              if (mounted) {
                setItems(itemsParsed)
                setUseIndexedDB(true)
              }
              loaded = true
            } catch (decryptError) {
              console.warn('❌ Clearing corrupted wishlist:', decryptError instanceof Error ? decryptError.message : 'Unknown error')
              await offlineDB.appMetadata.delete('wishlist')
            }
          }
        } catch (error) {
          console.warn('⚠️ IndexedDB unavailable for wishlist')
        }

        // Fallback to localStorage
        if (!loaded) {
          const stored = localStorage.getItem(WISHLIST_STORAGE_KEY)
          if (stored) {
            try {
              const parsed = JSON.parse(stored)
              if (mounted) {
                setItems(Array.isArray(parsed) ? parsed : [])
                setUseIndexedDB(false)
              }
              loaded = true
            } catch (error) {
              console.error('❌ Failed to parse wishlist:', error)
            }
          }
        }

        // Mark as hydrated
        if (mounted) {
          if (!loaded) {
            setItems([])
            setUseIndexedDB(true) // Try IndexedDB for future saves
          }
          hydratedUserIdRef.current = user.id
          setIsHydrated(true)
        }
      } catch (error) {
        console.error('Wishlist load error:', error)
      }
    }

    loadWishlist()

    return () => {
      mounted = false
    }
  }, [user?.id, authState])

  // STEP 2: SAVE effect - runs when items change after hydration
  useEffect(() => {
    if (!isHydrated) return
    if (!user?.id) return
    if (hydratedUserIdRef.current !== user.id) return

    const saveWishlist = async () => {
      try {
        const encrypted = await encryptData(JSON.stringify(items), user.id.toString())
        await offlineDB.appMetadata.put({ key: 'wishlist', value: encrypted })
        setUseIndexedDB(true)
      } catch (error) {
        console.warn('IndexedDB save failed, using localStorage:', error)
        localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(items))
        setUseIndexedDB(false)
      }
    }

    saveWishlist()
  }, [items, isHydrated, user?.id])

  // STEP 3: Fetch from server after local data is loaded (sync server to local)
  useEffect(() => {

    let mounted = true

    const syncFromServer = async () => {
      // Only run once after hydration when user is fully authenticated (not during loading/refresh)
      if (!isHydrated || authState !== 'authenticated' || !user?.id || serverSynced) return

      try {
        // Fetch favorites directly (inline to avoid dependency issues)
        const result = await api.get<{ success: boolean; favorites: Array<{ productId: number; addedAt: string }> }>('/favorites/product-ids')

        if (result.error) {
          if (result.error.status === 401) {
            console.log('⚠️ [WISHLIST SYNC] Unauthorized, skipping server favorites fetch')
            return
          }
          throw new Error(result.error.message)
        }

        const data = result.data
        
        if (!data || !data.success || !Array.isArray(data.favorites) || !mounted) return

        const serverFavorites = data.favorites.map((f: any) => ({
          productId: f.productId,
          addedAt: f.addedAt
        }))

        // Merge server favorites with local favorites
        setItems(currentItems => {
          const localProductIds = new Set(currentItems.map(item => item.productId))
          const newFromServer = serverFavorites.filter(
            (serverItem: WishlistItem) => !localProductIds.has(serverItem.productId)
          )

          if (newFromServer.length > 0) {
            return [...currentItems, ...newFromServer]
          }

          return currentItems
        })

        if (mounted) {
          setServerSynced(true)
          
        }
      } catch (error) {
        console.warn('⚠️ [WISHLIST SYNC] Failed:', error instanceof Error ? error.message : 'Unknown error')
      }
    }

    syncFromServer()

    return () => {
      mounted = false
    }
  }, [isHydrated, authState, user?.id, serverSynced])

  const isInWishlist = useCallback(
    (productId: number) => {
      return items.some((item) => item.productId === productId)
    },
    [items]
  )

  const addToWishlist = useCallback(
    (productId: number) => {
      if (!user) {
        setShowLoginDialog(true)
        return
      }

      if (isInWishlist(productId)) {
        toast.info("This item is already in your wishlist")
        return
      }

      setItems((prev) => [
        ...prev,
        {
          productId,
          addedAt: new Date().toISOString(),
        },
      ])
      
      // Queue mutation for sync
      try {
        const mutationData = {
          productId
        }
        queueMutation('add_to_wishlist', mutationData).catch(error => {
          console.warn('Failed to queue add_to_wishlist mutation:', error.message)
        })
      } catch (error) {
        console.warn('Could not queue mutation:', error)
      }
      
      toast.success("Added to wishlist")
    },
    [user, isInWishlist]
  )

  const removeFromWishlist = useCallback((productId: number) => {
    setItems((prev) => prev.filter((item) => item.productId !== productId))
    
    // Queue mutation for sync
    try {
      const mutationData = {
        productId
      }
      queueMutation('remove_from_wishlist', mutationData).catch(error => {
        console.warn('Failed to queue remove_from_wishlist mutation:', error.message)
      })
    } catch (error) {
      console.warn('Could not queue mutation:', error)
    }
    
    toast.success("Removed from wishlist")
  }, [])

  const toggleWishlist = useCallback(
    (productId: number) => {
      if (isInWishlist(productId)) {
        removeFromWishlist(productId)
      } else {
        addToWishlist(productId)
      }
    },
    [isInWishlist, addToWishlist, removeFromWishlist]
  )

  const clearWishlist = useCallback(() => {
    setItems([])
    setShowClearConfirm(false)
    toast.success("Wishlist cleared")
  }, [])

  const showClearDialog = useCallback(() => {
    setShowClearConfirm(true)
  }, [])

  const handleLoginRedirect = () => {
    setShowLoginDialog(false)
    router.push(`/${language}/login`)
  }

  const itemCount = items.length

  return (
    <WishlistContext.Provider
      value={{
        items,
        isInWishlist,
        addToWishlist,
        removeFromWishlist,
        toggleWishlist,
        clearWishlist,
        showClearDialog,
        itemCount,
      }}
    >
      {children}

      {/* Login Required AlertDialog */}
      <AlertDialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.alertDialogs.loginRequired.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.alertDialogs.loginRequired.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.alertDialogs.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleLoginRedirect}>
              {t.alertDialogs.loginRequired.loginButton}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Wishlist AlertDialog */}
      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.alertDialogs.clearWishlist.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.alertDialogs.clearWishlist.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.alertDialogs.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={clearWishlist}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.alertDialogs.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WishlistContext.Provider>
  )
}

export function useWishlist() {
  const context = useContext(WishlistContext)
  if (!context) {
    throw new Error("useWishlist must be used within a WishlistProvider")
  }
  return context
}

// Diagnostic function - call from console to debug wishlist issues
export async function debugWishlist() {
  try {
    console.log('🔍 Diagnosing wishlist...')
    
    // Check localStorage
    const localStorageData = localStorage.getItem('wishlist')
    console.log('📦 localStorage wishlist:', localStorageData ? `${localStorageData.length} bytes` : 'empty')
    if (localStorageData) {
      try {
        const parsed = JSON.parse(localStorageData)
        console.log('   → Items count:', Array.isArray(parsed) ? parsed.length : 'not an array')
        console.log('   → First item:', parsed[0])
      } catch (e: unknown) {
        const parseError = e instanceof Error ? e.message : 'Unknown error';
        console.log('   → Parse error:', parseError)
      }
    }
    
    // Check IndexedDB
    const wishlistData = await offlineDB.appMetadata.get('wishlist')
    console.log('📦 IndexedDB wishlist:', wishlistData ? 'exists' : 'empty')
    if (wishlistData?.value) {
      const value = wishlistData.value
      console.log('   → Size:', typeof value === 'string' ? `${value.length} bytes` : 'object')
      console.log('   → Format:', typeof value)
      if (typeof value === 'string') {
        console.log('   → Encrypted format: "iv:encrypted"')
      }
    }
    
    console.log('✅ Diagnosis complete')
  } catch (error) {
    console.error('❌ Diagnosis failed:', error)
  }
}

// Clear function - call from console to reset wishlist
export async function clearWishlistStorage() {
  try {
    console.log('🗑️  Clearing wishlist storage...')
    
    // Clear localStorage
    localStorage.removeItem('wishlist')
    console.log('✅ Cleared localStorage')
    
    // Clear IndexedDB
    try {
      await offlineDB.appMetadata.delete('wishlist')
      console.log('✅ Cleared IndexedDB')
    } catch (e: unknown) {
      const clearError = e instanceof Error ? e.message : 'Unknown error';
      console.log('⚠️  IndexedDB clear failed (may not exist):', clearError)
    }
    
    console.log('✅ Storage cleared - refresh page to see changes')
    return true
  } catch (error) {
    console.error('❌ Clear failed:', error)
    return false
  }
}
