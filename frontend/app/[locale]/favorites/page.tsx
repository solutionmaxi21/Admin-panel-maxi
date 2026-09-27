"use client"

import { useEffect, useState } from "react"
import { useWishlist } from "@/lib/wishlist-context"
import { useAuth } from "@/lib/auth-context"
import { productsApi, type Product } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ProductCard } from "@/components/product-card"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import Link from "next/link"
import { Heart, ShoppingCart, Trash2 } from "lucide-react"
import { translations as t } from "@/lib/translations"

export default function FavoritesPage() {
  const { items, removeFromWishlist, showClearDialog, itemCount } = useWishlist()
  const { user, isLoading: authLoading } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    loadWishlistProducts()
  }, [items, authLoading])

  const loadWishlistProducts = async () => {
    if (items.length === 0) {
      setProducts([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      // Fetch all products and filter by wishlist IDs
      const result = await productsApi.getAll({})
      if (result.data) {
        const wishlistIds = items.map((item) => item.productId)
        const wishlistProducts = result.data.products.filter((product) =>
          wishlistIds.includes(product.product_id)
        )
        setProducts(wishlistProducts)
      }
    } catch (error) {
      console.error("Failed to load wishlist products:", error)
    } finally {
      setIsLoading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          <div className="container mx-auto px-4 py-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-48 w-full mb-4" />
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-4 w-3/4" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          <div className="container mx-auto px-4 py-8">
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <Heart className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
                  <h2 className="text-2xl font-bold mb-2">Veuillez Vous Connecter</h2>
                  <p className="text-muted-foreground mb-6">
                    Vous devez être connecté pour voir votre liste de souhaits.
                  </p>
                  <Link href="/login">
                    <Button>Aller à la Connexion</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
                  <Heart className="h-8 w-8 text-red-500 fill-red-500" />
                  Ma Liste de Souhaits
                </h1>
                <p className="text-muted-foreground">
                  {itemCount} {itemCount === 1 ? "article" : "articles"} sauvegardé{itemCount > 1 ? "s" : ""}
                </p>
              </div>
              {itemCount > 0 && (
                <Button variant="outline" onClick={showClearDialog}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Tout Vider
                </Button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-48 w-full mb-4" />
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-4 w-3/4" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : itemCount === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <Heart className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
                  <h2 className="text-2xl font-bold mb-2">Votre Liste de Souhaits est Vide</h2>
                  <p className="text-muted-foreground mb-6">
                    Enregistrez vos articles préférés dans votre liste de souhaits pour les retrouver facilement!
                  </p>
                  <Link href="/store">
                    <Button>
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      Commencer vos Achats
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {products.map((product) => (
                  <ProductCard key={product.product_id} product={product} />
                ))}
              </div>

              {products.length < itemCount && (
                <Card className="mt-6">
                  <CardContent className="py-6">
                    <p className="text-center text-muted-foreground">
                      Certains articles de votre liste de souhaits ne sont plus disponibles
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
