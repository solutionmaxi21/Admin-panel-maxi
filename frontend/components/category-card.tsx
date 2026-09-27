"use client"

import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { Category } from "@/lib/api"
import { getImageUrl } from "@/lib/utils"
import { useLanguage } from "@/lib/language-context"

// Helper to get localized text from bilingual object or string
const getLocalizedName = (value: string | { fr?: string; ar?: string } | null | undefined, locale: string = 'fr'): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    return (locale === 'ar' ? value.ar || value.fr : value.fr || value.ar) || '';
  }
  return value;
};

interface CategoryCardProps {
  category: Category
  productCount?: number
}

export function CategoryCard({ category, productCount }: CategoryCardProps) {
  const { t, language } = useLanguage()
  const categoryName = getLocalizedName(category.category_name, language);

  return (
    <Link
      href={`/store?category=${category.category_slug}`}
      className="group relative bg-card rounded-lg border border-border overflow-hidden hover:shadow-lg transition-all hover:border-primary"
    >
      <div className="aspect-square bg-muted relative overflow-hidden rounded-lg">
        <Image
          src={
            category.category_image?.startsWith("http")
              ? category.category_image
              : getImageUrl(`categories/${category.category_image}`)
          }
          alt={categoryName}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover group-hover:scale-110 transition-transform duration-300"
        />
      </div>
      <div className="p-4">
        <h3 className="font-semibold group-hover:text-primary transition-colors">{categoryName}</h3>
        {productCount !== undefined && (
          <p className="text-sm text-muted-foreground mt-1">{productCount} {t.category.products}</p>
        )}
        <div className="flex items-center gap-1 text-secondary mt-2 text-sm font-medium">
          <span>{t.home.shopNow}</span>
          <ArrowRight className={`h-4 w-4 transition-transform ${language === 'ar' ? 'rotate-180 group-hover:-translate-x-1' : 'group-hover:translate-x-1'}`} aria-hidden="true" />
        </div>
      </div>
    </Link>
  )
}

