"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { ChevronLeft, ChevronRight, ShoppingBag, Zap } from "lucide-react"
import { HeroSlide, type HeroSlideData } from "@/components/hero-slide"
import { useLanguage } from "@/lib/language-context"
import { Button } from "@/components/ui/button"

// Default slides - can be replaced with dynamic data from API
// Default slides - can be replaced with dynamic data from API
const defaultSlides: HeroSlideData[] = [
    {
        id: "slide-1",
        image: "/hero_general_v3.png",
        headline: {
            fr: "Votre Partenaire Matériel Informatique en Algérie",
            ar: "شريكك في الأجهزة الحاسوبية في الجزائر",
        },
        subtitle: {
            fr: "Découvrez notre sélection de composants PC, périphériques et solutions professionnelles. Livraison rapide dans les 58 wilayas avec garantie officielle.",
            ar: "اكتشف مجموعتنا من مكونات الكمبيوتر والأجهزة الطرفية والحلول الاحترافية. توصيل سريع في 58 ولاية مع ضمان رسمي.",
        },
        primaryCta: {
            text: { fr: "Acheter Maintenant", ar: "تسوق الآن" },
            href: "/store",
            icon: <ShoppingBag className="h-5 w-5" aria-hidden="true" />,
        },
        secondaryCta: {
            text: { fr: "Voir les Promotions", ar: "عرض العروض" },
            href: "/deals",
            icon: <Zap className="h-5 w-5" aria-hidden="true" />,
        },
    },
    {
        id: "slide-2",
        image: "/hero_network.png",
        headline: {
            fr: "Solutions Complètes de Réseaux Informatiques",
            ar: "حلول شاملة للشبكات المعلوماتية",
        },
        subtitle: {
            fr: "Architecture réseau, câblage structuré, et équipements de pointe pour votre entreprise. Une connectivité fiable et performante.",
            ar: "هندسة الشبكات، الكابلات الهيكلية، وأحدث المعدات لمؤسستك. اتصالات موثوقة وعالية الأداء.",
        },
        primaryCta: {
            text: { fr: "Solutions Réseaux", ar: "حلول الشبكات" },
            href: "/store?category=networking",
        },
        secondaryCta: {
            text: { fr: "Contactez-nous", ar: "اتصل بنا" },
            href: "/contact",
        },
    },
    {
        id: "slide-3",
        image: "/hero_security.png",
        headline: {
            fr: "Systèmes de Surveillance et Sécurité",
            ar: "أنظمة المراقبة والأمن",
        },
        subtitle: {
            fr: "Protégez vos locaux avec nos solutions de caméras de surveillance (CCTV) et systèmes d'alarme de dernière génération.",
            ar: "احمِ ممتلكاتك باستخدام حلول كاميرات المراقبة (CCTV) وأنظمة الإنذار من الجيل الأحدث.",
        },
        primaryCta: {
            text: { fr: "Voir les Caméras", ar: "عرض الكاميرات" },
            href: "/store?category=security",
        },
    },
]

interface HeroSectionProps {
    slides?: HeroSlideData[]
    autoplayInterval?: number
}

export function HeroSection({
    slides = defaultSlides,
    autoplayInterval = 5000,
}: HeroSectionProps) {
    const [currentSlide, setCurrentSlide] = useState(0)
    const [isAutoPlaying, setIsAutoPlaying] = useState(true)
    const [touchStart, setTouchStart] = useState(0)
    const [touchEnd, setTouchEnd] = useState(0)
    const { language } = useLanguage()
    const isRtl = language === "ar"
    const autoplayRef = useRef<NodeJS.Timeout | null>(null)

    // Navigate to specific slide
    const goToSlide = useCallback((index: number) => {
        setCurrentSlide(index)
    }, [])

    // Navigate to next slide
    const nextSlide = useCallback(() => {
        setCurrentSlide((prev) => (prev + 1) % slides.length)
    }, [slides.length])

    // Navigate to previous slide
    const prevSlide = useCallback(() => {
        setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length)
    }, [slides.length])

    // Autoplay logic
    useEffect(() => {
        if (isAutoPlaying) {
            autoplayRef.current = setInterval(nextSlide, autoplayInterval)
        }

        return () => {
            if (autoplayRef.current) {
                clearInterval(autoplayRef.current)
            }
        }
    }, [isAutoPlaying, nextSlide, autoplayInterval])

    // Pause autoplay on hover
    const handleMouseEnter = useCallback(() => setIsAutoPlaying(false), [])
    const handleMouseLeave = useCallback(() => setIsAutoPlaying(true), [])

    // Touch/swipe support
    const handleTouchStart = (e: React.TouchEvent) => {
        setTouchStart(e.targetTouches[0].clientX)
    }

    const handleTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX)
    }

    const handleTouchEnd = () => {
        if (!touchStart || !touchEnd) return

        const distance = touchStart - touchEnd
        const isLeftSwipe = distance > 50
        const isRightSwipe = distance < -50

        if (isLeftSwipe) {
            isRtl ? prevSlide() : nextSlide()
        }
        if (isRightSwipe) {
            isRtl ? nextSlide() : prevSlide()
        }

        setTouchStart(0)
        setTouchEnd(0)
    }

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft") {
                isRtl ? nextSlide() : prevSlide()
            } else if (e.key === "ArrowRight") {
                isRtl ? prevSlide() : nextSlide()
            }
        }

        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [nextSlide, prevSlide, isRtl])

    // Reduced motion support
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
    useEffect(() => {
        setPrefersReducedMotion(
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        )
    }, [])

    return (
        <section
            className="relative w-full pt-8 pb-4 md:pt-12 md:pb-6"
            aria-label="Hero slideshow"
            role="region"
            suppressHydrationWarning
        >
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div
                    className="relative w-full h-[500px] sm:h-[550px] md:h-[600px] lg:h-[650px] xl:h-[700px] overflow-hidden rounded-2xl md:rounded-3xl shadow-2xl"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                >
                    {/* Slides */}
                    {slides.map((slide, index) => (
                        <HeroSlide
                            key={slide.id}
                            slide={slide}
                            isActive={currentSlide === index}
                            language={language}
                            isRtl={isRtl}
                        />
                    ))}

                    {/* Navigation Arrows - Hidden on mobile, visible on tablet+ */}
                    <div className="absolute inset-0 pointer-events-none z-20">
                        <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-full">
                            <div className="flex items-center justify-between h-full">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={prevSlide}
                                    className="pointer-events-auto hidden md:flex h-10 w-10 md:h-12 md:w-12 lg:h-14 lg:w-14 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 hover:scale-110 transition-all duration-300 shadow-lg"
                                    aria-label="Previous slide"
                                >
                                    <ChevronLeft className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7" aria-hidden="true" />
                                </Button>

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={nextSlide}
                                    className="pointer-events-auto hidden md:flex h-10 w-10 md:h-12 md:w-12 lg:h-14 lg:w-14 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 hover:scale-110 transition-all duration-300 shadow-lg"
                                    aria-label="Next slide"
                                >
                                    <ChevronRight className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7" aria-hidden="true" />
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Dot Indicators - Larger and more accessible on mobile */}
                    <div className="absolute bottom-4 md:bottom-6 left-0 right-0 flex justify-center gap-2 md:gap-2.5 z-20 px-4">
                        {slides.map((_, index) => (
                            <button
                                key={index}
                                onClick={() => goToSlide(index)}
                                className={`h-2.5 md:h-2 rounded-full transition-all duration-300 touch-manipulation ${currentSlide === index
                                    ? "w-10 md:w-8 bg-white shadow-lg"
                                    : "w-2.5 md:w-2 bg-white/50 hover:bg-white/75"
                                    }`}
                                aria-label={`Go to slide ${index + 1}`}
                                aria-current={currentSlide === index ? "true" : "false"}
                            />
                        ))}
                    </div>

                    {/* Autoplay indicator (optional) */}
                    {isAutoPlaying && !prefersReducedMotion && (
                        <div className="absolute top-4 right-4 z-20">
                            <div className="px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-xs font-medium">
                                Auto
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}
