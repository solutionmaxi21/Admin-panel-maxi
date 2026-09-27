"use client"

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react"
import { toast } from "sonner"
import type { Product } from "./api"
import { offlineDB } from "./db/offline-store"
import { encryptData, decryptData } from "./crypto/hmac-signer"
import { useAuth } from "./auth-context"
import { queueMutation } from "./sync/sync-manager"

// Simplified cart product to avoid storing unnecessary data
export interface CartProduct {
  product_id: number
  variant_id?: number
  variant_name?: string
  product_name: string | { fr: string; ar: string }
  brand: string
  current_price: number
  sale_price: number | null
  image_url: string
  stock: number
  // Shipping calculation properties
  weight?: number
  length?: number
  width?: number
  height?: number
}

// Unique key for a cart item (same product with different variants = different items)
function cartItemKey(item: CartProduct): string {
  return item.variant_id ? `${item.product_id}_${item.variant_id}` : `${item.product_id}`
}

function matchesCartItem(a: CartProduct, productId: number, variantId?: number): boolean {
  if (a.product_id !== productId) return false
  if (variantId) return a.variant_id === variantId
  return !a.variant_id
}

export interface CartItem {
  product: CartProduct
  quantity: number
}

export interface AppliedPromo {
  code: string
  type: 'fixed' | 'percentage' | 'free_shipping'
  value: number
  description?: string
}

interface CartContextType {
  items: CartItem[]
  addItem: (product: Product | CartProduct, quantity?: number) => void
  removeItem: (productId: number, variantId?: number) => void
  updateQuantity: (productId: number, quantity: number, variantId?: number) => void
  clearCart: () => void
  totalItems: number
  totalPrice: number
  getItemQuantity: (productId: number, variantId?: number) => number
  appliedPromo: AppliedPromo | null
  setAppliedPromo: (promo: AppliedPromo | null) => void
}

const CartContext = createContext<CartContextType | undefined>(undefined)

function getProductDisplayName(name: string | { fr: string; ar: string }): string {
  if (typeof name === 'string') return name
  return name.fr || name.ar || ''
}

// Helper to extract cart product from full product
function toCartProduct(product: Product | CartProduct): CartProduct {
  if ('images' in product) {
    // Full Product from API - variant_id/variant_name are set by caller via CartProduct
    return {
      product_id: product.product_id,
      product_name: product.product_name,
      brand: product.brand,
      current_price: product.current_price,
      sale_price: product.sale_price,
      image_url: product.images?.[0]?.image_url || '/placeholder.svg',
      stock: product.total_stock || 0,
      // Include shipping properties if available
      weight: (product as any).weight,
      length: (product as any).length,
      width: (product as any).width,
      height: (product as any).height,
    }
  }
  // Already a CartProduct (may include variant_id/variant_name)
  return product as CartProduct
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)
  const [useIndexedDB, setUseIndexedDB] = useState(false)
  const { user, authState } = useAuth()
  const hydratedUserIdRef = useRef<string | number | null>(null)

  // User identity reset effect
  useEffect(() => {
    hydratedUserIdRef.current = null
    setIsHydrated(false)
  }, [user?.id])

  // LOAD effect - runs once on mount (and when user?.id changes)
  useEffect(() => {
    let mounted = true

    const loadCart = async () => {
      try {
        if (typeof window === 'undefined') return

        // Wait for auth to resolve before making any decisions
        if (authState === 'loading') return

        const userId = user?.id
        console.log('🛒 Cart initialization: userId =', userId)

        let loaded = false

        // Try IndexedDB first if we have a user
        if (userId) {
          try {
            const cartData = await offlineDB.appMetadata.get('cart')
            if (cartData?.value) {
              try {
                const decrypted = await decryptData(cartData.value as string | any, String(userId))
                let parsed = typeof decrypted === 'string' ? JSON.parse(decrypted) : JSON.parse(JSON.stringify(decrypted))

                if (!parsed || typeof parsed !== 'object') {
                  console.warn('❌ Cart data invalid, resetting')
                  parsed = { items: [], appliedPromo: null }
                }

                const loadedItems = Array.isArray(parsed.items) ? parsed.items : []
                if (mounted) {
                  setItems(loadedItems)
                  setAppliedPromo(parsed.appliedPromo || null)
                  setUseIndexedDB(true)
                  console.log('✅ Cart loaded from IndexedDB:', loadedItems.length, 'items')
                }
                loaded = true
              } catch (decryptError) {
                console.warn('❌ Clearing corrupted cart:', decryptError instanceof Error ? decryptError.message : String(decryptError))
                await offlineDB.appMetadata.delete('cart')
                await offlineDB.appMetadata.delete('appliedPromo')
              }
            }
          } catch (error) {
            console.warn('IndexedDB unavailable, using localStorage')
          }
        }

        // Fallback to localStorage
        if (!loaded) {
          const saved = localStorage.getItem('cart')
          const savedPromo = localStorage.getItem('appliedPromo')
          if (saved) {
            try {
              const parsed = JSON.parse(saved)
              if (mounted) {
                setItems(Array.isArray(parsed) ? parsed : [])
                setAppliedPromo(savedPromo ? JSON.parse(savedPromo) : null)
                setUseIndexedDB(false)
                console.log('✅ Cart loaded from localStorage')
              }
              loaded = true
            } catch {
              if (mounted) setItems([])
            }
          }
        }

        // Mark as hydrated if still mounted
        if (mounted && !loaded && userId) {
          setUseIndexedDB(true)
        }
        if (mounted) {
          hydratedUserIdRef.current = userId ?? null
          setIsHydrated(true)
        }
      } catch (error) {
        console.error('Cart initialization error:', error)
      }
    }

    loadCart()

    return () => {
      mounted = false
    }
  }, [user?.id, authState])

  // SAVE effect - runs when items/promo change AFTER hydration
  useEffect(() => {
    if (!isHydrated) return
    if (hydratedUserIdRef.current == null) return

    const saveCart = async () => {
      try {
        if (typeof window === 'undefined') return

        const userId = user?.id

        if (userId) {
          try {
            const cartData = { items, appliedPromo }
            const encrypted = await encryptData(JSON.stringify(cartData), String(userId))
            await offlineDB.appMetadata.put({ key: 'cart', value: encrypted })
            setUseIndexedDB(true)
            console.log('💾 Cart saved to IndexedDB')
          } catch (error) {
            console.warn('IndexedDB save failed, using localStorage:', error)
            localStorage.setItem('cart', JSON.stringify(items))
            if (appliedPromo) {
              localStorage.setItem('appliedPromo', JSON.stringify(appliedPromo))
            } else {
              localStorage.removeItem('appliedPromo')
            }
            setUseIndexedDB(false)
          }
        } else {
          // No user - save to localStorage
          localStorage.setItem('cart', JSON.stringify(items))
          if (appliedPromo) {
            localStorage.setItem('appliedPromo', JSON.stringify(appliedPromo))
          } else {
            localStorage.removeItem('appliedPromo')
          }
          setUseIndexedDB(false)
          console.log('💾 Cart saved to localStorage')
        }
      } catch (error) {
        console.error('Cart save error:', error)
      }
    }

    saveCart()
  }, [items, appliedPromo, isHydrated, user?.id])

  const addItem = useCallback((product: Product | CartProduct, quantity = 1) => {
    const cartProduct = toCartProduct(product)

    if (cartProduct.stock <= 0) {
      toast.error("This product is out of stock")
      return
    }
    
    const key = cartItemKey(cartProduct)
    
    setItems((prev) => {
      const existing = prev.find((item) => cartItemKey(item.product) === key)
      if (existing) {
        // Don't exceed stock
        const newQuantity = Math.min(existing.quantity + quantity, cartProduct.stock)
        return prev.map((item) =>
          cartItemKey(item.product) === key
            ? { ...item, quantity: newQuantity } 
            : item,
        )
      }
      return [...prev, { product: cartProduct, quantity: Math.min(quantity, cartProduct.stock) }]
    })
    
    // Queue mutation for sync
    try {
      const mutationData = {
        productId: cartProduct.product_id,
        quantity: Math.min(quantity, cartProduct.stock)
      }
      queueMutation('add_to_cart', mutationData).catch(error => {
        console.warn('Failed to queue add_to_cart mutation:', error.message)
      })
    } catch (error) {
      console.warn('Could not queue mutation:', error)
    }
    
    toast.success(`${getProductDisplayName(cartProduct.product_name)} added to cart`)
  }, [])

  const removeItem = useCallback((productId: number, variantId?: number) => {
    setItems((prev) => prev.filter((item) => !matchesCartItem(item.product, productId, variantId)))
    
    // Queue mutation for sync
    try {
      const mutationData = {
        productId,
        variantId,
      }
      queueMutation('remove_from_cart', mutationData).catch(error => {
        console.warn('Failed to queue remove_from_cart mutation:', error.message)
      })
    } catch (error) {
      console.warn('Could not queue mutation:', error)
    }
  }, [])

  const updateQuantity = useCallback((productId: number, quantity: number, variantId?: number) => {
    if (quantity <= 0) {
      removeItem(productId, variantId)
      return
    }
    setItems((prev) => prev.map((item) => {
      if (matchesCartItem(item.product, productId, variantId)) {
        // Don't exceed stock
        const newQuantity = Math.min(quantity, item.product.stock)
        return { ...item, quantity: newQuantity }
      }
      return item
    }))
    
    // Queue mutation for sync
    try {
      const mutationData = {
        productId,
        variantId,
        quantity
      }
      queueMutation('update_quantity', mutationData).catch(error => {
        console.warn('Failed to queue update_quantity mutation:', error.message)
      })
    } catch (error) {
      console.warn('Could not queue mutation:', error)
    }
  }, [removeItem])

  const clearCart = useCallback(() => {
    setItems([])
    setAppliedPromo(null)
  }, [])

  const getItemQuantity = useCallback((productId: number, variantId?: number) => {
    const item = items.find((i) => matchesCartItem(i.product, productId, variantId))
    return item?.quantity || 0
  }, [items])

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalPrice = items.reduce((sum, item) => {
    const price = item.product.sale_price || item.product.current_price
    return sum + price * item.quantity
  }, 0)

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems,
        totalPrice,
        getItemQuantity,
        appliedPromo,
        setAppliedPromo,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error("useCart must be used within a CartProvider")
  }
  return context
}
