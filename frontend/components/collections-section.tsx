"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import Container from "@/components/ui/container"
import { CollectionCard } from "@/components/collection-card"
import { collectionsApi, type Collection } from "@/lib/api"
import { useLanguage } from "@/lib/language-context"

export function CollectionsSection() {
  const { t } = useLanguage()
  const [collections, setCollections] = useState<Collection[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchCollections = async () => {
      try {
        const result = await collectionsApi.getAll(true)
        if (result.data) {
          setCollections(result.data.slice(0, 8))
        }
      } catch (error) {
        console.error("Failed to load collections:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchCollections()
  }, [])

  if (!isLoading && collections.length === 0) {
    return null
  }

  return (
    <section className="pt-6 pb-12 md:pt-8 md:pb-16">
      <Container>
        <div className="text-center mb-8 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-2">{t.home.shopByCustomerType}</h2>
          <p className="text-muted-foreground">{t.home.findProductsForYou}</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {collections.map((collection) => (
              <CollectionCard key={collection.collection_id || collection.id} collection={collection} />
            ))}
          </div>
        )}
      </Container>
    </section>
  )
}
