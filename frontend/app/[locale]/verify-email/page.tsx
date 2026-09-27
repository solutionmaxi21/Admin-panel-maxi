"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { CheckCircle, XCircle, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { useAuth } from "@/lib/auth-context"
import { useLanguage } from "@/lib/language-context"

function VerifyContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const { verifyEmail } = useAuth()
  const { language } = useLanguage()

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState("")

  const txt = {
    fr: {
      verifying: "Vérification de votre email...",
      success: "Email Vérifié !",
      successDesc: "Votre compte est maintenant actif. Vous pouvez vous connecter.",
      error: "Échec de la vérification",
      errorDesc: "Le lien est invalide ou a expiré.",
      login: "Se connecter",
      home: "Retour à l'accueil"
    },
    ar: {
      verifying: "جاري التحقق من بريدك الإلكتروني...",
      success: "تم تأكيد البريد الإلكتروني!",
      successDesc: "حسابك نشط الآن. يمكنك تسجيل الدخول.",
      error: "فشل التحقق",
      errorDesc: "الرابط غير صالح أو منتهي الصلاحية.",
      login: "تسجيل الدخول",
      home: "العودة للرئيسية"
    }
  }[language === 'ar' ? 'ar' : 'fr']

  useEffect(() => {
    if (!token) {
      setStatus('error')
      return
    }

    const doVerify = async () => {
      const result = await verifyEmail(token)
      if (result.success) {
        setStatus('success')
      } else {
        setStatus('error')
        setMessage(result.error || "")
      }
    }

    doVerify()
  }, [token, verifyEmail])

  return (
    <div className="w-full max-w-md bg-card rounded-2xl border border-border p-8 shadow-lg text-center">
      
      {status === 'loading' && (
        <>
          <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-semibold">{txt.verifying}</h2>
        </>
      )}

      {status === 'success' && (
        <>
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold mb-2">{txt.success}</h2>
          <p className="text-muted-foreground mb-6">{txt.successDesc}</p>
          <Button asChild className="w-full">
            <Link href="/login">{txt.login}</Link>
          </Button>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold mb-2">{txt.error}</h2>
          <p className="text-muted-foreground mb-6">{message || txt.errorDesc}</p>
          <Button asChild variant="outline" className="w-full">
            <Link href="/">{txt.home}</Link>
          </Button>
        </>
      )}
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <Suspense fallback={<div>Loading...</div>}>
          <VerifyContent />
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}