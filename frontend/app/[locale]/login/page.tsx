"use client"

import type React from "react"
import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Mail, Lock, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import { useGoogleLogin, type TokenResponse } from "@react-oauth/google"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { useAuth } from "@/lib/auth-context"
import { useLanguage } from "@/lib/language-context"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorDialog, setErrorDialog] = useState({ open: false, message: "" })
  const { login, googleLogin, resendVerification } = useAuth() // <--- Get googleLogin
  const { t, language } = useLanguage()
  const router = useRouter()
  const [showResend, setShowResend] = useState(false) // New state
  const localT = {
    fr: {
      welcomeBack: "Bon retour!",
      loginFailed: "Échec de la connexion",
      welcome: "Bienvenue",
      subtitle: "Connectez-vous à votre compte Solution Maxi",
      email: "Email",
      password: "Mot de passe",
      forgotPassword: "Mot de passe oublié ?",
      passwordPlaceholder: "Entrez votre mot de passe",
      loggingIn: "Connexion...",
      loginBtn: "Se Connecter",
      noAccount: "Vous n'avez pas de compte ?",
      createAccount: "Créer un compte",
      or: "Ou continuer avec",
      googleError: "La connexion Google a échoué"
    },
    ar: {
      welcomeBack: "مرحباً بعودتك!",
      loginFailed: "فشل تسجيل الدخول",
      welcome: "مرحباً بك",
      subtitle: "سجل الدخول إلى حسابك في Solution Maxi",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      forgotPassword: "نسيت كلمة المرور؟",
      passwordPlaceholder: "أدخل كلمة المرور",
      loggingIn: "جاري تسجيل الدخول...",
      loginBtn: "تسجيل الدخول",
      noAccount: "ليس لديك حساب؟",
      createAccount: "إنشاء حساب",
      or: "أو تابع باستخدام",
      googleError: "فشل تسجيل الدخول عبر Google"
    }
  }

  const txt = localT[language === 'ar' ? 'ar' : 'fr']

  // Handle Standard Login
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setShowResend(false)
    const result = await login(email, password)
    if (result.success) {
      toast.success(txt.welcomeBack)
      router.push(`/${language}`)
      router.refresh()
    } else {
      //const errorMessage = result.error || txt.loginFailed
      //setErrorDialog({ open: true, message: errorMessage })

      if (result.error?.includes("verify") || result.error?.includes("vérifiez")) {
        setShowResend(true)
        setErrorDialog({ open: true, message: result.error })
      } else {
        setErrorDialog({ open: true, message: result.error || txt.loginFailed })
      }

    }
    setLoading(false)
  }


  const handleResend = async () => {
    await resendVerification(email)
    toast.success("Nouveau lien envoyé !")
    setShowResend(false)
    setErrorDialog({ open: false, message: "" }) // Close dialog
  }

  // Handle Google Login
  const handleGoogleLogin = useGoogleLogin({
    // 2. Add the type here
    onSuccess: async (tokenResponse: TokenResponse) => {
      setLoading(true);
      try {
        // 3. Send the access_token to your backend
        const result = await googleLogin(tokenResponse.access_token);

        if (result.success) {
          toast.success(txt.welcomeBack);
          router.push(`/${language}`);
          router.refresh();
        } else {
          setErrorDialog({ open: true, message: result.error || txt.googleError });
        }
      } catch (err) {
        setErrorDialog({ open: true, message: txt.googleError });
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      setErrorDialog({ open: true, message: txt.googleError });
    }
  });



  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
      <Header />

      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-3xl border border-border/50 p-8 md:p-10 shadow-2xl shadow-primary/5 backdrop-blur-sm">

            {/* Header Section */}
            <div className="text-center mb-10">
              <div className="flex items-center justify-center mx-auto mb-5">
                <Image
                  src="/logo.jpg"
                  alt="Solution Maxi Logo"
                  width={140}
                  height={45}
                  className="h-12 w-auto object-contain"
                  priority
                />
              </div>
              <h1 className="text-3xl font-bold mb-2">{txt.welcome}</h1>
              <p className="text-muted-foreground">{txt.subtitle}</p>
            </div>

            <div className="space-y-5">              {/* Email Input */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">{t.auth.email}</Label>
                <div className="relative">
                  <Mail className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${language === 'ar' ? 'right-3' : 'left-3'}`} />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`${language === 'ar' ? 'pr-10' : 'pl-10'} h-11 transition-all duration-200 focus:ring-2 focus:ring-primary/20`}
                    style={{ direction: 'ltr', textAlign: 'left' }}
                    required
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">{t.auth.password}</Label>
                <div className="relative">
                  <Lock className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${language === 'ar' ? 'right-3' : 'left-3'}`} />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${language === 'ar' ? 'pr-10 pl-10' : 'pl-10 pr-10'} h-11 transition-all duration-200 focus:ring-2 focus:ring-primary/20`}
                    style={{ direction: 'ltr', textAlign: 'left' }}
                    required
                  />
                  <button
                    type="button"
                    className={`absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors ${language === 'ar' ? 'left-3' : 'right-3'}`}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="text-center mt-3">
                  <Link href="/forgot-password" className="text-sm text-primary hover:underline font-medium transition-colors">
                    {t.auth.forgotPassword}
                  </Link>
                </div>
              </div>

              {/* Login Button */}
              <Button
                onClick={handleSubmit}
                className="w-full h-12 bg-primary hover:bg-primary/90 font-medium text-base shadow-lg shadow-primary/20 transition-all duration-200 hover:shadow-xl hover:shadow-primary/30"
                disabled={loading}
              >
                {loading ? txt.loggingIn : txt.loginBtn}
                <ArrowRight className={`h-5 w-5 ${language === 'ar' ? 'mr-2 rotate-180' : 'ml-2'}`} />
              </Button>
            </div>

            {/* Divider */}
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/60" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-3 text-muted-foreground font-medium">
                  {txt.or}
                </span>
              </div>
            </div>

            {/* Google Button */}
            <Button
              variant="outline"
              className="w-full h-12 font-medium text-base bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300 text-gray-700 transition-all duration-200 shadow-sm hover:shadow-md"
              onClick={() => handleGoogleLogin()}
            >
              <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continue with Google
            </Button>

            {/* Signup Link */}
            <div className="mt-8 text-center">
              <p className="text-sm text-muted-foreground">
                {txt.noAccount}{" "}
                <Link href="/signup" className="text-primary font-semibold hover:underline transition-colors">
                  {txt.createAccount}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>

      <Footer />



      <AlertDialog open={errorDialog.open} onOpenChange={(open) => setErrorDialog({ ...errorDialog, open })}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Erreur de connexion</AlertDialogTitle>
            <AlertDialogDescription>{errorDialog.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {showResend ? (
              <div className="flex gap-2 w-full justify-end">
                <Button variant="ghost" onClick={() => setErrorDialog({ ...errorDialog, open: false })}>
                  Annuler
                </Button>
                <Button onClick={handleResend}>
                  Renvoyer l'email
                </Button>
              </div>
            ) : (
              <AlertDialogAction>OK</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Error Dialog 
      <AlertDialog open={errorDialog.open} onOpenChange={(open) => setErrorDialog({ ...errorDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.alertDialogs.loginError.title}</AlertDialogTitle>
            <AlertDialogDescription>{errorDialog.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>{t.alertDialogs.common.ok}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>*/}
    </div>
  )
}