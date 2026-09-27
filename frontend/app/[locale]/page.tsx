"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Truck, Shield, Headphones, CreditCard, Star, Zap, Loader2, Sparkles, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { ProductCard } from "@/components/product-card"
import { CategoryCard } from "@/components/category-card"
import { HeroSection } from "@/components/hero-section"
import { CollectionsSection } from "@/components/collections-section"
import Container from "@/components/ui/container"
import { productsApi, categoriesApi, promotionsApi, type Product, type Category, type Promotion } from "@/lib/api"
import { useLanguage } from "@/lib/language-context"

// Helper to get localized text from bilingual object or string
const getLocalizedName = (value: string | { fr?: string; ar?: string } | null | undefined, locale: string = 'fr'): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    return (locale === 'ar' ? value.ar || value.fr : value.fr || value.ar) || '';
  }
  return value;
};

export default function HomePage() {
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([])
  const [newProducts, setNewProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [trustBrands, setTrustBrands] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { t, language } = useLanguage()
  const isRtl = language === 'ar'

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [featuredResult, newResult, categoriesResult, promotionsResult, brandsResult] = await Promise.all([
          productsApi.getFeatured(),
          productsApi.getNew(),
          categoriesApi.getAll(),
          promotionsApi.getActive(),
          productsApi.getTopBrands(),
        ])



        if (featuredResult.data) {
          setFeaturedProducts(featuredResult.data.slice(0, 8))
        }

        if (newResult.data) {
          setNewProducts(newResult.data.slice(0, 4))
        }

        if (categoriesResult.data) {
          setCategories(categoriesResult.data)
        }

        if (promotionsResult.data) {
          setPromotions(promotionsResult.data)
        }

        if (brandsResult.data && brandsResult.data.length > 0) {
          setTrustBrands(brandsResult.data)
        } else {
          // Fallback if DB is empty: Keep static list so UI doesn't look broken
          setTrustBrands(["AMD", "Intel", "NVIDIA", "ASUS", "Corsair", "Samsung", "Logitech", "MSI"])
        }

      } catch (error) {
        console.error("Failed to fetch homepage data:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero Section Slideshow */}
        <HeroSection />

        <CollectionsSection />

        {/* Features */}
        <section className="py-8 bg-muted/50 border-y border-border">
          <Container>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                  <Truck className="h-6 w-6 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{t.home.freeShipping}</p>
                  <p className="text-xs text-muted-foreground">{t.home.freeShippingDesc}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                  <Shield className="h-6 w-6 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{t.home.warranty}</p>
                  <p className="text-xs text-muted-foreground">{t.home.warrantyDesc}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                  <Headphones className="h-6 w-6 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{t.home.support247}</p>
                  <p className="text-xs text-muted-foreground">{t.home.supportDesc}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                  <CreditCard className="h-6 w-6 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{t.home.securePayment}</p>
                  <p className="text-xs text-muted-foreground">{t.home.securePaymentDesc}</p>
                </div>
              </div>
            </div>
          </Container>
        </section>

        {/* Promo Banner */}
        {promotions[0] && (
          <section className="py-8">
            <div className="container mx-auto px-4">
              <div className="relative bg-gradient-to-r from-primary to-primary/80 rounded-2xl overflow-hidden">
                <div className="absolute inset-0 bg-[url('/placeholder.svg?height=400&width=1200')] opacity-10" />
                <div className="relative p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="text-primary-foreground text-center md:text-left">
                    <div className="flex items-center gap-2 justify-center md:justify-start mb-2">
                      <Zap className="h-5 w-5 text-secondary" aria-hidden="true" />
                      <span className="text-secondary font-semibold">{t.home.limitedTimeOffer}</span>
                    </div>
                    <h2 className="text-2xl md:text-3xl font-bold">{getLocalizedName(promotions[0].promotion_name, language)}</h2>
                    <p className="text-primary-foreground/80 mt-2">
                      {promotions[0].discount_type === 'percentage'
                        ? `${promotions[0].discount_percentage || promotions[0].discount_value}% off`
                        : promotions[0].discount_type === 'fixed'
                          ? `${promotions[0].discount_amount || promotions[0].discount_value} DZD off`
                          : 'Free Shipping'}
                    </p>
                    <p className="mt-2 font-mono bg-primary-foreground/10 inline-block px-3 py-1 rounded">
                      {t.home.code}: <span className="font-bold">{promotions[0].coupon_code || promotions[0].promotion_code}</span>
                    </p>
                  </div>
                  <Link href="/deals">
                    <Button size="lg" className="bg-secondary hover:bg-secondary/90 text-secondary-foreground shrink-0">
                      {t.home.shopDeals}
                      <ArrowRight className="ml-2 h-5 w-5 rtl:rotate-180" aria-hidden="true" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Categories */}
        <section className="py-12 md:py-16">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold">{t.home.shopByCategory}</h2>
                <p className="text-muted-foreground mt-1">{t.home.findWhatYouNeed}</p>
              </div>
              <Link href="/store">
                <Button variant="outline" className="hidden sm:flex bg-transparent">
                  {t.home.viewAll}
                  <ArrowRight className="ml-2 h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                </Button>
              </Link>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                {categories.filter((c) => c.parent_category_id === null).slice(0, 8).map((category) => (
                  <CategoryCard key={category.category_id} category={category} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Featured Products */}
        <section className="py-12 md:py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between mb-8">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Star className="h-5 w-5 text-secondary fill-secondary" aria-hidden="true" />
                  <span className="text-secondary font-semibold">{t.home.featured}</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold">{t.home.bestSellers}</h2>
                <p className="text-muted-foreground mt-1">{t.home.mostPopular}</p>
              </div>
              <Link href="/store">
                <Button variant="outline" className="hidden sm:flex bg-transparent">
                  {t.home.viewAll}
                  <ArrowRight className="ml-2 h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                </Button>
              </Link>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {featuredProducts.slice(0, 8).map((product) => (
                  <ProductCard key={product.product_id} product={product} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* New Arrivals */}
        {newProducts.length > 0 && (
          <section className="py-12 md:py-16">
            <div className="container mx-auto px-4">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <span className="inline-block bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-medium mb-2">
                    {t.home.justIn}
                  </span>
                  <h2 className="text-2xl md:text-3xl font-bold">{t.home.newArrivalsTitle}</h2>
                  <p className="text-muted-foreground mt-1">{t.home.latestProducts}</p>
                </div>
                <Link href="/store?filter=new">
                  <Button variant="outline" className="hidden sm:flex bg-transparent">
                    {t.home.viewAll}
                    <ArrowRight className="ml-2 h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                  </Button>
                </Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {newProducts.map((product) => (
                  <ProductCard key={product.product_id} product={product} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Newsletter */}
        <section className="py-6 md:py-8 bg-primary">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center text-primary-foreground">
              <h2 className="text-2xl md:text-3xl font-bold">{t.home.stayUpdated}</h2>
              <p className="text-primary-foreground/80 mt-2">
                {t.home.newsletterDesc}
              </p>
              <form className="flex flex-col sm:flex-row gap-3 mt-6 max-w-md mx-auto">
                <input
                  type="email"
                  placeholder={t.home.enterEmail}
                  className="flex-1 px-4 h-11 rounded-lg bg-primary-foreground text-foreground placeholder:text-muted-foreground"
                />
                <Button className="bg-secondary hover:bg-secondary/90 text-secondary-foreground px-6 h-11">{t.home.subscribe}</Button>
              </form>
            </div>
          </div>
        </section>

        {/* Trust badges */}
        <section className="py-8 border-t border-border">
          <div className="container mx-auto px-4">
            <div className="text-center mb-6">
              <h3 className="text-lg font-semibold text-muted-foreground">{t.home.trustedBrands}</h3>
            </div>
            {/* Dynamic Brand List */}
            <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12 opacity-60">
              {trustBrands.map((brand) => (
                <Link
                  key={brand}
                  href={`/store?search=${encodeURIComponent(brand)}`} // Click to filter by this brand
                  className="hover:opacity-100 hover:text-primary transition-all duration-300"
                >
                  <div className="text-xl md:text-2xl font-bold text-muted-foreground hover:text-primary">
                    {brand}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
