"use client"

import { useLanguage } from "@/lib/language-context"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Home } from "lucide-react"

export default function NotFound() {
    const { t, language } = useLanguage()

    return (
        <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-1 flex items-center justify-center py-20">
                <div className="container px-4 text-center">
                    <h1 className="text-9xl font-bold text-primary mb-4">404</h1>
                    <h2 className="text-3xl font-semibold mb-4">{t.common.pageNotFound}</h2>
                    <p className="text-muted-foreground text-lg mb-8 max-w-md mx-auto">
                        {t.common.pageNotFoundMsg}
                    </p>
                    <Link href="/">
                        <Button size="lg">
                            <Home className={`h-5 w-5 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
                            {t.productPage?.home || "Home"}
                        </Button>
                    </Link>
                </div>
            </main>
            <Footer />
        </div>
    )
}
