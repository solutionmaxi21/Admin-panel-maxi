"use client"

import { useState, useEffect, use } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ShoppingCart,
  Heart,
  Share2,
  Star,
  Truck,
  Shield,
  RotateCcw,
  Minus,
  Plus,
  Check,
  ChevronRight,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { ProductCard } from "@/components/product-card"
import { ReviewForm } from "@/components/review-form"
import { useCart } from "@/lib/cart-context"
import { useWishlist } from "@/lib/wishlist-context"
import { useAuth } from "@/lib/auth-context"
import { productsApi, categoriesApi, reviewsApi, type Product, type ProductVariant, type Category, type Review } from "@/lib/api"
import type { CartProduct } from "@/lib/cart-context"
import { formatPrice, calculateDiscount, getImageUrl } from "@/lib/utils"
import { toast } from "sonner"
import { useLanguage } from "@/lib/language-context"
import { ImageZoomModal, ZoomableImage } from "@/components/ui/image-zoom-modal"
import { shareProduct } from "@/lib/share-utils"

// Helper to get localized text from bilingual object or string
const getLocalizedName = (value: string | { fr?: string; ar?: string } | null | undefined, locale: string = 'fr'): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    return (locale === 'ar' ? value.ar || value.fr : value.fr || value.ar) || '';
  }
  return value;
};

export default function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [quantity, setQuantity] = useState(1)
  const [selectedImage, setSelectedImage] = useState(0)
  const [isZoomOpen, setIsZoomOpen] = useState(false)
  const [product, setProduct] = useState<Product | null>(null)
  const [category, setCategory] = useState<Category | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("description")
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
  const [showStickyBar, setShowStickyBar] = useState(false)
  const [shouldAutoOpenReview, setShouldAutoOpenReview] = useState(false)
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null)
  const { addItem } = useCart()
  const { isInWishlist, toggleWishlist } = useWishlist()
  const { user } = useAuth()
  const { t, language } = useLanguage()
  const router = useRouter()

  // Check for openReview URL parameter
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('openReview') === 'true') {
        setShouldAutoOpenReview(true)
        setActiveTab('reviews')
        // Clean up URL
        const newUrl = window.location.pathname
        window.history.replaceState({}, '', newUrl)
      }
    }
  }, [])

  // Detect scroll for sticky bar
  useEffect(() => {
    const handleScroll = () => {
      const productSection = document.getElementById('product-actions')
      if (productSection) {
        const rect = productSection.getBoundingClientRect()
        setShowStickyBar(rect.bottom < 0)
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Check URL for tab parameter
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const tabParam = urlParams.get('tab')
      if (tabParam === 'reviews') {
        setActiveTab('reviews')
      }
    }
  }, [])

  useEffect(() => {
    const fetchProduct = async () => {
      setIsLoading(true)
      try {
        const productId = parseInt(slug)
        const productResult = await productsApi.getById(productId)

        if (productResult.data) {
          setProduct(productResult.data)

          // Auto-select default variant
          const variants = productResult.data.variants
          if (variants && variants.length > 0) {
            const defaultVariant = variants.find(v => v.is_default) || variants[0]
            setSelectedVariant(defaultVariant)
          }

          if (productResult.data.category_id) {
            const categoryResult = await categoriesApi.getById(productResult.data.category_id)
            if (categoryResult.data) {
              setCategory(categoryResult.data)
            }
          }

          const reviewsResult = await reviewsApi.getByProductId(productId)
          if (reviewsResult.data?.reviews) {
            setReviews(reviewsResult.data.reviews)
          }

          const relatedResult = await productsApi.getAll({ limit: 4 })
          if (relatedResult.data?.products) {
            setRelatedProducts(
              relatedResult.data.products.filter(p => p.product_id !== productId).slice(0, 4)
            )
          }
        }
      } catch (error) {
        console.error("Failed to fetch product:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchProduct()
  }, [slug])

  const handleShare = async () => {
    if (!product) return

    const result = await shareProduct({
      productName: getLocalizedName(product.product_name, language),
      productId: product.product_id,
      price: product.sale_price || product.current_price,
      imageUrl: product.images?.[0]?.image_url,
    })

    if (result.success) {
      toast.success(result.message)
    } else {
      toast.error(result.message)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">{t.productPage.notFound}</h1>
            <p className="text-muted-foreground mb-4">{t.productPage.notFoundMsg}</p>
            <Link href="/store">
              <Button>{t.productPage.browse}</Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  // Use selected variant pricing/stock when available
  const variants = product.variants || []
  const hasMultipleVariants = variants.length > 1
  const activeVariant = selectedVariant
  const variantPrice = activeVariant?.current_price ?? product.current_price
  const variantSalePrice = activeVariant?.sale_price ?? product.sale_price
  const stock = activeVariant?.total_stock ?? product.total_stock ?? 0
  const effectivePrice = variantSalePrice || variantPrice
  const discount = variantSalePrice ? calculateDiscount(variantPrice, variantSalePrice) : 0
  const images = product.images || []
  const primaryImage = images[selectedImage]?.image_url || '/placeholder.svg'
  const isNew = product.created_at
    ? (Date.now() - new Date(product.created_at).getTime()) < 30 * 24 * 60 * 60 * 1000
    : false
  const isLowStock = stock > 0 && stock <= 5
  const verifiedPurchaseCount = reviews.filter(r => r.user).length

  const warrantyMonths = (product as any).warranty_months as number | null | undefined
  const hasWarrantyMonths = typeof warrantyMonths === 'number' && warrantyMonths > 0
  const warrantyDescription = hasWarrantyMonths
    ? language === 'ar'
      ? `${warrantyMonths} شهر ضمان من المصنع`
      : `${warrantyMonths} mois de garantie constructeur`
    : t.productPage.features.warrantyDesc

  const buildCartProduct = (): CartProduct => ({
    product_id: product.product_id,
    variant_id: activeVariant?.id,
    variant_name: hasMultipleVariants ? activeVariant?.variant_name : undefined,
    product_name: product.product_name,
    brand: product.brand,
    current_price: variantPrice,
    sale_price: variantSalePrice,
    image_url: images[0]?.image_url || '/placeholder.svg',
    stock,
    weight: (product as any).weight,
    length: (product as any).length,
    width: (product as any).width,
    height: (product as any).height,
  })

  const handleAddToCart = () => {
    addItem(buildCartProduct(), quantity)
  }

  const handleBuyNow = () => {
    addItem(buildCartProduct(), quantity)
    router.push(`/${language}/cart`)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {isZoomOpen && (
        <ImageZoomModal
          images={images}
          selectedIndex={selectedImage}
          onClose={() => setIsZoomOpen(false)}
          onNavigate={setSelectedImage}
          productName={getLocalizedName(product.product_name, language)}
        />
      )}

      {/* Sticky Mobile Add to Cart Bar */}
      <div
        className={`fixed bottom-0 left-0 right-0 bg-background border-t border-border z-40 transition-transform duration-300 lg:hidden ${showStickyBar ? 'translate-y-0' : 'translate-y-full'
          }`}
      >
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex-1">
            <p className="font-bold text-lg text-primary">{formatPrice(effectivePrice)}</p>
            {variantSalePrice && (
              <p className="text-xs text-muted-foreground line-through">
                {formatPrice(variantPrice)}
              </p>
            )}
          </div>
          <Button
            size="lg"
            className="bg-secondary hover:bg-secondary/90 text-secondary-foreground px-8"
            onClick={handleAddToCart}
            disabled={stock === 0}
          >
            <ShoppingCart className={`h-5 w-5 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
            {t.productPage.addToCart}
          </Button>
        </div>
      </div>

      <main className="flex-1 pb-20 lg:pb-0">
        {/* Breadcrumb */}
        <div className="bg-muted/50 border-b border-border">
          <div className="container mx-auto px-4 py-3">
            <nav className="flex items-center gap-2 text-sm overflow-x-auto">
              <Link href="/" className="text-muted-foreground hover:text-foreground whitespace-nowrap">
                {t.productPage.home}
              </Link>
              <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180 shrink-0" />
              <Link href="/store" className="text-muted-foreground hover:text-foreground whitespace-nowrap">
                {t.productPage.store}
              </Link>
              {category && (
                <>
                  <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180 shrink-0" />
                  <Link
                    href={`/store?category=${category.category_slug}`}
                    className="text-muted-foreground hover:text-foreground whitespace-nowrap"
                  >
                    {getLocalizedName(category.category_name, language)}
                  </Link>
                </>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180 shrink-0" />
              <span className="text-foreground font-medium truncate">{getLocalizedName(product.product_name, language)}</span>
            </nav>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8 lg:py-12">
          {/* Product Details */}
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-16">
            {/* Images Section */}
            <div className="space-y-4">
              <ZoomableImage
                src={getImageUrl(primaryImage)}
                alt={getLocalizedName(product.product_name, language)}
                onClick={() => setIsZoomOpen(true)}
              >
                <div className={`absolute top-4 ${language === 'ar' ? 'right-4' : 'left-4'} flex flex-col gap-2 z-10`}>
                  {isNew && (
                    <Badge className="bg-primary text-primary-foreground">
                      {t.productPage.new}
                    </Badge>
                  )}
                  {discount > 0 && (
                    <Badge className="bg-secondary text-secondary-foreground">
                      -{discount}%
                    </Badge>
                  )}
                </div>
              </ZoomableImage>

              {images.length > 1 && (
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                  {images.map((image, index) => (
                    <button
                      key={index}
                      className={`w-20 h-20 rounded-lg border-2 overflow-hidden shrink-0 transition-all hover:border-primary/50 relative bg-muted ${selectedImage === index ? "border-primary ring-2 ring-primary/20" : "border-border"
                        }`}
                      onClick={() => setSelectedImage(index)}
                    >
                      <Image
                        src={getImageUrl(image.image_url)}
                        alt={`${getLocalizedName(product.product_name, language)} - ${index + 1}`}
                        width={80}
                        height={80}
                        className="object-contain p-2"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Info Section */}
            <div className="space-y-6">
              {/* Brand & Title */}
              <div className="space-y-3">
                {product.brand && (
                  <p className="text-sm text-primary font-semibold uppercase tracking-wide">{product.brand}</p>
                )}
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight">
                  {getLocalizedName(product.product_name, language)}
                </h1>
              </div>

              {/* Rating & Reviews */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`h-5 w-5 ${i < Math.floor(product.average_rating || 0)
                        ? "fill-secondary text-secondary"
                        : "fill-muted text-muted"
                        }`}
                    />
                  ))}
                </div>
                <span className="text-base font-semibold">{product.average_rating?.toFixed(1) || "0.0"}</span>
                <button
                  onClick={() => setActiveTab("reviews")}
                  className="text-sm text-muted-foreground hover:text-primary underline underline-offset-2"
                >
                  ({reviews.length} {t.productPage.tabs.reviews.toLowerCase()})
                </button>
                {verifiedPurchaseCount > 0 && (
                  <Badge variant="outline" className="text-xs">
                    <Check className="h-3 w-3 mr-1" />
                    {verifiedPurchaseCount} {t.reviewForm.approved.toLowerCase()}
                  </Badge>
                )}
              </div>

              {/* Short Description */}
              {product.short_description && (
                <div className="p-4 bg-muted/50 border-l-4 border-primary rounded-r-lg">
                  <p className="text-muted-foreground leading-relaxed">
                    {getLocalizedName(product.short_description, language)}
                  </p>
                </div>
              )}

              {/* Variant Selector */}
              {hasMultipleVariants && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold">
                    {language === 'ar' ? 'اختر الخيار' : 'Choisir une option'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {variants.map((variant) => (
                      <button
                        key={variant.id}
                        onClick={() => {
                          setSelectedVariant(variant)
                          setQuantity(1)
                        }}
                        className={`px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                          selectedVariant?.id === variant.id
                            ? 'border-primary bg-primary/10 text-primary'
                            : variant.total_stock > 0
                              ? 'border-border hover:border-primary/50 text-foreground'
                              : 'border-border bg-muted text-muted-foreground opacity-60 cursor-not-allowed'
                        }`}
                        disabled={variant.total_stock <= 0}
                      >
                        {variant.variant_name}
                        {variant.total_stock <= 0 && (
                          <span className="ml-1 text-xs">
                            ({language === 'ar' ? 'غير متوفر' : 'Rupture'})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Price */}
              <div className="bg-gradient-to-r from-muted/50 to-muted/30 p-6 rounded-lg border border-border">
                <div className="flex items-baseline gap-4 flex-wrap">
                  <span className="text-4xl md:text-5xl font-bold text-primary">
                    {formatPrice(effectivePrice)}
                  </span>
                  {variantSalePrice && (
                    <span className="text-xl text-muted-foreground line-through">
                      {formatPrice(variantPrice)}
                    </span>
                  )}
                </div>
                {discount > 0 && (
                  <p className="text-base text-secondary font-semibold mt-3">
                    {t.productPage.save} {formatPrice(variantPrice - effectivePrice)} ({discount}% off)
                  </p>
                )}
              </div>

              {/* Stock Status */}
              <div>
                {stock > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-green-600 font-semibold">
                      <Check className="h-5 w-5" />
                      <span>{t.productPage.inStock}</span>
                    </div>
                    {isLowStock && (
                      <div className="flex items-center gap-2 text-orange-600 bg-orange-50 dark:bg-orange-950/20 px-4 py-3 rounded-lg border border-orange-200 dark:border-orange-800">
                        <AlertCircle className="h-5 w-5 shrink-0" />
                        <span className="text-sm font-medium">
                          Seulement {stock} {t.productPage.available} - Commandez vite!
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-destructive bg-destructive/10 px-4 py-3 rounded-lg border border-destructive/20 font-semibold">
                    <AlertCircle className="h-5 w-5" />
                    <span>{t.productPage.outOfStock}</span>
                  </div>
                )}
              </div>

              {/* Quantity & Actions */}
              <div id="product-actions" className="space-y-4">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold min-w-fit">{t.productPage.quantity}:</span>
                  <div className="flex items-center border-2 border-border rounded-lg overflow-hidden">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-12 w-12 hover:bg-muted rounded-none"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-16 text-center font-bold text-lg">{quantity}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-12 w-12 hover:bg-muted rounded-none"
                      onClick={() => setQuantity((q) => Math.min(stock, q + 1))}
                      disabled={quantity >= stock}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    size="lg"
                    className="flex-1 bg-secondary hover:bg-secondary/90 text-secondary-foreground h-14 text-base font-semibold shadow-md hover:shadow-lg transition-shadow"
                    onClick={handleAddToCart}
                    disabled={stock === 0}
                  >
                    <ShoppingCart className={`h-5 w-5 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
                    {t.productPage.addToCart}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="flex-1 h-14 text-base font-semibold border-2 hover:bg-muted shadow-sm"
                    onClick={handleBuyNow}
                    disabled={stock === 0}
                  >
                    {t.productPage.buyNow}
                  </Button>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    size="lg"
                    className="flex-1 h-12 border-2 hover:bg-muted"
                    onClick={() => toggleWishlist(product.product_id)}
                  >
                    <Heart
                      className={`h-5 w-5 ${language === 'ar' ? 'ml-2' : 'mr-2'} ${isInWishlist(product.product_id) ? 'fill-red-500 text-red-500' : ''
                        }`}
                    />
                    <span className="hidden sm:inline">
                      {isInWishlist(product.product_id)
                        ? t.productPage.removeFromWishlist
                        : t.productPage.addToWishlist}
                    </span>
                    <span className="sm:hidden">
                      {isInWishlist(product.product_id) ? 'Retirer' : 'Ajouter'}
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="flex-1 h-12 border-2 hover:bg-muted"
                    onClick={handleShare}
                  >
                    <Share2 className={`h-5 w-5 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
                    {t.productPage.share}
                  </Button>
                </div>
              </div>

              {/* Trust Features */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-border">
                <div className="flex items-start gap-3 p-4 bg-primary/5 rounded-lg transition-all hover:bg-primary/10 hover:shadow-md">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Truck className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-1">{t.productPage.features.delivery}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{t.productPage.features.deliveryDesc}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-primary/5 rounded-lg transition-all hover:bg-primary/10 hover:shadow-md">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Shield className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-1">{t.productPage.features.warranty}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{warrantyDescription}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-primary/5 rounded-lg transition-all hover:bg-primary/10 hover:shadow-md">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <RotateCcw className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-1">{t.productPage.features.returns}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{t.productPage.features.returnsDesc}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Section */}
        <div className="container mx-auto px-4 mt-16">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start border-b border-border rounded-none bg-transparent h-auto p-0 overflow-x-auto flex-nowrap">
              <TabsTrigger
                value="description"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-4 whitespace-nowrap text-base font-medium"
              >
                Description
              </TabsTrigger>
              <TabsTrigger
                value="specs"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-4 whitespace-nowrap text-base font-medium"
              >
                {t.productPage.tabs.specs}
              </TabsTrigger>
              <TabsTrigger
                value="reviews"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-4 whitespace-nowrap text-base font-medium"
              >
                {t.productPage.tabs.reviews} ({reviews.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="description" className="mt-8">
              {(product as any).description || (product as any).full_description || product.short_description ? (
                <div className="prose prose-base max-w-none dark:prose-invert">
                  {/* Wrapper for Quill Snow theme parity */}
                  <div className="ql-snow">
                    <div
                      className={`ql-editor prose prose-sm md:prose-base dark:prose-invert max-w-none
                        ${!isDescriptionExpanded ? 'line-clamp-[10] overflow-hidden relative fade-bottom' : ''}
                      `}
                      dangerouslySetInnerHTML={{
                        __html: getLocalizedName((product as any).description || (product as any).full_description || product.short_description, language)
                      }}
                      style={{
                        '--tw-prose-headings': 'var(--foreground)',
                        '--tw-prose-body': 'var(--muted-foreground)',
                        '--tw-prose-bold': 'var(--foreground)',
                        '--tw-prose-links': 'var(--primary)',
                      } as React.CSSProperties}
                    />
                  </div>
                  {(getLocalizedName((product as any).description || (product as any).full_description || product.short_description, language)?.length || 0) > 500 && (
                    <button
                      onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                      className="flex items-center gap-2 text-primary hover:text-primary/80 font-semibold mt-6 transition-colors"
                    >
                      {isDescriptionExpanded ? (
                        <>
                          {t.common.readLess}
                          <ChevronUp className="h-5 w-5" />
                        </>
                      ) : (
                        <>
                          {t.common.readMore}
                          <ChevronDown className="h-5 w-5" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  {getLocalizedName(product.short_description, language) || "Aucune description disponible"}
                </p>
              )}
            </TabsContent>

            <TabsContent value="specs" className="mt-8">
              {product.attributes && product.attributes.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {product.attributes.map((attr) => (
                    <div
                      key={attr.attribute_id}
                      className="flex justify-between items-center py-4 px-5 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors border border-border"
                    >
                      <span className="text-muted-foreground font-medium">{getLocalizedName(attr.attribute_name, language)}</span>
                      <span className="font-semibold text-foreground">{attr.attribute_value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-muted/30 rounded-lg">
                  <p className="text-muted-foreground">Aucune spécification disponible</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="reviews" className="mt-8 space-y-8">
              <ReviewForm
                productId={product.product_id}
                autoOpen={shouldAutoOpenReview}
                onReviewSubmitted={async () => {
                  const reviewsResult = await reviewsApi.getByProductId(product.product_id)
                  if (reviewsResult.data?.reviews) {
                    setReviews(reviewsResult.data.reviews)
                  }
                  setShouldAutoOpenReview(false)
                }}
              />
              {reviews.length > 0 ? (
                <div className="space-y-6">
                  {reviews.map((review) => (
                    <div
                      key={review.review_id}
                      className="border border-border rounded-lg p-6 hover:border-primary/50 transition-colors bg-card"
                    >
                      <div className="flex items-start gap-4 mb-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                          <span className="font-bold text-primary text-lg">
                            {review.user?.first_name?.charAt(0) || "U"}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                            <p className="font-semibold text-base">
                              {review.user
                                ? `${review.user.first_name} ${review.user.last_name}`
                                : t.productPage.reviews.anonymous}
                            </p>
                            {review.user && (
                              <Badge variant="outline" className="text-xs shrink-0">
                                <Check className="h-3 w-3 mr-1" />
                                {t.reviewForm.approved}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-1">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={`h-4 w-4 ${i < review.rating
                                    ? "fill-secondary text-secondary"
                                    : "fill-muted text-muted"
                                    }`}
                                />
                              ))}
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {review.created_at
                                ? new Date(review.created_at).toLocaleDateString(
                                  language === 'ar' ? 'ar-DZ' : 'fr-FR'
                                )
                                : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className="text-muted-foreground leading-relaxed text-base">
                        {review.review_text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 bg-muted/30 rounded-lg">
                  <Star className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground text-lg font-medium">
                    {t.productPage.reviews.noReviews}
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <section className="container mx-auto px-4 mt-20 mb-12">
            <h2 className="text-2xl md:text-3xl font-bold mb-8">{t.productPage.related}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              {relatedProducts.map((p) => (
                <ProductCard key={p.product_id} product={p} />
              ))}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  )
}