"use client"

import { useState } from "react"
import Link from "next/link"
import { Mail, ArrowRight, ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { useAuth } from "@/lib/auth-context"
import { useLanguage } from "@/lib/language-context"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")
  
  const { forgotPassword } = useAuth()
  const { language } = useLanguage()

  const txt = {
    fr: {
      title: "Mot de passe oublié ?",
      subtitle: "Entrez votre email et nous vous enverrons un lien de réinitialisation.",
      email: "Email",
      placeholder: "exemple@email.com",
      submit: "Envoyer le lien",
      sending: "Envoi en cours...",
      back: "Retour à la connexion",
      successTitle: "Email envoyé !",
      successDesc: "Si un compte existe avec cet email, vous recevrez un lien de réinitialisation.",
      retry: "Renvoyer l'email"
    },
    ar: {
      title: "نسيت كلمة المرور؟",
      subtitle: "أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة تعيين كلمة المرور.",
      email: "البريد الإلكتروني",
      placeholder: "exemple@email.com",
      submit: "إرسال الرابط",
      sending: "جاري الإرسال...",
      back: "العودة لتسجيل الدخول",
      successTitle: "تم الإرسال!",
      successDesc: "إذا كان الحساب موجوداً، ستتلقى رابط إعادة التعيين قريباً.",
      retry: "إعادة الإرسال"
    }
  }[language === 'ar' ? 'ar' : 'fr']

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setSuccessMessage("")

    const result = await forgotPassword(email)
    
    // Security Best Practice: Always show success even if email doesn't exist (prevents enumeration)
    if (result.success) {
      setSuccessMessage(txt.successDesc)
      toast.success(txt.successTitle)
    } else {
      // Only show error if it's a network/server crash
      toast.error(result.error || "Une erreur est survenue")
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md bg-card rounded-2xl border border-border p-8 shadow-lg">
          
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold">{txt.title}</h1>
            <p className="text-muted-foreground mt-2 text-sm">{txt.subtitle}</p>
          </div>

          {!successMessage ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{txt.email}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={txt.placeholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={language === 'ar' ? 'text-right' : ''}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? txt.sending : txt.submit}
                <ArrowRight className={`h-4 w-4 ${language === 'ar' ? 'mr-2 rotate-180' : 'ml-2'}`} />
              </Button>
            </form>
          ) : (
            <div className="text-center space-y-4 bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-900">
              <p className="text-sm text-green-800 dark:text-green-200">{successMessage}</p>
              <Button variant="outline" onClick={() => setSuccessMessage("")} size="sm">
                {txt.retry}
              </Button>
            </div>
          )}

          <div className="mt-6 text-center">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-primary flex items-center justify-center gap-2">
              <ArrowLeft className={`h-4 w-4 ${language === 'ar' ? 'rotate-180' : ''}`} />
              {txt.back}
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}