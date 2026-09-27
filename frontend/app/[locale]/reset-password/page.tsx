"use client"

import { useState, Suspense } from "react" // Suspense needed for searchParams
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Lock, Eye, EyeOff, CheckCircle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { useAuth } from "@/lib/auth-context"
import { useLanguage } from "@/lib/language-context"

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const router = useRouter()
  const { resetPassword } = useAuth()
  const { language } = useLanguage()

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [completed, setCompleted] = useState(false)

  const txt = {
    fr: {
      title: "Réinitialiser le mot de passe",
      subtitle: "Créez un mot de passe fort pour votre compte",
      newPwd: "Nouveau mot de passe",
      confirmPwd: "Confirmer le mot de passe",
      submit: "Changer le mot de passe",
      submitting: "Mise à jour...",
      success: "Mot de passe mis à jour !",
      loginNow: "Se connecter maintenant",
      errorMatch: "Les mots de passe ne correspondent pas",
      errorWeak: "8+ caractères, majuscule, minuscule et chiffre requis",
      errorToken: "Lien invalide ou expiré"
    },
    ar: {
      title: "تعيين كلمة مرور جديدة",
      subtitle: "قم بإنشاء كلمة مرور قوية لحسابك",
      newPwd: "كلمة المرور الجديدة",
      confirmPwd: "تأكيد كلمة المرور",
      submit: "تغيير كلمة المرور",
      submitting: "جاري التحديث...",
      success: "تم تحديث كلمة المرور!",
      loginNow: "تسجيل الدخول الآن",
      errorMatch: "كلمات المرور غير متطابقة",
      errorWeak: "كلمة المرور ضعيفة (يجب أن تكون 8 أحرف وأرقام وحروف)",
      errorToken: "الرابط غير صالح أو منتهي الصلاحية"
    }
  }[language === 'ar' ? 'ar' : 'fr']

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!token) {
      toast.error(txt.errorToken)
      return
    }
    if (password !== confirmPassword) {
      toast.error(txt.errorMatch)
      return
    }
    // Strong password regex (Backend Requirement)
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) {
      toast.error(txt.errorWeak)
      return
    }

    setLoading(true)
    const result = await resetPassword(token, password)
    
    if (result.success) {
      setCompleted(true)
      toast.success(txt.success)
    } else {
      toast.error(result.error || txt.errorToken)
    }
    setLoading(false)
  }

  if (completed) {
    return (
      <div className="w-full max-w-md bg-card rounded-2xl border border-border p-8 shadow-lg text-center">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold mb-2">{txt.success}</h1>
        <div className="mt-6">
          <Button asChild className="w-full">
            <Link href="/login">{txt.loginNow}</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md bg-card rounded-2xl border border-border p-8 shadow-lg">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold">{txt.title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{txt.subtitle}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>{txt.newPwd}</Label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={language === 'ar' ? 'pl-10' : 'pr-10'}
            />
            <button
              type="button"
              className={`absolute top-1/2 -translate-y-1/2 text-muted-foreground ${language === 'ar' ? 'left-3' : 'right-3'}`}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{txt.confirmPwd}</Label>
          <Input
            type={showPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? txt.submitting : txt.submit}
        </Button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <Suspense fallback={<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>}>
          <ResetPasswordContent />
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}