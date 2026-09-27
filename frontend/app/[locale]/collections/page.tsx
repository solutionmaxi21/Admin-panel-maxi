"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import Container from "@/components/ui/container"
import { CollectionCard } from "@/components/collection-card"
import { collectionsApi, type Collection } from "@/lib/api"
import { useLanguage } from "@/lib/language-context"

export default function CollectionsPage() {
  const { language } = useLanguage()
  const [collections, setCollections] = useState<Collection[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const run = async () => {
      try {
        const result = await collectionsApi.getAll(true)
        if (result.data) setCollections(result.data)
      } finally {
        setIsLoading(false)
      }
    }

    run()
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-10 pb-20">
        <Container>
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold">{language === "ar" ? "المجموعات" : "Collections"}</h1>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-14">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {collections.map((collection) => (
                <CollectionCard key={collection.collection_id || collection.id} collection={collection} />
              ))}
            </div>
          )}
        </Container>
      </main>
      <Footer />
    </div>
  )
}
