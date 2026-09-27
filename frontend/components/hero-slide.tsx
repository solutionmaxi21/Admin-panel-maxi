"use client"

import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { useState } from "react"

export interface HeroSlideData {
  id: string
  image: string
  headline: string | { fr?: string; ar?: string }
  subtitle: string | { fr?: string; ar?: string }
  primaryCta?: {
    text: string | { fr?: string; ar?: string }
    href: string
    icon?: React.ReactNode
  }
  secondaryCta?: {
    text: string | { fr?: string; ar?: string }
    href: string
    icon?: React.ReactNode
  }
}

interface HeroSlideProps {
  slide: HeroSlideData
  isActive: boolean
  language: string
  isRtl: boolean
}

// Helper to get localized text
const getLocalizedText = (
  value: string | { fr?: string; ar?: string } | undefined,
  locale: string = "fr"
): string => {
  if (!value) return ""
  if (typeof value === "string") return value
  return (locale === "ar" ? value.ar || value.fr : value.fr || value.ar) || ""
}

export function HeroSlide({ slide, isActive, language, isRtl }: HeroSlideProps) {
  const [imageError, setImageError] = useState(false)

  const headline = getLocalizedText(slide.headline, language)
  const subtitle = getLocalizedText(slide.subtitle, language)
  const primaryCtaText = getLocalizedText(slide.primaryCta?.text, language)
  const secondaryCtaText = getLocalizedText(slide.secondaryCta?.text, language)

  return (
    <div
      className={`absolute inset-0 transition-opacity duration-800 ${isActive ? "opacity-100 z-10" : "opacity-0 z-0"
        }`}
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Background Image */}
      <div className="absolute inset-0">
        <Image
          src={imageError ? "/placeholder.svg" : slide.image}
          alt={headline}
          fill
          sizes="100vw"
          className="object-cover object-center"
          priority={isActive}
          quality={95}
          onError={() => setImageError(true)}
        />
        {/* Darker gradient overlay for significantly better text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/30 dark:from-black/90 dark:via-black/60 dark:to-black/40" />
        <div className="absolute inset-0 bg-black/10" /> {/* Subtle overall darkening */}
      </div>

      {/* Content Container - Centered */}
      <div className="relative h-full flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl w-full space-y-5 lg:space-y-6 text-center">
          {/* Headline */}
          <h1
            className={`text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold leading-[1.15] tracking-tight text-white drop-shadow-2xl transition-all duration-700 ${isActive ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
              }`}
            style={{ transitionDelay: isActive ? "200ms" : "0ms" }}
          >
            {headline}
          </h1>

          {/* Subtitle */}
          {subtitle && (
            <p
              className={`text-sm sm:text-base lg:text-lg text-white/95 max-w-2xl mx-auto leading-relaxed drop-shadow-lg transition-all duration-700 ${isActive ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
                }`}
              style={{ transitionDelay: isActive ? "400ms" : "0ms" }}
            >
              {subtitle}
            </p>
          )}

          {/* CTA Buttons */}
          {(slide.primaryCta || slide.secondaryCta) && (
            <div
              className={`flex flex-col sm:flex-row gap-4 justify-center transition-all duration-700 ${isActive ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
                }`}
              style={{ transitionDelay: isActive ? "600ms" : "0ms" }}
            >
              {slide.primaryCta && (
                <Link href={slide.primaryCta.href} className="group">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto h-14 px-8 bg-gradient-to-r from-[#1e3d9d] to-[#2d4fb3] hover:from-[#2d4fb3] hover:to-[#3d5fc3] text-white rounded-xl font-semibold text-base shadow-lg shadow-[#1e3d9d]/25 hover:shadow-xl hover:shadow-[#1e3d9d]/40 transition-all duration-300 hover:scale-105 border-0"
                  >
                    {slide.primaryCta.icon}
                    {primaryCtaText}
                    <ArrowRight
                      className={`h-5 w-5 transition-transform group-hover:${isRtl ? "-translate-x-1 rotate-180" : "translate-x-1"
                        } ${isRtl ? "mr-2 rotate-180" : "ml-2"}`}
                      aria-hidden="true"
                    />
                  </Button>
                </Link>
              )}

              {slide.secondaryCta && (
                <Link href={slide.secondaryCta.href}>
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full sm:w-auto h-14 px-8 border-2 border-white/80 text-white hover:bg-white hover:text-[#1e3d9d] rounded-xl font-semibold text-base transition-all duration-300 hover:scale-105 bg-transparent backdrop-blur-sm"
                  >
                    {slide.secondaryCta.icon}
                    {secondaryCtaText}
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
