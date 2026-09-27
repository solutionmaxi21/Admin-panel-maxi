"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { ProductCard } from "@/components/product-card"
import { CollectionCard } from "@/components/collection-card"
import Container from "@/components/ui/container"
import { collectionsApi, type Collection, type Product } from "@/lib/api"
import { useLanguage } from "@/lib/language-context"
import { getImageUrl } from "@/lib/utils"

const getLocalizedText = (value: string | { fr?: string; ar?: string } | null | undefined, locale: string = "fr"): string => {
  if (!value) return ""
  if (typeof value === "object") {
    return (locale === "ar" ? value.ar || value.fr : value.fr || value.ar) || ""
  }
  return value
}

export default function CollectionDetailsPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug
  const { language } = useLanguage()

  const [collection, setCollection] = useState<Collection | null>(null)
  const [children, setChildren] = useState<Collection[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!slug) return

    const run = async () => {
      try {
        const result = await collectionsApi.getBySlug(slug, { page: 1, limit: 24 })
        if (result.data) {
          setCollection(result.data.collection)
          setChildren(result.data.children || [])
          setProducts(result.data.products || [])
        }
      } finally {
        setIsLoading(false)
      }
    }

    run()
  }, [slug])

  const benefits = useMemo(() => {
    if (!collection?.benefits) return [] as string[]

    if (Array.isArray(collection.benefits)) {
      return collection.benefits
    }

    return language === "ar"
      ? (collection.benefits.ar || collection.benefits.fr || [])
      : (collection.benefits.fr || collection.benefits.ar || [])
  }, [collection, language])

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

  if (!collection) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center text-center px-4">
          <div>
            <h1 className="text-2xl font-bold mb-2">{language === "ar" ? "المجموعة غير موجودة" : "Collection not found"}</h1>
            <Link href={`/${language}/collections`} className="text-primary hover:underline">
              {language === "ar" ? "العودة إلى المجموعات" : "Back to collections"}
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 pb-20">
        <section className="relative min-h-[260px] md:min-h-[320px] overflow-hidden bg-muted">
          {collection.banner_image ? (
            <img src={getImageUrl(collection.banner_image)} alt={getLocalizedText(collection.collection_name, language)} className="absolute inset-0 w-full h-full object-cover" />
          ) : null}
          <div className="absolute inset-0 bg-black/45" />
          <Container>
            <div className="relative z-10 py-16 text-white max-w-2xl">
              <h1 className="text-3xl md:text-4xl font-bold mb-3">{getLocalizedText(collection.collection_name, language)}</h1>
              {collection.tagline && <p className="text-white/90 mb-2">{getLocalizedText(collection.tagline, language)}</p>}
              {collection.description && <p className="text-white/80">{getLocalizedText(collection.description, language)}</p>}
            </div>
          </Container>
        </section>

        {benefits.length > 0 && (
          <section className="py-8 border-b border-border">
            <Container>
              <ul className="grid md:grid-cols-2 gap-3">
                {benefits.map((benefit, index) => (
                  <li key={`${benefit}-${index}`} className="text-sm text-muted-foreground">• {benefit}</li>
                ))}
              </ul>
            </Container>
          </section>
        )}

        {children.length > 0 && (
          <section className="pt-8 pb-10">
            <Container>
              <h2 className="text-2xl font-bold mb-6">{language === "ar" ? "مجموعات فرعية" : "Sub-collections"}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {children.map((child) => (
                  <CollectionCard key={child.collection_id || child.id} collection={child} />
                ))}
              </div>
            </Container>
          </section>
        )}

        <section className="pt-8 pb-10 bg-muted/30">
          <Container>
            <h2 className="text-2xl font-bold mb-6">{language === "ar" ? "منتجات المجموعة" : "Collection Products"}</h2>
            {products.length === 0 ? (
              <p className="text-muted-foreground">{language === "ar" ? "لا توجد منتجات حالياً" : "No products in this collection yet"}</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {products.map((product) => (
                  <ProductCard key={product.product_id} product={product} />
                ))}
              </div>
            )}
          </Container>
        </section>
      </main>
      <Footer />
    </div>
  )
}
