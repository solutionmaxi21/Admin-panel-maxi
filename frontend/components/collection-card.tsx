"use client"

import Link from "next/link"
import { ArrowRight, GraduationCap, Building2, Gamepad2, Briefcase, Home, Palette, FolderOpen } from "lucide-react"
import type { Collection } from "@/lib/api"
import { useLanguage } from "@/lib/language-context"

const COLLECTION_ICONS = {
  GraduationCap,
  Building2,
  Gamepad2,
  Briefcase,
  Home,
  Palette,
} as const

const getLocalizedText = (value: string | { fr?: string; ar?: string } | null | undefined, locale: string = "fr"): string => {
  if (!value) return ""
  if (typeof value === "object") {
    return (locale === "ar" ? value.ar || value.fr : value.fr || value.ar) || ""
  }
  return value
}

interface CollectionCardProps {
  collection: Collection
}

export function CollectionCard({ collection }: CollectionCardProps) {
  const { language } = useLanguage()
  const isRtl = language === "ar"
  const IconComponent = (collection.icon && COLLECTION_ICONS[collection.icon as keyof typeof COLLECTION_ICONS]) || FolderOpen

  const name = getLocalizedText(collection.collection_name, language)
  const description = getLocalizedText(collection.description || null, language)
  const gradient = collection.gradient || "from-primary to-secondary"

  return (
    <Link
      href={`/${language}/collections/${collection.collection_slug}`}
      className="group relative block h-full"
      aria-label={name}
    >
      <div className="relative h-full min-h-[210px] bg-card rounded-2xl p-6 border border-border transition-all duration-300 hover:shadow-xl hover:border-primary overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} aria-hidden="true" />

        <div className="relative z-10 flex flex-col items-center text-center space-y-4 h-full">
          <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center transition-transform duration-300 group-hover:scale-110 shadow-lg`}>
            <IconComponent className="h-10 w-10 text-white" aria-hidden="true" />
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <h3 className="font-bold text-lg mb-2">{name}</h3>
            {description && <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>}
          </div>

          <div className="flex items-center gap-1 text-secondary text-sm font-medium">
            <span>{language === "ar" ? "استكشف" : "Explorer"}</span>
            <ArrowRight className={`h-4 w-4 transition-transform ${isRtl ? "rotate-180 group-hover:-translate-x-1" : "group-hover:translate-x-1"}`} aria-hidden="true" />
          </div>
        </div>
      </div>
    </Link>
  )
}
