"use client"

import Image from "next/image"
import Link from "next/link"
import { Heart, ShoppingCart, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useCart } from "@/lib/cart-context"
import { useWishlist } from "@/lib/wishlist-context"
import { formatPrice, calculateDiscount, getImageUrl } from "@/lib/utils"
import type { Product } from "@/lib/api"
import { useLanguage } from "@/lib/language-context"

interface ProductCardProps {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCart()
  const { isInWishlist, toggleWishlist } = useWishlist()
  const { t, language } = useLanguage()

  const discount = product.sale_price
    ? calculateDiscount(product.current_price, product.sale_price)
    : 0

  const effectivePrice = product.sale_price || product.current_price
  const imageUrl = product.images?.[0]?.image_url || '/placeholder.svg'
  const stock = product.total_stock || 0
  const isNew = product.created_at
    ? (Date.now() - new Date(product.created_at).getTime()) < 30 * 24 * 60 * 60 * 1000 // 30 days
    : false

  // Helper to get localized text
  const getLocalizedName = (value: string | { fr?: string; ar?: string } | null | undefined, locale: string = 'fr'): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      return (locale === 'ar' ? value.ar || value.fr : value.fr || value.ar) || '';
    }
    return value;
  };

  const displayName = getLocalizedName(product.product_name, language)
  // Get locale from language (fr or ar)
  const locale = language === 'ar' ? 'ar' : 'fr'

  return (
    <div className="group bg-card rounded-lg border border-border overflow-hidden hover:shadow-lg transition-shadow">
      <div className="relative aspect-square bg-muted">
        <Link href={`/${locale}/product/${product.product_id}`}>
          <Image
            src={getImageUrl(imageUrl)}
            alt={displayName}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-contain p-4 group-hover:scale-105 transition-transform duration-300"
          />
        </Link>

        {/* Badges */}
        <div className={`absolute top-2 flex flex-col gap-1 ${language === 'ar' ? 'right-2' : 'left-2'}`}>
          {isNew && <Badge className="bg-primary text-primary-foreground">{t.product.new}</Badge>}
          {discount > 0 && <Badge className="bg-secondary text-secondary-foreground">-{discount}%</Badge>}
        </div>
        {/* Quick actions */}
        <div className={`absolute top-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity ${language === 'ar' ? 'left-2' : 'right-2'}`}>
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8"
            onClick={() => toggleWishlist(product.product_id)}
          >
            <Heart
              className={`h-4 w-4 ${isInWishlist(product.product_id) ? 'fill-red-500 text-red-500' : ''}`}
              aria-hidden="true"
            />
          </Button>
        </div>
      </div>

      <div className="p-4">
        <p className="text-xs text-muted-foreground mb-1">{product.brand}</p>
        <Link href={`/${locale}/product/${product.product_id}`}>
          <h3 className="font-medium text-sm line-clamp-2 hover:text-primary transition-colors min-h-[2.5rem]">
            {displayName}
          </h3>
        </Link>

        {/* Rating */}
        <div className="flex items-center gap-1 mt-2">
          <Star className="h-4 w-4 fill-secondary text-secondary" aria-hidden="true" />
          <span className="text-sm font-medium">{product.average_rating?.toFixed(1) || '0.0'}</span>
          <span className="text-xs text-muted-foreground">({product.review_count || 0})</span>
        </div>

        {/* Price */}
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-lg font-bold text-primary">{formatPrice(effectivePrice)}</span>
          {product.sale_price && (
            <span className="text-sm text-muted-foreground line-through">{formatPrice(product.current_price)}</span>
          )}
        </div>

        {/* Stock */}
        <p className={`text-xs mt-1 ${stock > 0 ? "text-green-600" : "text-destructive"}`}>
          {stock > 0 ? (language === 'ar' ? `${stock} ${t.product.inStock}` : `${stock} ${t.product.inStock}`) : t.product.outOfStock}
        </p>

        {/* Add to cart */}
        <Button
          className="w-full mt-3 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
          onClick={() => addItem(product)}
          disabled={stock === 0}
        >
          <ShoppingCart className={`h-4 w-4 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} aria-hidden="true" />
          {t.product.addToCart}
        </Button>
      </div>
    </div>
  )
}
