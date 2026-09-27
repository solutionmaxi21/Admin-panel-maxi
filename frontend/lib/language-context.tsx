"use client"

import React, { createContext, useContext, useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { translations as fr } from "./translations"
import { translationsAr as ar } from "./translations-ar"
import { TranslationSchema } from "./translations"

type Language = "fr" | "ar"

interface LanguageContextType {
    language: Language
    t: TranslationSchema
    setLanguage: (lang: Language) => void
    dir: "ltr" | "rtl"
}

const translationsMap: Record<Language, TranslationSchema> = {
    fr,
    ar,
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({
    children,
    initialLocale = "fr"
}: {
    children: React.ReactNode
    initialLocale?: Language
}) {
    const [language, setLanguageState] = useState<Language>(initialLocale)
    const router = useRouter()
    const pathname = usePathname()

    // Sync with URL locale on mount
    useEffect(() => {
        if (pathname) {
            const urlLocale = pathname.split('/')[1] as Language
            if (urlLocale && (urlLocale === "fr" || urlLocale === "ar") && urlLocale !== language) {
                setLanguageState(urlLocale)
            }
        }
    }, [pathname, language])

    const setLanguage = (lang: Language) => {
        // Don't do anything if we're already on this language
        if (lang === language) return

        // Update state
        setLanguageState(lang)

        // Store preference
        if (typeof window !== 'undefined') {
            localStorage.setItem("language", lang)
            document.cookie = `NEXT_LOCALE=${lang}; path=/; max-age=31536000`
        }

        // Navigate to new locale URL
        if (pathname) {
            const segments = pathname.split('/')
            segments[1] = lang
            const newPath = segments.join('/')
            // Use push for language changes
            router.push(newPath)
        }
    }

    const contextValue: LanguageContextType = {
        language,
        t: translationsMap[language] || translationsMap['fr'],
        setLanguage,
        dir: language === "ar" ? "rtl" : "ltr",
    }

    return (
        <LanguageContext.Provider value={contextValue}>
            {children}
        </LanguageContext.Provider>
    )
}

export function useLanguage() {
    const context = useContext(LanguageContext)
    if (context === undefined) {
        throw new Error("useLanguage must be used within a LanguageProvider")
    }
    return context
}
