import type React from "react"
import type { Metadata } from "next"
import Script from "next/script"
import { Inter, Cairo } from "next/font/google"
import "../globals.css"
import { CartProvider } from "@/lib/cart-context"
import { AuthProvider } from "@/lib/auth-context"
import { WishlistProvider } from "@/lib/wishlist-context"
import { LanguageProvider } from "@/lib/language-context"
import { Toaster } from "@/components/ui/sonner"
import { OfflineInitializer } from "@/components/offline-initializer"
import { SyncStatusIndicator } from "@/components/sync-status-indicator"
import { ThemeProvider } from "@/components/theme-provider"

// Import the wrapper we just created
import { GoogleProvider } from "@/components/google-provider"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const cairo = Cairo({ subsets: ["arabic"], variable: "--font-cairo" })

type Locale = 'fr' | 'ar'

const locales: Locale[] = ['fr', 'ar']

/** Les segments d'URL arrivent en `string` : on les ramene a une locale connue. */
function toLocale(value: string | undefined): Locale {
  return value === 'ar' ? 'ar' : 'fr'
}

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: rawLocale } = await params

  const titles = {
    fr: "Maxi Store - Matériel Informatique Algérie",
    ar: "ماكسي ستور - معدات الكمبيوتر الجزائر"
  }

  const descriptions = {
    fr: "Achetez le meilleur matériel informatique, composants et accessoires en Algérie.",
    ar: "اشترِ أفضل معدات الكمبيوتر والمكونات والملحقات في الجزائر."
  }

  const locale = toLocale(rawLocale)

  return {
    title: titles[locale],
    description: descriptions[locale],
    icons: {
      icon: "/icon.jpg",
      shortcut: "/icon.jpg",
      apple: "/icon.jpg",
    },
    manifest: "/manifest.json",
    alternates: {
      languages: {
        'fr': '/fr',
        'ar': '/ar',
      },
    },
  }
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#2563eb",
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }>
}>) {
  const { locale: rawLocale } = await params
  const locale = toLocale(rawLocale)
  const dir = locale === 'ar' ? 'rtl' : 'ltr'

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        <link rel="alternate" hrefLang="fr" href={`/fr`} />
        <link rel="alternate" hrefLang="ar" href={`/ar`} />
        <link rel="alternate" hrefLang="x-default" href={`/fr`} />
        <Script
          src="/sw-register.js"
          strategy="afterInteractive"
          async
        />
      </head>
      <body className={`font-sans antialiased ${inter.variable} ${cairo.variable}`}>
        <GoogleProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <LanguageProvider initialLocale={locale}>
              <AuthProvider>
                <WishlistProvider>
                  <CartProvider>
                    <OfflineInitializer />
                    {children}
                    <Toaster position="top-right" />
                    <SyncStatusIndicator />
                  </CartProvider>
                </WishlistProvider>
              </AuthProvider>
            </LanguageProvider>
          </ThemeProvider>
        </GoogleProvider>
      </body>
    </html>
  )
}