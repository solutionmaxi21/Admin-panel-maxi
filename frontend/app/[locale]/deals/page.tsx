"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { Zap, Clock, ArrowRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { ProductCard } from "@/components/product-card"
import { productsApi, promotionsApi, type Product, type Promotion } from "@/lib/api"
import { useLanguage } from "@/lib/language-context"

// Helper to get localized text from bilingual object or string
const getLocalizedName = (value: string | { fr?: string; ar?: string } | null | undefined, locale: string = 'fr'): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    return (locale === 'ar' ? value.ar || value.fr : value.fr || value.ar) || '';
  }
  return value;
};

export default function DealsPage() {
  const [discountedProducts, setDiscountedProducts] = useState<Product[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { t, language } = useLanguage()

  const localT = {
    fr: {
      limitedOffers: "Offres à Durée Limitée",
      incredibleDeals: "Offres Incroyables sur",
      premiumGear: "Matériel Premium",
      dontMiss: "Ne manquez pas nos meilleurs prix. Stock limité disponible!",
      validUntil: "Valide jusqu'au",
      limitedTime: "À durée limitée",
      off: "OFF",
      noPromos: "Aucune promotion active pour le moment.",
      onSaleNow: "En Promotion Maintenant",
      productsWithSpecials: "produits avec prix spéciaux",
      viewAll: "Voir Tous les Produits",
      noDeals: "Aucune offre disponible pour le moment.",
      checkBack: "Revenez bientôt pour de nouvelles offres!",
      newsletterTitle: "Ne Manquez Jamais une Offre",
      newsletterDesc: "Abonnez-vous à notre newsletter et soyez le premier informé des offres exclusives.",
      emailPlaceholder: "Entrez votre email",
      subscribe: "S'abonner"
    },
    ar: {
      limitedOffers: "عروض لفترة محدودة",
      incredibleDeals: "عروض مذهلة على",
      premiumGear: "معدات متميزة",
      dontMiss: "لا تفوت أفضل أسعارنا. المخزون محدود!",
      validUntil: "ساري حتى",
      limitedTime: "لفترة محدودة",
      off: "خصم",
      noPromos: "لا توجد عروض ترويجية نشطة حالياً.",
      onSaleNow: "تخفيضات الآن",
      productsWithSpecials: "منتجات بأسعار خاصة",
      viewAll: "عرض جميع المنتجات",
      noDeals: "لا توجد عروض متاحة حالياً.",
      checkBack: "عد قريباً للحصول على عروض جديدة!",
      newsletterTitle: "لا تفوت أي عرض",
      newsletterDesc: "اشترك في نشرتنا الإخبارية وكن أول من يعرف عن العروض الحصرية.",
      emailPlaceholder: "أدخل بريدك الإلكتروني",
      subscribe: "اشترك"
    }
  }

  const txt = localT[language === 'ar' ? 'ar' : 'fr']
  const lastFetchRef = useRef(0)

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try {
        // Fetch products and filter those with sale_price
        const [productsResult, promosResult] = await Promise.all([
          productsApi.getAll({}),
          promotionsApi.getActive(),
        ])

        if (productsResult.data?.products) {
          const onSale = productsResult.data.products.filter(
            p => p.sale_price && p.sale_price < p.current_price
          )
          setDiscountedProducts(onSale)
        }

        if (promosResult.data) {
          setPromotions(promosResult.data)
        }
      } catch (error) {
        console.error("Failed to fetch deals:", error)
      } finally {
        setIsLoading(false)
        lastFetchRef.current = Date.now()
      }
    }

    fetchData()

    // Refetch when page becomes visible (e.g. returning from another tab/page)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetchRef.current > 30000) {
        fetchData()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-primary py-12 md:py-16">
          <div className="container mx-auto px-4 text-center text-primary-foreground">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Zap className="h-6 w-6 text-secondary" />
              <span className="text-secondary font-semibold">{txt.limitedOffers}</span>
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-balance">
              {txt.incredibleDeals} <span className="text-secondary">{txt.premiumGear}</span>
            </h1>
            <p className="text-primary-foreground/80 mt-4 max-w-2xl mx-auto">
              {txt.dontMiss}
            </p>
          </div>
        </section>

        {/* Active Promotions */}
        <section className="py-8 bg-muted/50">
          <div className="container mx-auto px-4">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : promotions.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-4">
                {promotions.map((promo, index) => (
                  <div key={promo.promotion_id || promo.id || `promo-${index}`} className="bg-card border border-border rounded-xl p-6 flex items-center gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-secondary mb-2">
                        <Clock className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          {txt.validUntil} {promo.end_date ? new Date(promo.end_date).toLocaleDateString(language === 'ar' ? 'ar-DZ' : 'fr-FR') : txt.limitedTime}
                        </span>
                      </div>
                      <h3 className="text-xl font-bold">{getLocalizedName(promo.promotion_name, language)}</h3>
                      <p className="text-muted-foreground text-sm mt-1">{getLocalizedName(promo.description, language)}</p>
                      {promo.coupon_code && (
                        <div className="mt-3">
                          <code className="bg-primary/10 text-primary px-3 py-1 rounded font-mono text-sm">
                            {promo.coupon_code}
                          </code>
                        </div>
                      )}
                    </div>
                    {promo.discount_percentage && promo.discount_percentage > 0 && (
                      <div className="text-center shrink-0">
                        <div className="text-4xl font-bold text-secondary">{promo.discount_percentage}%</div>
                        <div className="text-sm text-muted-foreground">{txt.off}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">{txt.noPromos}</p>
            )}
          </div>
        </section>

        {/* Discounted Products */}
        <section className="py-12 md:py-16">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold">{txt.onSaleNow}</h2>
                <p className="text-muted-foreground mt-1">{discountedProducts.length} {txt.productsWithSpecials}</p>
              </div>
              <Link href="/store">
                <Button variant="outline">
                  {txt.viewAll}
                  <ArrowRight className={`h-4 w-4 ${language === 'ar' ? 'mr-2 rotate-180' : 'ml-2'}`} />
                </Button>
              </Link>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : discountedProducts.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {discountedProducts.map((product) => (
                  <ProductCard key={product.product_id} product={product} />
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <p className="text-muted-foreground">{txt.noDeals}</p>
                <p className="text-sm text-muted-foreground mt-1">{txt.checkBack}</p>
              </div>
            )}
          </div>
        </section>

        {/* Newsletter CTA */}
        <section className="py-12 bg-secondary/10 border-y border-secondary/20">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-2xl font-bold">{txt.newsletterTitle}</h2>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">
              {txt.newsletterDesc}
            </p>
            <form className="flex flex-col sm:flex-row gap-3 mt-6 max-w-md mx-auto">
              <input
                type="email"
                placeholder={txt.emailPlaceholder}
                className="flex-1 px-4 h-11 rounded-lg border border-border bg-background"
                style={{ direction: 'ltr', textAlign: language === 'ar' ? 'right' : 'left' }}
              />
              <Button className="bg-secondary hover:bg-secondary/90 text-secondary-foreground h-11">{txt.subscribe}</Button>
            </form>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
